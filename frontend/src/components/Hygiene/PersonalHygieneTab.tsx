import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  ExternalLink,
  Download,
  AlertCircle,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { t, formatDisplayDate } from '../../utils/i18n';
import { HygieneCertificationModal } from './HygieneCertificationModal';
import { getHygieneMessage } from '../../utils/hygieneMessage';
import './PersonalHygieneTab.css';

interface HygieneStatusData {
  is_parent: boolean;
  parent_id?: string;
  needs_instruction: boolean;
  display_name?: string;
  last_instruction_date?: string;
  last_instruction_type?: string;
  next_due_date?: string;
  document_available: boolean;
  document_info?: {
    id: string;
    filename: string;
    title: string;
    file_size: number;
    created_at: string;
  };
}

export interface PersonalHygieneTabProps {
  onRefreshParentData?: () => void;
}

export const PersonalHygieneTab: React.FC<PersonalHygieneTabProps> = ({ onRefreshParentData }) => {
  const [status, setStatus] = useState<HygieneStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/hygiene/my-status', { headers });
      if (!res.ok) {
        throw new Error(`Fehler beim Laden des Status (${res.status})`);
      }
      const data = await res.json();
      setStatus(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden des Hygiene-Status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleModalSuccess = () => {
    void fetchStatus();
    if (onRefreshParentData) {
      onRefreshParentData();
    }
  };

  if (loading) {
    return (
      <div className="personal-hygiene-container" data-testid="personal-hygiene-loading">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
          <RefreshCw size={18} className="spin" />
          <span>Lade Hygiene-Informationen...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="personal-hygiene-container" data-testid="personal-hygiene-error">
        <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void fetchStatus()}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: '#991b1b' }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
    );
  }

  const isDue = Boolean(status?.needs_instruction);
  const hygieneMessage = getHygieneMessage(status);
  const hasHistory = Boolean(status?.last_instruction_date);
  const docInfo = status?.document_info;
  const docTitle = docInfo?.title || docInfo?.filename || t('hygieneBelehrung');

  return (
    <div className="personal-hygiene-container" data-testid="personal-hygiene-tab">
      <div className="personal-hygiene-header">
        <h1 className="personal-hygiene-title">{t('personalHygieneTitle')}</h1>
        <p className="personal-hygiene-subtitle">{t('personalHygieneSubtitle')}</p>
      </div>

      {/* Personal Status Card */}
      <section className="personal-hygiene-status-card" data-testid="personal-hygiene-status-card">
        <div className="personal-hygiene-status-top">
          <div className="personal-hygiene-badge-wrap">
            {isDue ? (
              <span className="personal-hygiene-badge due" data-testid="hygiene-status-badge-due">
                <ShieldAlert size={18} />
                <span>{t('hygieneStatusDue')}</span>
              </span>
            ) : hasHistory ? (
              <span className="personal-hygiene-badge valid" data-testid="hygiene-status-badge-valid">
                <ShieldCheck size={18} />
                <span>{t('hygieneStatusValid')}</span>
              </span>
            ) : (
              <span className="personal-hygiene-badge pending" data-testid="hygiene-status-badge-pending">
                <Clock size={18} />
                <span>{t('hygieneStatusPending')}</span>
              </span>
            )}
          </div>

          {isDue && status?.document_available && (
            <button
              type="button"
              className="personal-hygiene-certify-btn"
              onClick={() => setModalOpen(true)}
              data-testid="personal-hygiene-start-btn"
            >
              <FileText size={16} />
              <span>{t('startFollowupInstruction')}</span>
            </button>
          )}
        </div>

        {hygieneMessage && (
          <p
            className={`personal-hygiene-message ${hygieneMessage.kind}`}
            data-testid="personal-hygiene-message"
            data-kind={hygieneMessage.kind}
          >
            {hygieneMessage.text}
          </p>
        )}

        <div className="personal-hygiene-dates-grid">
          <div className="personal-hygiene-date-item">
            <span className="personal-hygiene-date-label">{t('lastCertification')}</span>
            <span className="personal-hygiene-date-val" data-testid="hygiene-last-date-val">
              {status?.last_instruction_date ? formatDisplayDate(status.last_instruction_date) : '-'}
            </span>
          </div>

          <div className="personal-hygiene-date-item">
            <span className="personal-hygiene-date-label">{t('nextDue')}</span>
            <span className="personal-hygiene-date-val" data-testid="hygiene-next-date-val">
              {status?.next_due_date ? formatDisplayDate(status.next_due_date) : '-'}
            </span>
          </div>
        </div>
      </section>

      {/* Document Reader Card */}
      {status?.document_available ? (
        <section className="personal-hygiene-doc-card" data-testid="personal-hygiene-doc-card">
          <div className="personal-hygiene-doc-header">
            <h2 className="personal-hygiene-doc-title">{docTitle}</h2>
            <div className="personal-hygiene-doc-actions">
              <a
                href="/api/hygiene/instruction-document"
                target="_blank"
                rel="noopener noreferrer"
                className="personal-hygiene-action-btn"
                data-testid="personal-hygiene-open-ext-btn"
              >
                <ExternalLink size={15} />
                <span>{t('openPdfNewTab')}</span>
              </a>
              <a
                href="/api/hygiene/instruction-document"
                download={docInfo?.filename || 'Hygiene-Folgebelehrung.pdf'}
                className="personal-hygiene-action-btn"
                data-testid="personal-hygiene-download-btn"
              >
                <Download size={15} />
                <span>{t('downloadPdf')}</span>
              </a>
            </div>
          </div>

          <div className="personal-hygiene-iframe-wrap">
            <iframe
              src="/api/hygiene/instruction-document"
              title={docTitle}
              className="personal-hygiene-iframe"
              data-testid="personal-hygiene-iframe"
            />
          </div>
        </section>
      ) : (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-muted)' }}>
          {t('noActiveDocConfigured')}
        </div>
      )}

      {/* Certification Modal */}
      <HygieneCertificationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleModalSuccess}
        documentTitle={docTitle}
        documentFilename={docInfo?.filename}
        userName={status?.display_name}
      />
    </div>
  );
};
