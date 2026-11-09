import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { RefreshCw } from 'lucide-react';
import './PdfPagesViewer.css';

export interface PdfPagesViewerProps {
  /** URL of the PDF to render */
  url: string;
  /** Optional bearer token used when fetching the PDF */
  token?: string | null;
  /** Zoom factor relative to "fit to width" (1 = fit width). */
  zoom?: number;
  /** Called once all pages have been rendered (or rendering failed) */
  onReady?: () => void;
  title?: string;
}

/** Oversampling factor for crisp text when the user pinch-zooms. */
const OVERSAMPLE = 2;
/** Upper bound for the canvas pixel width (memory safety on phones). */
const MAX_CANVAS_PX_WIDTH = 4096;

/**
 * Renders all pages of a PDF as stacked canvases (no inner scrolling),
 * so the surrounding container can track how far the user has scrolled.
 */
export const PdfPagesViewer: React.FC<PdfPagesViewerProps> = ({ url, token, zoom = 1, onReady, title }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Load the document once per url/token
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setDoc(null);

    const load = async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (!pdfjs.GlobalWorkerOptions.workerPort) {
          // Let Vite bundle the worker as a regular .js chunk (avoids .mjs MIME type issues)
          pdfjs.GlobalWorkerOptions.workerPort = new Worker(
            new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
            { type: 'module' },
          );
        }

        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`PDF fetch failed (${res.status})`);
        const data = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;

        const loaded = await pdfjs.getDocument({ data }).promise;
        if (!cancelled) setDoc(loaded);
      } catch (err) {
        console.error('Error loading PDF:', err);
        if (!cancelled) {
          setStatus('error');
          onReadyRef.current?.();
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [url, token]);

  // (Re-)render all pages whenever the document or zoom level changes
  useEffect(() => {
    if (!doc) return;
    const viewer = viewerRef.current;
    const list = listRef.current;
    if (!viewer || !list) return;
    let cancelled = false;

    const render = async () => {
      try {
        const cs = getComputedStyle(viewer);
        const innerWidth = viewer.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const cssWidth = Math.max(240, innerWidth) * zoom;
        const dpr = window.devicePixelRatio || 1;
        const pixelRatio = Math.min(dpr * OVERSAMPLE, MAX_CANVAS_PX_WIDTH / cssWidth);

        const canvases: HTMLCanvasElement[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const cssScale = cssWidth / base.width;
          const viewport = page.getViewport({ scale: cssScale * pixelRatio });

          const canvas = document.createElement('canvas');
          canvas.className = 'pdf-pages-canvas';
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${viewport.height / pixelRatio}px`;
          canvas.setAttribute('data-testid', `hygiene-cert-pdf-page-${i}`);

          const ctx = canvas.getContext('2d');
          if (ctx) await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          canvases.push(canvas);
        }
        if (cancelled) return;
        // Swap in atomically so zooming does not flash an empty list
        list.replaceChildren(...canvases);
        setStatus('ready');
      } catch (err) {
        console.error('Error rendering PDF pages:', err);
        if (!cancelled) setStatus('error');
      } finally {
        if (!cancelled) onReadyRef.current?.();
      }
    };
    void render();

    return () => {
      cancelled = true;
    };
  }, [doc, zoom]);

  return (
    <div className="pdf-pages-viewer" ref={viewerRef} data-testid="hygiene-cert-pdf-viewer" aria-label={title}>
      {status === 'loading' && (
        <div className="pdf-pages-status pdf-pages-loading" data-testid="hygiene-cert-pdf-loading" role="status">
          <RefreshCw size={28} className="spin" />
          <span>Dokument wird geladen…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="pdf-pages-status pdf-pages-error" data-testid="hygiene-cert-pdf-error">
          Das Dokument konnte nicht angezeigt werden. Bitte öffne es über den Link oben in einem neuen Tab.
        </div>
      )}
      <div ref={listRef} className="pdf-pages-list" />
    </div>
  );
};
