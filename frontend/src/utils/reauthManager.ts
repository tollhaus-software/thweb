export type ReauthStatus = 'idle' | 'opening_popup' | 'popup_active' | 'success' | 'error';
export type DiagnosticDialogType = 'reauth' | 'no_network' | 'internal_error';

export interface ReauthState {
  isOpen: boolean;
  dialogType: DiagnosticDialogType;
  status: ReauthStatus;
  errorMessage: string | null;
  popupBlocked: boolean;
  failedUrl?: string;
  errorDetail?: string;
}

interface QueuedRequest {
  retry: () => Promise<Response>;
  resolve: (res: Response) => void;
  reject: (err: unknown) => void;
}

class ReauthManager {
  private state: ReauthState = {
    isOpen: false,
    dialogType: 'reauth',
    status: 'idle',
    errorMessage: null,
    popupBlocked: false,
  };

  private listeners: Set<(state: ReauthState) => void> = new Set();
  private queue: QueuedRequest[] = [];
  private activePopup: Window | null = null;
  private popupPollTimer: number | null = null;
  private isInterceptorInstalled = false;
  private getIsAuthenticated: () => boolean = () => false;
  private getAuthToken: () => string | null = () => null;
  private refreshUserFn: (() => Promise<void>) | null = null;
  private activeDiagnosticPromise: Promise<{
    unauthOk: boolean;
    authProbe: 'ok' | 'auth_failed' | 'server_error' | 'network_failed';
  }> | null = null;

