import { useEffect, useRef } from 'react';

export interface UseIdleTimerOptions {
  timeoutMs: number;
  onIdle: () => void;
  enabled?: boolean;
  throttleMs?: number;
}

export function useIdleTimer({
  timeoutMs,
  onIdle,
  enabled = true,
  throttleMs = 5000,
}: UseIdleTimerOptions): void {
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled || timeoutMs <= 0) return;

    let timerId: ReturnType<typeof setTimeout>;
    let lastActivity = Date.now();

    const triggerIdle = () => {
      onIdleRef.current();
    };

    const resetTimer = () => {
      lastActivity = Date.now();
      clearTimeout(timerId);
      timerId = setTimeout(triggerIdle, timeoutMs);
    };

    const effectiveThrottle = Math.min(throttleMs, Math.max(50, Math.floor(timeoutMs / 4)));

    const handleActivity = () => {
      const now = Date.now();
      // Throttle event checks to at most once every effectiveThrottle
      if (now - lastActivity >= effectiveThrottle) {
        resetTimer();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastActivity;
        if (elapsed >= timeoutMs) {
          triggerIdle();
        } else {
          clearTimeout(timerId);
          timerId = setTimeout(triggerIdle, timeoutMs - elapsed);
        }
      }
    };

    const events: (keyof WindowEventMap)[] = [
      'mousedown',
      'pointerdown',
      'touchstart',
      'mousemove',
      'keydown',
      'wheel',
      'scroll',
    ];

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { capture: true, passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial timer setup
    resetTimer();

    return () => {
      clearTimeout(timerId);
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity, { capture: true });
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [timeoutMs, enabled, throttleMs]);
}
