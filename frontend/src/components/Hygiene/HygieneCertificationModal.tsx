import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, ExternalLink, Download, CheckCircle2, ShieldAlert, ChevronsDown, ZoomIn, ZoomOut } from 'lucide-react';
import { t } from '../../utils/i18n';
import { useAuth } from '../../context/AuthContext';
import { PdfPagesViewer } from './PdfPagesViewer';
import './HygieneCertificationModal.css';

export interface HygieneCertificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  documentTitle?: string;
  documentFilename?: string;
  /** Full name of the certifying person; falls back to the authenticated e-mail address */
  userName?: string;
}

export const HygieneCertificationModal: React.FC<HygieneCertificationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  documentTitle,
  documentFilename,
  userName,
}) => {
  const { user } = useAuth();
  const certifierName = (userName || '').trim() || user?.email || '';
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const bodyRef = useRef<HTMLDivElement>(null);

  const checkScrollEnd = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setScrolledToEnd(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setConfirmed(false);
      setSubmitting(false);
      setSuccess(false);
      setError(null);
      setScrolledToEnd(false);
      setPdfReady(false);
      setZoom(1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (pdfReady) checkScrollEnd();
  }, [pdfReady, checkScrollEnd]);

  if (!isOpen) return null;

  const token = localStorage.getItem('token');

  const scrollToBottom = () => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  };

  const title = documentTitle || documentFilename || 'Hygiene-Folgebelehrung';

  const handleCertify = async () => {
    if (!confirmed || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/hygiene/certify', {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirmed: true }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Fehler beim Bestätigen (${res.status})`);
      }

      // Keep the success banner visible until the user explicitly closes the modal.
      setSuccess(true);
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Bestätigen der Belehrung');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="hygiene-cert-modal-overlay"
      data-testid="hygiene-cert-modal-overlay"
      onClick={onClose}
    >
      <div
        className="hygiene-cert-modal-container"
        data-testid="hygiene-cert-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hygiene-cert-modal-title"
      >
        <div className="hygiene-cert-modal-header">
          <div className="hygiene-cert-modal-title-wrap">
            <ShieldAlert size={24} className="hygiene-cert-modal-icon" />
            <h2 id="hygiene-cert-modal-title" className="hygiene-cert-modal-title">
              {t('hygieneModalTitle')}
            </h2>
          </div>
          <button
            type="button"
            className="hygiene-cert-modal-close-btn"
            onClick={onClose}
            aria-label={t('close')}
            data-testid="hygiene-cert-close-btn"
          >
            <X size={20} />
          </button>
        </div>

        <div className="hygiene-cert-modal-body" ref={bodyRef} onScroll={checkScrollEnd} data-testid="hygiene-cert-scroll-body">
          {error && (
            <div className="hygiene-cert-error-banner" style={{ padding: '0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          {success ? (
            <div className="hygiene-cert-success-banner" data-testid="hygiene-cert-success-banner">
              <CheckCircle2 size={24} color="#059669" />
              <span>{t('hygieneCertifiedSuccess')}</span>
            </div>
          ) : (
            <>
              <div className="hygiene-cert-doc-toolbar">
                <span className="hygiene-cert-doc-title">{title}</span>
                <div className="hygiene-cert-doc-actions">
                  <div className="hygiene-cert-zoom-controls" role="group" aria-label="Zoom">
                    <button
                      type="button"
                      className="hygiene-cert-zoom-btn"
                      onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
                      disabled={zoom <= 1}
                      aria-label={t('hygieneZoomOut')}
                      title={t('hygieneZoomOut')}
                      data-testid="hygiene-cert-zoom-out"
                    >
                      <ZoomOut size={16} />
                    </button>
                    <span className="hygiene-cert-zoom-value" data-testid="hygiene-cert-zoom-value">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      className="hygiene-cert-zoom-btn"
                      onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
                      disabled={zoom >= 3}
                      aria-label={t('hygieneZoomIn')}
                      title={t('hygieneZoomIn')}
                      data-testid="hygiene-cert-zoom-in"
                    >
                      <ZoomIn size={16} />
                    </button>
                  </div>
                  <a
                    href="/api/hygiene/instruction-document"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hygiene-cert-link-btn"
                    data-testid="hygiene-cert-open-ext-link"
                  >
                    <ExternalLink size={14} />
                    <span className="hygiene-cert-label-full">{t('openPdfNewTab')}</span>
                    <span className="hygiene-cert-label-short">{t('openPdfNewTabShort')}</span>
                  </a>
                  <a
                    href="/api/hygiene/instruction-document"
                    download={documentFilename || 'Hygiene-Folgebelehrung.pdf'}
                    className="hygiene-cert-link-btn"
                    data-testid="hygiene-cert-download-link"
                  >
                    <Download size={14} />
                    <span className="hygiene-cert-label-full">{t('downloadPdf')}</span>
                    <span className="hygiene-cert-label-short">{t('downloadPdfShort')}</span>
                  </a>
                </div>
              </div>

              {/* PDF pages rendered inline; the dialog body scrolls */}
              <PdfPagesViewer
                url="/api/hygiene/instruction-document"
                token={token}
                zoom={zoom}
                title={title}
                onReady={() => setPdfReady(true)}
              />

              {/* Statutory Confirmation Checkbox (reachable only at the bottom) */}
              <label
                className={`hygiene-cert-checkbox-card${scrolledToEnd ? '' : ' disabled'}`}
                data-testid="hygiene-cert-checkbox-card"
              >
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!scrolledToEnd}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="hygiene-cert-checkbox-input"
                  data-testid="hygiene-cert-checkbox"
                />
                <span className="hygiene-cert-checkbox-label">
                  {t('hygieneStatutoryText').replace('{name}', certifierName)}
                </span>
              </label>

              {!scrolledToEnd && (
                <button
                  type="button"
                  className="hygiene-cert-scroll-hint"
                  onClick={scrollToBottom}
                  data-testid="hygiene-cert-scroll-hint"
                >
                  <ChevronsDown size={16} />
                  <span>{t('hygieneScrollHint')}</span>
                </button>
              )}
            </>
          )}
        </div>

        {success && (
          <div className="hygiene-cert-modal-footer">
            <button
              type="button"
              className="hygiene-cert-submit-btn"
              onClick={onClose}
              data-testid="hygiene-cert-success-close-btn"
            >
              {t('close')}
            </button>
          </div>
        )}

        {!success && (
          <div className="hygiene-cert-modal-footer">
            <button
              type="button"
              className="hygiene-cert-cancel-btn"
              onClick={onClose}
              disabled={submitting}
              data-testid="hygiene-cert-cancel-btn"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              className="hygiene-cert-submit-btn"
              onClick={handleCertify}
              disabled={!scrolledToEnd || !confirmed || submitting}
              data-testid="hygiene-cert-submit-btn"
            >
              {submitting ? 'Wird gespeichert...' : t('hygieneCertifyBtn')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
