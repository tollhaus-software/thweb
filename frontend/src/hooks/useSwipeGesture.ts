import { useEffect, useRef } from 'react';

export interface UseSwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDeltaX?: number; // Minimum horizontal travel in pixels (default: 60)
  maxDeltaYRatio?: number; // Max ratio of vertical-to-horizontal travel (default: 0.75)
  maxDurationMs?: number; // Maximum swipe duration in ms (default: 700)
  cooldownMs?: number; // Debounce / cooldown window in ms (default: 400)
  enabled?: boolean; // Whether gestures are active (default: true)
}

/**
 * Reusable hook to detect left and right horizontal swipe gestures on a target element.
 * Restricts gesture recognition to touch/pen interactions to preserve standard desktop mouse behaviors.
 */
export function useSwipeGesture<T extends HTMLElement>(
  targetRef: React.RefObject<T | null>,
  {
    onSwipeLeft,
    onSwipeRight,
    minDeltaX = 60,
    maxDeltaYRatio = 0.75,
    maxDurationMs = 700,
    cooldownMs = 400,
    enabled = true,
  }: UseSwipeGestureOptions
): void {
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);

  useEffect(() => {
    onSwipeLeftRef.current = onSwipeLeft;
    onSwipeRightRef.current = onSwipeRight;
  }, [onSwipeLeft, onSwipeRight]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el || !enabled) return;

    let touchStart: { x: number; y: number; time: number } | null = null;
    let activePointerId: number | null = null;
    let pointerStart: { x: number; y: number; time: number } | null = null;
    let lastTriggerTime = 0;

    const evaluateSwipe = (
      start: { x: number; y: number; time: number },
      end: { x: number; y: number; time: number }
    ) => {
      const now = Date.now();
      if (now - lastTriggerTime < cooldownMs) return;

      const duration = end.time - start.time;
      if (duration > maxDurationMs) return;

      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Must exceed horizontal minimum threshold
      if (absX < minDeltaX) return;

      // Must be predominantly horizontal to avoid catching vertical scrolls
      if (absY > 0 && absY / absX > maxDeltaYRatio) return;

      lastTriggerTime = now;
      if (deltaX < 0) {
        onSwipeLeftRef.current?.();
      } else {
        onSwipeRightRef.current?.();
      }
    };

    // --- Touch Events ---
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        touchStart = null;
        return;
      }
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const start = touchStart;
      touchStart = null;
      evaluateSwipe(start, { x: t.clientX, y: t.clientY, time: Date.now() });
    };

    const handleTouchCancel = () => {
      touchStart = null;
    };

    // --- Pointer Events (touch and pen only) ---
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      if (activePointerId !== null) {
        // Multi-touch detected; cancel gesture
        pointerStart = null;
        activePointerId = null;
        return;
      }
      activePointerId = e.pointerId;
      pointerStart = { x: e.clientX, y: e.clientY, time: Date.now() };
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      if (activePointerId !== e.pointerId || !pointerStart) return;
      const start = pointerStart;
      pointerStart = null;
      activePointerId = null;
      evaluateSwipe(start, { x: e.clientX, y: e.clientY, time: Date.now() });
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (e.pointerId === activePointerId) {
        pointerStart = null;
        activePointerId = null;
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchCancel);
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [targetRef, enabled, minDeltaX, maxDeltaYRatio, maxDurationMs, cooldownMs]);
}
