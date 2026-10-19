import { useState, useEffect } from 'react';
import { MOBILE_BREAKPOINT } from '../constants/breakpoints';

/**
 * Hook to determine if current viewport matches mobile breakpoint.
 * Uses MOBILE_BREAKPOINT from `src/constants/breakpoints.ts` as single source of truth.
 */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= breakpoint;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const updateMatches = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };

    setIsMobile(mql.matches);

    if (mql.addEventListener) {
      mql.addEventListener('change', updateMatches);
      return () => mql.removeEventListener('change', updateMatches);
    } else {
      // Compatibility fallback for older browsers
      const legacyMql = mql as unknown as {
        addListener: (cb: (e: MediaQueryList) => void) => void;
        removeListener: (cb: (e: MediaQueryList) => void) => void;
      };
      legacyMql.addListener(updateMatches);
      return () => legacyMql.removeListener(updateMatches);
    }
  }, [breakpoint]);

  return isMobile;
}
