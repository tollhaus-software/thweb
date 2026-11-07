import { useState, useEffect, useCallback } from 'react';

export const TABLE_ZOOM_STORAGE_KEY = 'thweb_table_zoom';
export const DEFAULT_TABLE_ZOOM = 1.0;
export const ZOOM_LEVELS = [0.5, 0.75, 0.9, 1.0, 1.25, 1.5, 2.0] as const;

export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export function getStoredTableZoom(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_TABLE_ZOOM;
  try {
    const saved = localStorage.getItem(TABLE_ZOOM_STORAGE_KEY);
    if (!saved) return DEFAULT_TABLE_ZOOM;
    const parsed = parseFloat(saved);
    return !isNaN(parsed) && parsed >= 0.5 && parsed <= 3.0 ? parsed : DEFAULT_TABLE_ZOOM;
  } catch {
    return DEFAULT_TABLE_ZOOM;
  }
}

export function setStoredTableZoom(zoom: number) {
  try {
    localStorage.setItem(TABLE_ZOOM_STORAGE_KEY, String(zoom));
  } catch {
    // Ignore storage quota/permission errors
  }
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--table-zoom', String(zoom));
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('thweb-zoom-change', { detail: zoom }));
  }
}

export function useTableZoom() {
  const [zoomFactor, setZoomFactorState] = useState<number>(() => {
    const initial = getStoredTableZoom();
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--table-zoom', String(initial));
    }
    return initial;
  });

  useEffect(() => {
    document.documentElement.style.setProperty('--table-zoom', String(zoomFactor));

    const handleCustomChange = (e: Event) => {
      const customEvent = e as CustomEvent<number>;
      if (typeof customEvent.detail === 'number' && !isNaN(customEvent.detail)) {
        setZoomFactorState(customEvent.detail);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TABLE_ZOOM_STORAGE_KEY && e.newValue) {
        const parsed = parseFloat(e.newValue);
        if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 3.0) {
          setZoomFactorState(parsed);
          document.documentElement.style.setProperty('--table-zoom', String(parsed));
        }
      }
    };

    window.addEventListener('thweb-zoom-change', handleCustomChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('thweb-zoom-change', handleCustomChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [zoomFactor]);

  const setZoomFactor = useCallback((newZoom: number) => {
    setStoredTableZoom(newZoom);
    setZoomFactorState(newZoom);
  }, []);

  return {
    zoomFactor,
    setZoomFactor,
    zoomLevels: ZOOM_LEVELS,
  };
}