  public subscribe(listener: (state: ReauthState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): ReauthState {
    return { ...this.state };
  }

  private updateState(partial: Partial<ReauthState>) {
    this.state = {
      ...this.state,
      ...partial,
    };
    this.listeners.forEach((listener) => listener(this.getState()));
  }

  public configure(options: {
    getIsAuthenticated: () => boolean;
    getAuthToken: () => string | null;
    refreshUser: () => Promise<void>;
  }) {
    this.getIsAuthenticated = options.getIsAuthenticated;
    this.getAuthToken = options.getAuthToken;
    this.refreshUserFn = options.refreshUser;
    this.installInterceptor();
  }

  public promptReauth(errorMsg?: string) {
    if (!this.state.isOpen || this.state.dialogType !== 'reauth') {
      this.updateState({
        isOpen: true,
        dialogType: 'reauth',
        status: 'idle',
        errorMessage: errorMsg || null,
        popupBlocked: false,
        failedUrl: undefined,
        errorDetail: undefined,
      });
    }
  }

  public promptNetworkError(errorMsg?: string) {
    this.updateState({
      isOpen: true,
      dialogType: 'no_network',
      status: 'idle',
      errorMessage: errorMsg || null,
      popupBlocked: false,
      failedUrl: undefined,
      errorDetail: undefined,
    });
  }

  public promptInternalError(url: string, errorDetail?: string) {
    this.updateState({
      isOpen: true,
      dialogType: 'internal_error',
      status: 'idle',
      errorMessage: null,
      popupBlocked: false,
      failedUrl: url,
      errorDetail,
    });
  }

  public handleReportFeedback() {
    const failedUrl = this.state.failedUrl;
    const errorDetail = this.state.errorDetail;
    this.updateState({
      isOpen: false,
      dialogType: 'reauth',
      status: 'idle',
      errorMessage: null,
      popupBlocked: false,
      failedUrl: undefined,
      errorDetail: undefined,
    });
    if (typeof window !== 'undefined') {
      const description = failedUrl
        ? `Interner Serverfehler beim Aufruf von ${failedUrl}.\n\nDetails: ${errorDetail || 'Keine Antwort erhalten (net::ERR_EMPTY_RESPONSE oder Server-Abbruch).'}`
        : 'Interner Serverfehler aufgetreten.';
      window.dispatchEvent(
        new CustomEvent('thweb:open-feedback', {
          detail: {
            type: 'Fehlermeldung',
            description,
          },
        })
      );
    }
  }

  public handleClose() {
    this.updateState({
      isOpen: false,
      dialogType: 'reauth',
      status: 'idle',
      errorMessage: null,
      popupBlocked: false,
      failedUrl: undefined,
      errorDetail: undefined,
    });
  }

  public async handleRetry() {
    this.updateState({ status: 'opening_popup', errorMessage: null });
    const { unauthOk, authProbe } = await this.runDiagnostics(window.fetch);
    if (!unauthOk) {
      this.updateState({ status: 'idle', errorMessage: 'still_offline' });
      return;
    }
    if (authProbe === 'auth_failed') {
      this.updateState({
        dialogType: 'reauth',
        status: 'idle',
        errorMessage: null,
      });
      return;
    }
    await this.handleSuccess();
  }

  public async runDiagnostics(originalFetch: typeof window.fetch): Promise<{
    unauthOk: boolean;
    authProbe: 'ok' | 'auth_failed' | 'server_error' | 'network_failed';
  }> {
    if (this.activeDiagnosticPromise) {
      return this.activeDiagnosticPromise;
    }

    this.activeDiagnosticPromise = (async () => {
      try {
        const unauthPromise = this.runUnauthProbe(originalFetch);
        const authPromise = this.runAuthProbe(originalFetch);
        const [unauthOk, authProbe] = await Promise.all([unauthPromise, authPromise]);
        return { unauthOk, authProbe };
      } finally {
        this.activeDiagnosticPromise = null;
      }
    })();

    return this.activeDiagnosticPromise;
  }

  private async runUnauthProbe(originalFetch: typeof window.fetch): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await originalFetch(`/favicon.svg?_ping=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok || (res.status > 0 && res.status < 500);
    } catch {
      return false;
    }
  }

  private async runAuthProbe(
    originalFetch: typeof window.fetch
  ): Promise<'ok' | 'auth_failed' | 'server_error' | 'network_failed'> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const headers: Record<string, string> = {
        'X-Skip-Reauth': 'true',
      };
      const token = this.getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await originalFetch(`/api/me?_probe=${Date.now()}`, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        return 'ok';
      }
      if (res.status === 401 || (res.status === 403 && (res.headers.get('content-type') || '').includes('text/html'))) {
        return 'auth_failed';
      }
      if (res.status >= 500) {
        return 'server_error';
      }
      return 'auth_failed';
    } catch {
      return 'auth_failed';
    }
  }

  public launchPopup(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.updateState({
        status: 'opening_popup',
        errorMessage: null,
        popupBlocked: false,
      });

      const width = 520;
      const height = 650;
      const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

      const targetUrl = '/oauth2/start?rd=/auth-callback.html';

      const popup = window.open(
        targetUrl,
        'thweb_reauth_popup',
        `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,status=no,resizable=yes`
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        this.updateState({
          status: 'error',
          popupBlocked: true,
          errorMessage: 'popupBlocked',
        });
        reject(new Error('Popup blocked'));
        return;
      }

      this.activePopup = popup;
      this.updateState({ status: 'popup_active' });

      let finished = false;
      const triggerSuccess = () => {
        if (finished) return;
        finished = true;
        cleanup();
        this.handleSuccess()
          .then(() => resolve())
          .catch(reject);
      };

      const cleanup = () => {
        if (this.popupPollTimer !== null) {
          window.clearInterval(this.popupPollTimer);
          this.popupPollTimer = null;
        }
        window.removeEventListener('message', messageHandler);
        window.removeEventListener('storage', storageHandler);
        if (bc) {
          try {
            bc.close();
          } catch {
            // ignore
          }
          bc = null;
        }
        if (this.activePopup && !this.activePopup.closed) {
          try {
            this.activePopup.close();
          } catch {
            // ignore
          }
        }
        this.activePopup = null;
      };

      // 1. BroadcastChannel listener (survives cross-origin COOP opener severing)
      let bc: BroadcastChannel | null = null;
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          bc = new BroadcastChannel('thweb_auth_channel');
          bc.onmessage = (event) => {
            if (event.data?.type === 'THWEB_REAUTH_SUCCESS') {
              triggerSuccess();
            }
          };
        } catch {
          // ignore
        }
      }

      // 2. Storage event listener (fallback across tabs/windows on same origin)
      const storageHandler = (event: StorageEvent) => {
        if (event.key === 'thweb_reauth_event') {
          triggerSuccess();
        }
      };
      window.addEventListener('storage', storageHandler);

      // 3. postMessage listener (if window.opener was preserved)
      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'THWEB_REAUTH_SUCCESS') {
          triggerSuccess();
        }
      };
      window.addEventListener('message', messageHandler);

      // 4. Poll timer: check /api/me periodically AND check if popup was closed
      let pollCount = 0;
      this.popupPollTimer = window.setInterval(async () => {
        if (finished) return;
        pollCount++;

        // Every ~1.5s (pollCount % 3 === 0) check if the session is already active
        if (pollCount % 3 === 0) {
          try {
            const check = await window.fetch('/api/me', {
              headers: { 'X-Skip-Reauth': 'true' },
            });
            if (check.ok) {
              triggerSuccess();
              return;
            }
          } catch {
            // ignore
          }
        }

        if (popup.closed) {
          cleanup();
          // Final verification if session was established despite missing postMessage/channel
          try {
            const check = await window.fetch('/api/me', {
              headers: { 'X-Skip-Reauth': 'true' },
            });
            if (check.ok) {
              await this.handleSuccess();
              resolve();
              return;
            }
          } catch {
            // ignore
          }

          this.updateState({
            status: 'idle',
            errorMessage: 'popupClosed',
          });
          reject(new Error('Popup closed'));
        }
      }, 500);
    });
  }

  public async handleMockLogin(email: string, loginFn: (email: string) => void) {
    this.updateState({ status: 'opening_popup', errorMessage: null });
    loginFn(email);
    await this.handleSuccess();
  }

  public async handleSuccess() {
    this.updateState({ status: 'success' });

    // Refresh user in AuthContext to pick up the new session
    if (this.refreshUserFn) {
      try {
        await this.refreshUserFn();
      } catch (err) {
        console.error('[AUTH] Failed to refresh user after re-auth:', err);
      }
    }

    // Flush and replay queued requests
    const currentQueue = [...this.queue];
    this.queue = [];

    for (const item of currentQueue) {
      try {
        const retriedResponse = await item.retry();
        item.resolve(retriedResponse);
      } catch (err) {
        item.reject(err);
      }
    }

    // Close the re-auth dialog
    this.updateState({
      isOpen: false,
      dialogType: 'reauth',
      status: 'idle',
      errorMessage: null,
      popupBlocked: false,
      failedUrl: undefined,
      errorDetail: undefined,
    });
  }

  public handleCancel(logoutFn?: () => void) {
    if (this.activePopup && !this.activePopup.closed) {
      try {
        this.activePopup.close();
      } catch {
        // ignore
      }
      this.activePopup = null;
    }

    // Reject all queued requests
    const currentQueue = [...this.queue];
    this.queue = [];
    currentQueue.forEach((item) => item.reject(new Error('Session expired and re-authentication cancelled')));

    this.updateState({
      isOpen: false,
      dialogType: 'reauth',
      status: 'idle',
      errorMessage: null,
      popupBlocked: false,
      failedUrl: undefined,
      errorDetail: undefined,
    });

    if (logoutFn) {
      logoutFn();
    }
  }

  private installInterceptor() {
    if (this.isInterceptorInstalled || typeof window === 'undefined') return;
    this.isInterceptorInstalled = true;

    const originalFetch = window.fetch;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let url = '';
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input instanceof Request) {
        url = input.url;
      }

      const isApiCall = url.startsWith('/api/') || url.includes('/api/');

      let skipReauth = false;
      const headers = init?.headers;
      if (headers) {
        if (headers instanceof Headers) {
          skipReauth = headers.get('X-Skip-Reauth') === 'true';
        } else if (Array.isArray(headers)) {
          skipReauth = headers.some(([k, v]) => k.toLowerCase() === 'x-skip-reauth' && v === 'true');
        } else if (typeof headers === 'object') {
          skipReauth = (headers as Record<string, string>)['X-Skip-Reauth'] === 'true';
        }
      }

      // Defensive sanitization: Never transmit "Bearer null" or "Bearer undefined" to the backend
      let sanitizedInit = init;
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          const auth = init.headers.get('Authorization') || init.headers.get('authorization');
          if (auth === 'Bearer null' || auth === 'Bearer undefined' || auth === 'Bearer ') {
            init.headers.delete('Authorization');
            init.headers.delete('authorization');
          }
        } else if (Array.isArray(init.headers)) {
          sanitizedInit = {
            ...init,
            headers: init.headers.filter(([k, v]) => {
              if (k.toLowerCase() === 'authorization') {
                return v !== 'Bearer null' && v !== 'Bearer undefined' && v !== 'Bearer ';
              }
              return true;
            }),
          };
        } else if (typeof init.headers === 'object') {
          const rawHeaders = { ...(init.headers as Record<string, string>) };
          let changed = false;
          for (const key of Object.keys(rawHeaders)) {
            if (key.toLowerCase() === 'authorization') {
              const val = rawHeaders[key];
              if (val === 'Bearer null' || val === 'Bearer undefined' || val === 'Bearer ') {
                delete rawHeaders[key];
                changed = true;
              }
            }
          }
          if (changed) {
            sanitizedInit = { ...init, headers: rawHeaders };
          }
        }
      }

      if (isApiCall) {
        const win = window as unknown as { __THWEB_APP_VIEW__?: string; __KIOSK_MODE__?: boolean };
        const isDash =
          win.__THWEB_APP_VIEW__ === 'dashboard' ||
          window.location.hash.replace('#', '') === 'dashboard' ||
          window.location.port === '1443' ||
          new URLSearchParams(window.location.search).get('kiosk') === 'true' ||
          Boolean(win.__KIOSK_MODE__);
        const appView = isDash ? 'dashboard' : 'portal';

        if (!sanitizedInit) {
          sanitizedInit = { headers: { 'X-App-View': appView } };
        } else if (!sanitizedInit.headers) {
          sanitizedInit = { ...sanitizedInit, headers: { 'X-App-View': appView } };
        } else if (sanitizedInit.headers instanceof Headers) {
          if (!sanitizedInit.headers.has('X-App-View')) {
            sanitizedInit.headers.set('X-App-View', appView);
          }
        } else if (Array.isArray(sanitizedInit.headers)) {
          const hasHeader = sanitizedInit.headers.some(([k]) => k.toLowerCase() === 'x-app-view');
          if (!hasHeader) {
            sanitizedInit = {
              ...sanitizedInit,
              headers: [...sanitizedInit.headers, ['X-App-View', appView]],
            };
          }
        } else if (typeof sanitizedInit.headers === 'object') {
          const raw = sanitizedInit.headers as Record<string, string>;
          const hasHeader = Object.keys(raw).some((k) => k.toLowerCase() === 'x-app-view');
          if (!hasHeader) {
            sanitizedInit = {
              ...sanitizedInit,
              headers: { ...raw, 'X-App-View': appView },
            };
          }
        }
      }

      let response: Response;
      try {
        response = await originalFetch(input, sanitizedInit);
      } catch (err: unknown) {
        const isAbort =
          (err instanceof Error && (err.name === 'AbortError' || err.message?.includes('aborted'))) ||
          (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError') ||
          Boolean(sanitizedInit?.signal?.aborted) ||
          (input instanceof Request && input.signal?.aborted);

        if (isAbort) {
          throw err;
        }

        // Network or CORS error on an API call while logged in indicates possible network loss, session expiration, or internal error
        if (isApiCall && !skipReauth && this.getIsAuthenticated()) {
          console.warn('[AUTH] Network error on API call while authenticated, running reachability & auth diagnostics:', url, err);

          const { unauthOk, authProbe } = await this.runDiagnostics(originalFetch);

          if (!unauthOk) {
            // Case 1: unauth probe fails -> no network (or server down)
            console.warn('[AUTH] Diagnostic: Unauthenticated probe failed -> no network.');
            this.promptNetworkError();
            return this.enqueueRequest(input, sanitizedInit, originalFetch);
          } else if (authProbe === 'auth_failed') {
            // Case 2: unauth probe succeeds, but auth probe fails -> re-login needed
            console.warn('[AUTH] Diagnostic: Unauthenticated probe succeeded, but auth probe failed -> re-login needed.');
            this.promptReauth();
            return this.enqueueRequest(input, sanitizedInit, originalFetch);
          } else {
            // Case 3: both succeed (or server error) -> internal error, ask to report feedback
            console.error('[AUTH] Diagnostic: Unauth and auth probes succeeded -> internal error on request:', url, err);
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.promptInternalError(url, errorMsg);
            throw err;
          }
        }
        throw err;
      }

      // If 401 Unauthorized or 403 with HTML login page occurs on an API call while user was authenticated
      const contentType = response.headers.get('content-type') || '';
      const isHtmlForbidden = response.status === 403 && contentType.includes('text/html');

      if ((response.status === 401 || isHtmlForbidden) && isApiCall && !skipReauth && this.getIsAuthenticated()) {
        console.warn(`[AUTH] Received ${response.status} (HTML: ${isHtmlForbidden}) on API call while authenticated, queueing for re-auth:`, url);
        this.promptReauth();
        return this.enqueueRequest(input, sanitizedInit, originalFetch);
      }

      return response;
    };
  }

  private enqueueRequest(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    originalFetch: typeof window.fetch
  ): Promise<Response> {
    const signal = init?.signal || (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) {
      return Promise.reject(new DOMException('The user aborted a request.', 'AbortError'));
    }

    if (!this.state.isOpen) {
      this.promptReauth();
    }

    return new Promise<Response>((resolve, reject) => {
      let abortListener: (() => void) | null = null;
      if (signal) {
        abortListener = () => {
          this.queue = this.queue.filter((item) => item !== queueItem);
          reject(new DOMException('The user aborted a request.', 'AbortError'));
        };
        signal.addEventListener('abort', abortListener, { once: true });
      }

      const queueItem: QueuedRequest = {
        retry: async () => {
          if (signal?.aborted) {
            throw new DOMException('The user aborted a request.', 'AbortError');
          }
          const retryInit = init ? { ...init } : undefined;
          const currentToken = this.getAuthToken();
          if (currentToken && retryInit?.headers) {
            if (
              typeof retryInit.headers === 'object' &&
              !(retryInit.headers instanceof Headers) &&
              !Array.isArray(retryInit.headers)
            ) {
              (retryInit.headers as Record<string, string>)['Authorization'] = `Bearer ${currentToken}`;
            }
          } else if (!currentToken && retryInit?.headers) {
            if (
              typeof retryInit.headers === 'object' &&
              !(retryInit.headers instanceof Headers) &&
              !Array.isArray(retryInit.headers)
            ) {
              delete (retryInit.headers as Record<string, string>)['Authorization'];
              delete (retryInit.headers as Record<string, string>)['authorization'];
            }
          }
          return originalFetch(input, retryInit);
        },
        resolve: (res) => {
          if (abortListener && signal) {
            signal.removeEventListener('abort', abortListener);
          }
          resolve(res);
        },
        reject: (err) => {
          if (abortListener && signal) {
            signal.removeEventListener('abort', abortListener);
          }
          reject(err);
        },
      };

      this.queue.push(queueItem);
    });
  }
}

export const reauthManager = new ReauthManager();
