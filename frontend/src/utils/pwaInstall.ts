import { useState, useEffect } from 'react';

export const PWA_DISMISSED_STORAGE_KEY = 'pwa-install-dismissed';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type PwaPlatform =
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-inapp'
  | 'ios-other'
  | 'android'
  | 'other-mobile'
  | 'desktop';

export interface PwaPlatformInfo {
  platform: PwaPlatform;
  isIos: boolean;
  isMobile: boolean;
}

/**
 * Classifies the current browser/device context for PWA installation guidance.
 */
export function detectPwaPlatform(
  userAgent: string,
  maxTouchPoints: number,
  userAgentDataMobile?: boolean,
  hasMSStream?: boolean
): PwaPlatformInfo {
  const ua = userAgent.toLowerCase();

  const isIos =
    (/iphone|ipad|ipod/.test(ua) && !hasMSStream) ||
    (ua.includes('mac') && maxTouchPoints > 1);

  if (isIos) {
    // 1. Detect known in-app WebViews (social, messaging, Google app)
    const isKnownInApp =
      /fban|fbav|instagram|whatsapp|linkedinapp|line\/|micromessenger|gsa\/|bytedancewebview|musical\.ly|snapchat|twitter|slack|telegram/.test(
        ua
      );

    // 2. Detect Chrome on iOS
    const isCriOS = /crios\//.test(ua);

    // 3. Detect other third-party browsers on iOS (Firefox, Edge, Opera, DuckDuckGo, Brave, Ecosia)
    const isOtherThirdPartyIos = /fxios\/|edgios\/|opios\/|opt\/|duckduckgo\/|ecosia|focus\//.test(ua);

    // 4. Generic WKWebView without Safari token (and not a third-party browser above)
    const hasSafariToken = /safari\//.test(ua);

    if (isKnownInApp || (!hasSafariToken && !isCriOS && !isOtherThirdPartyIos)) {
      return { platform: 'ios-inapp', isIos: true, isMobile: true };
    }
    if (isCriOS) {
      return { platform: 'ios-chrome', isIos: true, isMobile: true };
    }
    if (isOtherThirdPartyIos) {
      return { platform: 'ios-other', isIos: true, isMobile: true };
    }
    return { platform: 'ios-safari', isIos: true, isMobile: true };
  }

  const isAndroid = /android/.test(ua);
  if (isAndroid) {
    return { platform: 'android', isIos: false, isMobile: true };
  }

  if (userAgentDataMobile === true) {
    return { platform: 'other-mobile', isIos: false, isMobile: true };
  }

  return { platform: 'desktop', isIos: false, isMobile: false };
}

export function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function getBrowserPwaPlatformInfo(): PwaPlatformInfo {
  if (typeof window === 'undefined') {
    return { platform: 'desktop', isIos: false, isMobile: false };
  }
  const nav = window.navigator;
  const uaDataMobile = (nav as unknown as { userAgentData?: { mobile?: boolean } })?.userAgentData?.mobile;
  const hasMSStream = Boolean((window as unknown as { MSStream?: unknown }).MSStream);
  return detectPwaPlatform(nav.userAgent || '', nav.maxTouchPoints || 0, uaDataMobile, hasMSStream);
}

export interface PwaInstallSnapshot {
  isDismissed: boolean;
  isStandalone: boolean;
  isInstalled: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
  platformInfo: PwaPlatformInfo;
}

class PwaInstallStore {
  private listeners = new Set<() => void>();
  private initialized = false;
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private isInstalled = false;

  public init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.notify();
    });

    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.deferredPrompt = null;
      this.notify();
    });

    try {
      const mql = window.matchMedia('(display-mode: standalone)');
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', () => this.notify());
      }
    } catch {
      // ignore matchMedia listener errors
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.init();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public getSnapshot(): PwaInstallSnapshot {
    this.init();
    let isDismissed = false;
    if (typeof window !== 'undefined') {
      try {
        isDismissed = localStorage.getItem(PWA_DISMISSED_STORAGE_KEY) === 'true';
      } catch {
        isDismissed = false;
      }
    }
    return {
      isDismissed,
      isStandalone: checkIsStandalone(),
      isInstalled: this.isInstalled,
      deferredPrompt: this.deferredPrompt,
      platformInfo: getBrowserPwaPlatformInfo(),
    };
  }

  public dismiss() {
    try {
      localStorage.setItem(PWA_DISMISSED_STORAGE_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    this.notify();
  }

  public async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) return false;
    const promptEvent = this.deferredPrompt;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      this.deferredPrompt = null;
      if (choice.outcome === 'accepted') {
        this.isInstalled = true;
        this.notify();
        return true;
      }
      this.notify();
      return false;
    } catch (err) {
      console.error('Install prompt error:', err);
      this.deferredPrompt = null;
      this.notify();
      return false;
    }
  }
}

export const pwaInstallStore = new PwaInstallStore();

if (typeof window !== 'undefined') {
  pwaInstallStore.init();
}

export function usePwaInstallState(): PwaInstallSnapshot {
  const [state, setState] = useState<PwaInstallSnapshot>(() => pwaInstallStore.getSnapshot());

  useEffect(() => {
    setState(pwaInstallStore.getSnapshot());
    return pwaInstallStore.subscribe(() => {
      setState(pwaInstallStore.getSnapshot());
    });
  }, []);

  return state;
}
