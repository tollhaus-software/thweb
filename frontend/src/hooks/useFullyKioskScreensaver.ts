import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import {
  resolveScreensaverExitTimes,
  resolveScreensaverOffDurationMs,
  exitFullyScreensaver,
  startFullyScreensaver,
} from '../utils/fullyKiosk';

export interface UseFullyKioskScreensaverOptions {
  serverTimes?: string[];
  currentTime?: Date;
  onWake?: () => void;
  enabled?: boolean;
  screensaverOffDurationMs?: number;
}

export interface UseFullyKioskScreensaverResult {
  scheduledTimes: string[];
  triggerScreensaverExit: () => boolean;
  isWakeActive: boolean;
}

export function useFullyKioskScreensaver({
  serverTimes,
  currentTime,
  onWake,
  enabled = true,
  screensaverOffDurationMs,
}: UseFullyKioskScreensaverOptions): UseFullyKioskScreensaverResult {
  const scheduledTimes = useMemo(
    () => resolveScreensaverExitTimes(serverTimes),
    [serverTimes]
  );

  const offDurationMs = useMemo(
    () => screensaverOffDurationMs ?? resolveScreensaverOffDurationMs(),
    [screensaverOffDurationMs]
  );

  const onWakeRef = useRef(onWake);
  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  const lastTriggeredSlotRef = useRef<string | null>(null);
  const wakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const wakeStartedAtRef = useRef<number>(0);
  const lastUserInteractionRef = useRef<number>(0);
  const [isWakeActive, setIsWakeActive] = useState(false);

  // Track user touch/keyboard interactions so we don't start the screensaver while actively being used
  useEffect(() => {
    const handleUserInteraction = () => {
      lastUserInteractionRef.current = Date.now();
    };

    const events: (keyof WindowEventMap)[] = ['mousedown', 'touchstart', 'pointerdown', 'keydown'];
    events.forEach((ev) => window.addEventListener(ev, handleUserInteraction, { capture: true, passive: true }));

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserInteraction, { capture: true }));
    };
  }, []);

  const releaseWakeKeepOn = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    setIsWakeActive(false);
  }, []);

  const endWakeSession = useCallback(() => {
    releaseWakeKeepOn();

    // If user interacted during the active wake session (within the last 60s), do not interrupt active usage
    const interactedDuringWake =
      lastUserInteractionRef.current >= wakeStartedAtRef.current &&
      Date.now() - lastUserInteractionRef.current < 60_000;

    if (!interactedDuringWake) {
      startFullyScreensaver();
    }
  }, [releaseWakeKeepOn]);

  const triggerScreensaverExit = useCallback((): boolean => {
    wakeStartedAtRef.current = Date.now();
    if (onWakeRef.current) {
      onWakeRef.current();
    }

    const invoked = exitFullyScreensaver();
    setIsWakeActive(true);

    // Screen Wake Lock API if available in WebView
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      (navigator as unknown as { wakeLock: { request: (type: string) => Promise<{ release: () => Promise<void> }> } })
        .wakeLock.request('screen')
        .then((sentinel) => {
          wakeLockRef.current = sentinel;
        })
        .catch(() => {});
    }

    // 3. Timer to re-engage screensaver after offDurationMs (default 5 minutes)
    if (wakeTimeoutRef.current) {
      clearTimeout(wakeTimeoutRef.current);
    }
    wakeTimeoutRef.current = setTimeout(() => {
      endWakeSession();
    }, offDurationMs);

    return invoked;
  }, [endWakeSession, offDurationMs]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (wakeTimeoutRef.current) {
        clearTimeout(wakeTimeoutRef.current);
      }
      releaseWakeKeepOn();
    };
  }, [releaseWakeKeepOn]);

  // Expose test trigger helpers on window
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const win = window as unknown as {
      __triggerFullyScreensaverExit?: () => boolean;
      __startFullyScreensaver?: () => boolean;
      __SCHEDULED_SCREENSAVER_EXIT_TIMES__?: string[];
      __SCREENSAVER_OFF_DURATION_MS__?: number;
    };
    win.__triggerFullyScreensaverExit = triggerScreensaverExit;
    win.__startFullyScreensaver = startFullyScreensaver;
    win.__SCHEDULED_SCREENSAVER_EXIT_TIMES__ = scheduledTimes;
    win.__SCREENSAVER_OFF_DURATION_MS__ = offDurationMs;

    return () => {
      delete win.__triggerFullyScreensaverExit;
      delete win.__startFullyScreensaver;
      delete win.__SCHEDULED_SCREENSAVER_EXIT_TIMES__;
      delete win.__SCREENSAVER_OFF_DURATION_MS__;
    };
  }, [triggerScreensaverExit, scheduledTimes, offDurationMs]);

  // Check schedule whenever currentTime updates (or periodically)
  useEffect(() => {
    if (!enabled || scheduledTimes.length === 0) return;

    const checkSchedule = (now: Date) => {
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timeSlot = `${hours}:${minutes}`;

      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      const slotKey = `${dateKey} ${timeSlot}`;

      if (scheduledTimes.includes(timeSlot) && lastTriggeredSlotRef.current !== slotKey) {
        lastTriggeredSlotRef.current = slotKey;
        triggerScreensaverExit();
      }
    };

    const effectiveTime = currentTime || new Date();
    checkSchedule(effectiveTime);
  }, [currentTime, enabled, scheduledTimes, triggerScreensaverExit]);

  return {
    scheduledTimes,
    triggerScreensaverExit,
    isWakeActive,
  };
}
