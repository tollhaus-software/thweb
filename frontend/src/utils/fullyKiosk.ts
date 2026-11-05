export interface FullyKioskApi {
  turnScreenOn?: () => void;
  stopScreensaver?: () => void;
  stopDaydream?: () => void;
  bringToForeground?: () => void;
  startScreensaver?: () => void;
  startDaydream?: () => void;
  isScreenOn?: () => boolean;
  setBooleanSetting?: (key: string, value: boolean) => void;
  setStringSetting?: (key: string, value: string) => void;
}

export const DEFAULT_SCREENSAVER_EXIT_TIMES: readonly string[] = ['09:30', '10:00'];
export const DEFAULT_SCREENSAVER_OFF_DURATION_MS = 5 * 60 * 1000; // 5 minutes

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function getFullyKiosk(): FullyKioskApi | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    fully?: FullyKioskApi;
    __TEST_FULLY__?: FullyKioskApi;
  };
  return win.__TEST_FULLY__ ?? win.fully ?? null;
}

/**
 * Parses an array of time strings or comma/space-delimited time string
 * into validated, sorted 24h HH:MM strings (e.g. "09:30").
 */
export function parseScreensaverExitTimes(input: unknown): string[] {
  if (!input) return [];

  let rawList: string[] = [];
  if (Array.isArray(input)) {
    rawList = input.map(String);
  } else if (typeof input === 'string') {
    rawList = input.split(/[,;\s]+/);
  }

  const validTimes: string[] = [];
  for (const item of rawList) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    // Normalize "9:30" -> "09:30"
    const normalized = trimmed.length === 4 && /^\d:[0-5]\d$/.test(trimmed)
      ? `0${trimmed}`
      : trimmed;

    if (TIME_REGEX.test(normalized) && !validTimes.includes(normalized)) {
      validTimes.push(normalized);
    }
  }

  return validTimes.sort();
}

/**
 * Resolves screensaver exit times:
 * 1. window.__KIOSK_SCREENSAVER_EXIT_TIMES__ (for testing)
 * 2. serverTimes (from backend DailyBriefResponse, configured via KIOSK_SCREENSAVER_EXIT_TIMES env)
 * 3. DEFAULT_SCREENSAVER_EXIT_TIMES (['09:30', '10:00'])
 */
export function resolveScreensaverExitTimes(serverTimes?: string[]): string[] {
  // 1. Window global override (for testing)
  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      __KIOSK_SCREENSAVER_EXIT_TIMES__?: unknown;
    };
    if (win.__KIOSK_SCREENSAVER_EXIT_TIMES__) {
      const parsed = parseScreensaverExitTimes(win.__KIOSK_SCREENSAVER_EXIT_TIMES__);
      if (parsed.length > 0) return parsed;
    }
  }

  // 2. Server-provided times from KIOSK_SCREENSAVER_EXIT_TIMES env
  if (serverTimes && serverTimes.length > 0) {
    const parsed = parseScreensaverExitTimes(serverTimes);
    if (parsed.length > 0) return parsed;
  }

  // 3. Default fallback
  return [...DEFAULT_SCREENSAVER_EXIT_TIMES];
}

/**
 * Triggers screensaver exit on Fully Kiosk Browser if the JavaScript interface is available.
 * Also emits an event and sets diagnostic markers for logging/testing.
 */
export function exitFullyScreensaver(): boolean {
  const timeStr = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (typeof window !== 'undefined') {
    const detail = { time: timeStr, timestamp: Date.now() };
    const win = window as unknown as {
      __LAST_SCREENSAVER_EXIT__?: typeof detail;
    };
    win.__LAST_SCREENSAVER_EXIT__ = detail;
    window.dispatchEvent(new CustomEvent('kiosk:screensaver-exit', { detail }));
  }

  const fully = getFullyKiosk();
  if (!fully) {
    return false;
  }

  let invoked = false;

  try {
    if (typeof fully.turnScreenOn === 'function') {
      fully.turnScreenOn();
      invoked = true;
    }
  } catch (err) {
    console.warn('[FullyKiosk] turnScreenOn error:', err);
  }

  try {
    if (typeof fully.stopScreensaver === 'function') {
      fully.stopScreensaver();
      invoked = true;
    }
  } catch (err) {
    console.warn('[FullyKiosk] stopScreensaver error:', err);
  }

  try {
    if (typeof fully.stopDaydream === 'function') {
      fully.stopDaydream();
      invoked = true;
    }
  } catch (err) {
    console.warn('[FullyKiosk] stopDaydream error:', err);
  }

  try {
    if (typeof fully.bringToForeground === 'function') {
      fully.bringToForeground();
      invoked = true;
    }
  } catch (err) {
    console.warn('[FullyKiosk] bringToForeground error:', err);
  }

  console.log(`[FullyKiosk] Screensaver exit invoked at ${timeStr}`);
  return invoked;
}

/**
 * Resolves the duration (in ms) to keep the screensaver off when a scheduled wake occurs.
 * Default is 5 minutes (300,000 ms), with testing override support via window.__KIOSK_SCREENSAVER_OFF_DURATION_MS__.
 */
export function resolveScreensaverOffDurationMs(): number {
  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      __KIOSK_SCREENSAVER_OFF_DURATION_MS__?: number;
    };
    if (typeof win.__KIOSK_SCREENSAVER_OFF_DURATION_MS__ === 'number' && win.__KIOSK_SCREENSAVER_OFF_DURATION_MS__ > 0) {
      return win.__KIOSK_SCREENSAVER_OFF_DURATION_MS__;
    }
  }

  return DEFAULT_SCREENSAVER_OFF_DURATION_MS;
}

/**
 * Triggers screensaver start on Fully Kiosk Browser if available.
 */
export function startFullyScreensaver(): boolean {
  if (typeof window !== 'undefined') {
    const detail = { timestamp: Date.now() };
    const win = window as unknown as {
      __LAST_SCREENSAVER_START__?: typeof detail;
    };
    win.__LAST_SCREENSAVER_START__ = detail;
    window.dispatchEvent(new CustomEvent('kiosk:screensaver-start', { detail }));
  }

  const fully = getFullyKiosk();
  if (!fully) return false;

  let invoked = false;
  try {
    if (typeof fully.startScreensaver === 'function') {
      fully.startScreensaver();
      invoked = true;
    }
  } catch (err) {
    console.warn('[FullyKiosk] startScreensaver error:', err);
  }

  try {
    if (typeof fully.startDaydream === 'function') {
      fully.startDaydream();
      invoked = true;
    }
  } catch (err) {
    console.warn('[FullyKiosk] startDaydream error:', err);
  }

  return invoked;
}

/**
 * Modifies keepScreenOn setting in Fully Kiosk if supported.
 */
export function setFullyKeepScreenOn(keepOn: boolean): void {
  const fully = getFullyKiosk();
  if (!fully) return;

  try {
    if (typeof fully.setBooleanSetting === 'function') {
      fully.setBooleanSetting('keepScreenOn', keepOn);
    }
  } catch (err) {
    console.warn('[FullyKiosk] setBooleanSetting(keepScreenOn) error:', err);
  }
}

