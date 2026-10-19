/**
 * Single source of truth for viewport breakpoints across the application.
 *
 * This breakpoint is used in:
 * - TypeScript/React: `useIsMobile` hook, `DataTable.tsx`, `CellPopover.tsx`
 * - CSS/Styles: Injected into CSS via Vite plugin (`__MOBILE_BREAKPOINT__` in `App.css`)
 */
export const MOBILE_BREAKPOINT = 768;
export const MOBILE_BREAKPOINT_PX = `${MOBILE_BREAKPOINT}px`;
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`;
