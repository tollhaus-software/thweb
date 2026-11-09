import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  FileText,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { t } from '../../utils/i18n';
import './HygieneUploadWizardModal.css';

export interface HygieneUploadWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const HygieneUploadWizardModal: React.FC<HygieneUploadWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<1 | 2>(1);

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview & Metadata
  const [docTitle, setDocTitle] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Loading & error
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedFile(null);
      setDocTitle('');
      setPreviewUrl(null);
      setLoading(false);
      setErrorMsg(null);
    }
  }, [isOpen]);

  // Clean up object URL when component unmounts or previewUrl changes
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (!isOpen) return null;

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setSelectedFile(f);
      setErrorMsg(null);
      if (!docTitle) {
        setDocTitle(f.name.replace(/\.pdf$/i, ''));
      }
      // Auto-continue to step 2 (preview & title) once a file has been chosen
      setPreviewUrl(URL.createObjectURL(f));
      setStep(2);
      e.target.value = '';
    }
  };

  // Step 1 -> Step 2
  const handleProceedFromStep1 = () => {
    setErrorMsg(null);
    if (!selectedFile) {
      setErrorMsg('Bitte wählen Sie eine PDF-Datei aus.');
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    if (!docTitle) {
      setDocTitle(selectedFile.name.replace(/\.pdf$/i, ''));
    }
    setStep(2);
  };

  // Step 2 -> Commit
  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!docTitle.trim()) {
      setErrorMsg('Bitte geben Sie einen Titel für das Dokument ein.');
      return;
    }
    setLoading(true);

    try {
      if (!selectedFile) {
        throw new Error('Datei fehlt.');
      }
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', docTitle.trim() || selectedFile.name);

      const res = await fetch('/api/hygiene/instruction-document', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Fehler beim Speichern (${res.status})`);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Fehler beim Aktivieren des Belehrungsdokuments');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="hygiene-wizard-overlay"
      data-testid="hygiene-upload-wizard-modal"
      onClick={onClose}
    >
      <div
        className="hygiene-wizard-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hygiene-wizard-title"
      >
        {/* Header */}
        <div className="hygiene-wizard-header">
          <div className="hygiene-wizard-title-wrap">
            <FileText size={22} color="var(--primary, #2563eb)" />
            <h2 id="hygiene-wizard-title" className="hygiene-wizard-title">
              {t('hygieneUploadNewDocBtn') || 'Neues Belehrungsdokument hochladen'}
            </h2>
            <span className="hygiene-wizard-step-indicator">
              Schritt {step} von 2
            </span>
          </div>
          <button
            type="button"
            className="hygiene-wizard-close-btn"
            onClick={onClose}
            aria-label={t('close') || 'Schließen'}
            data-testid="hygiene-wizard-close-btn"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="hygiene-wizard-body">
          {errorMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem', background: 'var(--danger-bg, #fee2e2)', color: 'var(--danger-text, #991b1b)', borderRadius: '6px', fontSize: '0.92rem' }} data-testid="hygiene-wizard-error">
              <AlertCircle size={18} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ================= STEP 1: FILE SELECTION ================= */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="hygiene-wizard-file-input"
                data-testid="hygiene-wizard-file-input"
              />
              <label
                htmlFor="hygiene-wizard-file-input"
                className="hygiene-wizard-dropzone"
                data-testid="hygiene-wizard-dropzone"
              >
                <Upload size={36} color="var(--primary, #2563eb)" />
                <span style={{ fontWeight: 600, color: 'var(--text-h, #0f172a)', fontSize: '1rem' }}>
                  {selectedFile ? selectedFile.name : 'PDF-Datei auswählen oder hierher ziehen'}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB ausgewählt`
                    : 'Nur PDF-Dateien bis 20 MB'}
                </span>
              </label>
            </div>
          )}

          {/* ================= STEP 2: PREVIEW & TITLE ================= */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="hygiene-wizard-title-input" style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text, #1e293b)' }}>
                  {t('hygieneDocTitleLabel') || 'Titel des Dokuments'} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="hygiene-wizard-title-input"
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder={t('hygieneDocTitlePlaceholder') || 'z.B. Folgebelehrung Infektionsschutzgesetz 2026'}
                  data-testid="hygiene-wizard-title-input"
                  style={{
                    padding: '0.65rem 0.85rem',
                    border: '1px solid var(--input-border, #cbd5e1)',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: 500,
                  }}
                />
              </div>

              {previewUrl && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>
                    Dokumentenvorschau:
                  </span>
                  <iframe
                    src={previewUrl}
                    title={docTitle || 'PDF Preview'}
                    data-testid="hygiene-wizard-preview-frame"
                    style={{
                      width: '100%',
                      height: '380px',
                      border: '1px solid var(--border, #e2e8f0)',
                      borderRadius: '8px',
                      background: 'var(--bg-subtle, #f8fafc)',
                    }}
                  />
                </div>
              )}

              <div
                data-testid="hygiene-wizard-regular-note"
                style={{
                  padding: '0.75rem 0.9rem',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: '8px',
                  background: 'var(--bg-subtle, #f8fafc)',
                  fontSize: '0.88rem',
                  lineHeight: 1.45,
                  color: 'var(--text-secondary, #64748b)',
                }}
              >
                {t('hygieneWizardRegularNote')}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="hygiene-wizard-footer">
          {step > 1 ? (
            <button
              type="button"
              className="hygiene-wizard-btn secondary"
              onClick={() => {
                setErrorMsg(null);
                setStep(1);
              }}
              data-testid="hygiene-wizard-back"
            >
              <ArrowLeft size={16} />
              <span>{t('hygieneWizardBack') || 'Zurück'}</span>
            </button>
          ) : (
            <div />
          )}

          {step === 1 && (
            <button
              type="button"
              className="hygiene-wizard-btn primary"
              disabled={loading || !selectedFile}
              onClick={handleProceedFromStep1}
              data-testid="hygiene-wizard-step1-next"
            >
              <span>{t('hygieneWizardNext') || 'Weiter'}</span>
              <ArrowRight size={16} />
            </button>
          )}

          {step === 2 && (
            <button
              type="button"
              className="hygiene-wizard-btn primary"
              disabled={loading || !docTitle.trim()}
              onClick={handleSubmit}
              data-testid="hygiene-wizard-submit"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  <span>Wird aktiviert...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>{t('hygieneWizardSubmit') || 'Dokument aktivieren'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
