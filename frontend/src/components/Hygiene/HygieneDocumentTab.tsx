import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  ExternalLink,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { t, formatDisplayDate } from '../../utils/i18n';
import { useIsMobile } from '../../hooks/useIsMobile';
import { HygieneUploadWizardModal } from './HygieneUploadWizardModal';
import './HygieneDocumentTab.css';

interface ActiveDocInfo {
  id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  title: string;
  source_type: string;
  source_url?: string;
  uploaded_by: string;
  effective_from: string;
  is_active: boolean;
  created_at: string;
}

export const HygieneDocumentTab: React.FC = () => {
  const isMobile = useIsMobile();
  const [documents, setDocuments] = useState<ActiveDocInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Wizard modal state
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/hygiene/instruction-documents', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err: unknown) {
      console.error('Error fetching documents list:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await fetchDocuments();
    } finally {
      setLoading(false);
    }
  }, [fetchDocuments]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleDelete = async (doc: ActiveDocInfo) => {
    const confirmText = t('hygieneConfirmDeleteDoc') || 'Möchten Sie dieses Belehrungsdokument wirklich löschen?';
    if (!window.confirm(confirmText)) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/hygiene/instruction-document/${encodeURIComponent(doc.id)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Fehler beim Löschen (${res.status})`);
      }

      setSuccessMsg('Dokument wurde erfolgreich gelöscht.');
      await refreshAll();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Fehler beim Löschen des Belehrungsdokuments');
    }
  };

  const handleWizardSuccess = async () => {
    setSuccessMsg(t('hygieneDocUploadedSuccess') || 'Dokument erfolgreich gespeichert');
    await refreshAll();
  };

  return (
    <div className="hygiene-doc-tab-container" data-testid="hygiene-doc-tab-container">
      {/* Top Header */}
      <div className="hygiene-doc-tab-header">
        <div className="hygiene-doc-tab-header-text">
          <h1 className="hygiene-doc-tab-title">{t('hygieneDocManagementTitle') || 'Belehrungsdokument konfigurieren'}</h1>
          <p className="hygiene-doc-tab-subtitle">{t('subtabDescHygieneDocument') || 'Konfiguration des Dokuments zur Hygiene-Folgebelehrung.'}</p>
        </div>

        <button
          type="button"
          className="hygiene-add-doc-btn"
          onClick={() => setIsWizardOpen(true)}
          data-testid="hygiene-add-doc-btn"
        >
          <Plus size={18} />
          <span>{t('hygieneUploadNewDocBtn') || 'Neues Belehrungsdokument hochladen'}</span>
        </button>
      </div>

      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem', background: 'var(--success-bg, #ecfdf5)', color: 'var(--success-text, #065f46)', borderRadius: '8px' }} data-testid="hygiene-doc-success">
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem', background: 'var(--danger-bg, #fee2e2)', color: 'var(--danger-text, #991b1b)', borderRadius: '8px' }} data-testid="hygiene-doc-error">
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Documents Table / Cards View or Empty State */}
      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic' }}>
          {t('loading') || 'Laden...'}
        </div>
      ) : documents.length > 0 ? (
        isMobile ? (
          /* Cards View for under breakpoint (< 768px) */
          <div className="hygiene-doc-cards-list" data-testid="hygiene-documents-cards-list">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`hygiene-doc-card ${doc.is_active ? 'active-version' : ''}`}
                data-testid={`hygiene-doc-card-${doc.id}`}
              >
                <div className="hygiene-card-header">
                  <div className="hygiene-card-title-row">
                    <FileText size={20} color="var(--primary, #2563eb)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div className="hygiene-card-title-wrap">
                      <div className="hygiene-doc-title-line">
                        <a
                          href={`/api/hygiene/instruction-document/${doc.id}`}
                          download={doc.filename}
                          className="hygiene-doc-title-link hygiene-card-title"
                          title={t('downloadPdf') || 'Herunterladen'}
                          data-testid={`hygiene-doc-download-${doc.id}`}
                        >
                          <span data-testid={doc.is_active ? 'hygiene-active-doc-title' : undefined}>
                            {doc.title || doc.filename}
                          </span>
                        </a>
                        <a
                          href={`/api/hygiene/instruction-document/${doc.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hygiene-table-icon-btn"
                          title={t('hygieneViewInNewTab') || 'In neuem Tab ansehen'}
                          data-testid={`hygiene-doc-view-${doc.id}`}
                        >
                          <ExternalLink size={13} />
                        </a>
                      </div>
                      <span className="hygiene-card-subtitle">
                        {doc.filename} · {(doc.file_size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  </div>

                  {doc.is_active ? (
                    <span className="hygiene-badge-active" data-testid="badge-active-version">
                      <CheckCircle2 size={13} />
                      <span>{t('hygieneActiveVersionBadge') || 'aktuelle Version'}</span>
                    </span>
                  ) : (
                    <span className="hygiene-badge-archived">Archiviert</span>
                  )}
                </div>

                <div className="hygiene-card-body">
                  <div className="hygiene-card-field">
                    <span className="hygiene-card-field-label">Hochgeladen am</span>
                    <span className="hygiene-card-field-val">{formatDisplayDate(doc.created_at)}</span>
                  </div>
                  <div className="hygiene-card-field">
                    <span className="hygiene-card-field-label">Hochgeladen von</span>
                    <span className="hygiene-card-field-val">{doc.uploaded_by || '-'}</span>
                  </div>
                </div>

                <div className="hygiene-card-footer">
                  <div className="hygiene-table-actions">
                    <button
                      type="button"
                      className="hygiene-table-icon-btn delete"
                      onClick={() => handleDelete(doc)}
                      title="Dokument löschen"
                      data-testid={`hygiene-doc-delete-${doc.id}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Table View for desktop viewports (> 768px) */
          <div className="hygiene-doc-table-card" data-testid="hygiene-documents-table-wrapper">
            <table className="hygiene-doc-table" data-testid="hygiene-documents-table">
              <thead>
                <tr>
                  <th>Dokument / Titel</th>
                  <th>Status</th>
                  <th>Hochgeladen am</th>
                  <th>Hochgeladen von</th>
                  <th style={{ textAlign: 'right' }}>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} data-testid={`hygiene-doc-row-${doc.id}`} className={doc.is_active ? 'hygiene-active-row' : ''}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <FileText size={18} color="var(--primary, #2563eb)" style={{ flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <div className="hygiene-doc-title-line">
                            <a
                              href={`/api/hygiene/instruction-document/${doc.id}`}
                              download={doc.filename}
                              className="hygiene-doc-title-link"
                              title={t('downloadPdf') || 'Herunterladen'}
                              data-testid={`hygiene-doc-download-${doc.id}`}
                            >
                              <span data-testid={doc.is_active ? 'hygiene-active-doc-title' : undefined}>
                                {doc.title || doc.filename}
                              </span>
                            </a>
                            <a
                              href={`/api/hygiene/instruction-document/${doc.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hygiene-table-icon-btn"
                              title={t('hygieneViewInNewTab') || 'In neuem Tab ansehen'}
                              data-testid={`hygiene-doc-view-${doc.id}`}
                            >
                              <ExternalLink size={13} />
                            </a>
                          </div>
                          <span className="hygiene-doc-filename">
                            {doc.filename} · {(doc.file_size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {doc.is_active ? (
                        <span className="hygiene-badge-active" data-testid="badge-active-version">
                          <CheckCircle2 size={13} />
                          <span>{t('hygieneActiveVersionBadge') || 'aktuelle Version'}</span>
                        </span>
                      ) : (
                        <span className="hygiene-badge-archived">Archiviert</span>
                      )}
                    </td>
                    <td>{formatDisplayDate(doc.created_at)}</td>
                    <td>{doc.uploaded_by || '-'}</td>
                    <td>
                      <div className="hygiene-table-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="hygiene-table-icon-btn delete"
                          onClick={() => handleDelete(doc)}
                          title="Dokument löschen"
                          data-testid={`hygiene-doc-delete-${doc.id}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="hygiene-doc-empty-card" data-testid="hygiene-no-active-doc">
          <ShieldAlert size={40} color="var(--text-muted, #94a3b8)" />
          <h3 className="hygiene-doc-empty-title">
            {t('hygieneNoDocumentsYet') || 'Kein aktuelles Belehrungsdokument vorhanden.'}
          </h3>
          <p className="hygiene-doc-empty-desc">
            Laden Sie ein neues Dokument hoch, um die Hygienebelehrung für alle betroffenen Personen zu aktivieren.
          </p>
        </div>
      )}

      {/* Multi-Step Upload Wizard Modal */}
      <HygieneUploadWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={handleWizardSuccess}
      />
    </div>
  );
};
