import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Mail,
  Send,
  RefreshCw,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  RotateCcw,
  Calendar,
  User,
} from 'lucide-react';
import { t } from '../../utils/i18n';
import './FeedbackDashboard.css';

export interface EmailOutboxItem {
  id: string;
  created_at: string;
  updated_at: string;
  to_addr: string;
  subject: string;
  body: string;
  kind: string;
  created_by: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string;
  sent_at?: string;
  provider_message_id?: string;
  locked_at?: string;
  locked_by?: string;
}

export interface EmailOutboxDashboardProps {
  token: string | null;
}

export const EmailOutboxDashboard: React.FC<EmailOutboxDashboardProps> = ({ token }) => {
  const [items, setItems] = useState<EmailOutboxItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Test Email Form State
  const [showTestForm, setShowTestForm] = useState<boolean>(false);
  const [testToAddr, setTestToAddr] = useState<string>('');
  const [testSubject, setTestSubject] = useState<string>('Tollhaus Portal Test-E-Mail');
  const [testBody, setTestBody] = useState<string>(
    'Dies ist eine Test-E-Mail vom Tollhaus Portal.'
  );
  const [submittingTest, setSubmittingTest] = useState<boolean>(false);
  const [testSuccessMsg, setTestSuccessMsg] = useState<string | null>(null);

  const buildHeaders = useCallback(
    (jsonContent = false): Record<string, string> => {
      const headers: Record<string, string> = {};
      if (token && token !== 'null' && token !== 'undefined') {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (jsonContent) {
        headers['Content-Type'] = 'application/json';
      }
      return headers;
    },
    [token]
  );

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/emails?limit=200', { headers: buildHeaders() });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const data: EmailOutboxItem[] = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error('Failed to load email outbox:', err);
      setError(err instanceof Error ? err.message : 'Error loading email outbox');
    } finally {
      setLoading(false);
    }
  }, [buildHeaders]);

  useEffect(() => {
    void fetchEmails();
  }, [fetchEmails]);

  const handleEnqueueTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testToAddr.trim()) return;
    setSubmittingTest(true);
    setError(null);
    setTestSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/emails/test', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          to_addr: testToAddr.trim(),
          subject: testSubject.trim(),
          body: testBody.trim(),
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt.trim() || `HTTP error ${res.status}`);
      }
      setTestSuccessMsg(t('emailEnqueueSuccess'));
      setTestToAddr('');
      setShowTestForm(false);
      await fetchEmails();
    } catch (err: unknown) {
      console.error('Failed to enqueue test email:', err);
      setError(err instanceof Error ? err.message : 'Error enqueuing test email');
    } finally {
      setSubmittingTest(false);
    }
  };

  const handleRetry = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/emails/${id}/retry`, {
        method: 'POST',
        headers: buildHeaders(),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt.trim() || `HTTP error ${res.status}`);
      }
      await fetchEmails();
    } catch (err: unknown) {
      console.error('Failed to retry email:', err);
      setError(err instanceof Error ? err.message : 'Error retrying email');
    }
  };

  const handleDismiss = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/emails/${id}`, {
        method: 'DELETE',
        headers: buildHeaders(),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt.trim() || `HTTP error ${res.status}`);
      }
      await fetchEmails();
    } catch (err: unknown) {
      console.error('Failed to dismiss email:', err);
      setError(err instanceof Error ? err.message : 'Error dismissing email');
    }
  };

  const counts = useMemo(() => {
    let pending = 0;
    let sending = 0;
    let sent = 0;
    let failed = 0;
    for (const item of items) {
      if (item.status === 'pending') pending++;
      else if (item.status === 'sending') sending++;
      else if (item.status === 'sent') sent++;
      else if (item.status === 'failed') failed++;
    }
    return {
      all: items.length,
      pending,
      sending,
      sent,
      failed,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (item.to_addr || '').toLowerCase().includes(q) ||
        (item.subject || '').toLowerCase().includes(q) ||
        (item.body || '').toLowerCase().includes(q) ||
        (item.kind || '').toLowerCase().includes(q) ||
        (item.created_by || '').toLowerCase().includes(q) ||
        (item.last_error || '').toLowerCase().includes(q)
      );
    });
  }, [items, statusFilter, searchQuery]);

  const formatDateTime = (isoStr?: string) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return isoStr;
    }
  };

  const renderStatusBadge = (status: EmailOutboxItem['status']) => {
    switch (status) {
      case 'sent':
        return (
          <span
            className="feedback-badge"
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#059669',
              border: '1px solid rgba(16, 185, 129, 0.35)',
            }}
          >
            <CheckCircle2 size={14} />
            <span>{t('emailStatusSent')}</span>
          </span>
        );
      case 'failed':
        return (
          <span className="feedback-badge badge-error">
            <AlertTriangle size={14} />
            <span>{t('emailStatusFailed')}</span>
          </span>
        );
      case 'sending':
        return (
          <span className="feedback-badge badge-other">
            <RefreshCw size={14} className="feedback-spinning" />
            <span>{t('emailStatusSending')}</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="feedback-badge badge-improvement">
            <Clock size={14} />
            <span>{t('emailStatusPending')}</span>
          </span>
        );
    }
  };

  return (
    <div className="feedback-dashboard-container" data-testid="email-outbox-dashboard">
      {/* Toolbar */}
      <div className="feedback-dashboard-toolbar">
        <div className="feedback-search-box">
          <Search size={16} className="feedback-search-icon" />
          <input
            type="text"
            className="feedback-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`${t('search')}...`}
            data-testid="email-search-input"
          />
        </div>

        <div className="feedback-filter-pills" role="radiogroup" aria-label="Status">
          <button
            type="button"
            className={`feedback-pill-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
            data-testid="email-filter-all"
          >
            <span>{t('feedbackFilterAll')}</span>
            <span className="feedback-pill-count">{counts.all}</span>
          </button>

          <button
            type="button"
            className={`feedback-pill-btn ${statusFilter === 'pending' ? 'active' : ''}`}
            onClick={() => setStatusFilter('pending')}
            data-testid="email-filter-pending"
          >
            <Clock size={14} className="pill-icon improvement" />
            <span>{t('emailStatusPending')}</span>
            <span className="feedback-pill-count">{counts.pending}</span>
          </button>

          <button
            type="button"
            className={`feedback-pill-btn ${statusFilter === 'sending' ? 'active' : ''}`}
            onClick={() => setStatusFilter('sending')}
            data-testid="email-filter-sending"
          >
            <RefreshCw size={14} className="pill-icon other" />
            <span>{t('emailStatusSending')}</span>
            <span className="feedback-pill-count">{counts.sending}</span>
          </button>

          <button
            type="button"
            className={`feedback-pill-btn ${statusFilter === 'sent' ? 'active' : ''}`}
            onClick={() => setStatusFilter('sent')}
            data-testid="email-filter-sent"
          >
            <CheckCircle2 size={14} style={{ color: '#059669' }} />
            <span>{t('emailStatusSent')}</span>
            <span className="feedback-pill-count">{counts.sent}</span>
          </button>

          <button
            type="button"
            className={`feedback-pill-btn ${statusFilter === 'failed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('failed')}
            data-testid="email-filter-failed"
          >
            <AlertTriangle size={14} className="pill-icon error" />
            <span>{t('emailStatusFailed')}</span>
            <span className="feedback-pill-count">{counts.failed}</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => {
              setShowTestForm((prev) => !prev);
              setTestSuccessMsg(null);
            }}
            data-testid="email-send-test-toggle-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.9rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--primary-contrast, white)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            <Send size={15} />
            <span>{t('emailSendTestBtn')}</span>
          </button>

          <button
            type="button"
            className="feedback-refresh-btn"
            onClick={() => void fetchEmails()}
            disabled={loading}
            title={t('refresh') || 'Aktualisieren'}
            data-testid="email-refresh-btn"
          >
            <RefreshCw size={16} className={loading ? 'feedback-spinning' : ''} />
          </button>
        </div>
      </div>

      {/* Test Email Form */}
      {showTestForm && (
        <form
          onSubmit={handleEnqueueTest}
          data-testid="email-test-form"
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Mail size={17} />
            <span>{t('emailSendTestTitle')}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                {t('emailRecipientLabel')} *
              </label>
              <input
                type="email"
                required
                value={testToAddr}
                onChange={(e) => setTestToAddr(e.target.value)}
                placeholder={t('emailRecipientPlaceholder')}
                data-testid="email-test-to-input"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.45rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text)',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                {t('emailSubjectLabel')}
              </label>
              <input
                type="text"
                value={testSubject}
                onChange={(e) => setTestSubject(e.target.value)}
                data-testid="email-test-subject-input"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.45rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text)',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              {t('emailBodyLabel')}
            </label>
            <textarea
              rows={3}
              value={testBody}
              onChange={(e) => setTestBody(e.target.value)}
              data-testid="email-test-body-input"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.45rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)',
                color: 'var(--text)',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setShowTestForm(false)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {t('feedbackCancel')}
            </button>
            <button
              type="submit"
              disabled={submittingTest || !testToAddr.trim()}
              data-testid="email-test-submit-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.95rem',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--primary)',
                color: 'var(--primary-contrast, white)',
                fontWeight: 600,
                cursor: submittingTest || !testToAddr.trim() ? 'not-allowed' : 'pointer',
                opacity: submittingTest || !testToAddr.trim() ? 0.6 : 1,
                fontSize: '0.85rem',
              }}
            >
              <Send size={14} />
              <span>{t('emailEnqueueBtn')}</span>
            </button>
          </div>
        </form>
      )}

      {testSuccessMsg && (
        <div
          data-testid="email-enqueue-success-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: '#059669',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{testSuccessMsg}</span>
        </div>
      )}

      {error && (
        <div className="feedback-error-banner" data-testid="email-error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="feedback-loading-state" data-testid="email-loading">
          <RefreshCw size={24} className="feedback-spinning" />
          <span>{t('loading')}</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="feedback-empty-state" data-testid="email-empty-state">
          <Mail size={40} className="feedback-empty-icon" />
          <p>{t('emailOutboxEmpty')}</p>
        </div>
      ) : (
        <div className="feedback-table-wrapper">
          <table className="feedback-table" data-testid="email-outbox-table">
            <thead>
              <tr>
                <th style={{ width: '150px' }}>{t('feedbackDate')}</th>
                <th style={{ width: '140px' }}>Status</th>
                <th style={{ width: '210px' }}>{t('emailRecipientLabel')}</th>
                <th>{t('emailSubjectLabel')} / {t('emailBodyLabel')}</th>
                <th style={{ width: '180px' }}>{t('emailAttemptsLabel')}</th>
                <th style={{ width: '170px' }}>{t('emailCreatedByLabel')}</th>
                <th style={{ width: '110px' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} data-testid={`email-row-${item.id}`}>
                  <td className="feedback-cell-date">
                    <div className="feedback-date-time">
                      <Calendar size={14} className="cell-icon" />
                      <span>{formatDateTime(item.created_at)}</span>
                    </div>
                  </td>
                  <td>{renderStatusBadge(item.status)}</td>
                  <td style={{ fontWeight: 600, wordBreak: 'break-all' }}>{item.to_addr}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                      <span
                        style={{
                          padding: '0.1rem 0.4rem',
                          borderRadius: '4px',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {item.kind}
                      </span>
                      <strong style={{ fontSize: '0.9rem' }}>{item.subject}</strong>
                    </div>
                    <div className="feedback-desc-text" style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      {item.body}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.82rem' }}>
                      <strong>
                        {item.attempts} / {item.max_attempts}
                      </strong>
                    </div>
                    {item.sent_at && (
                      <div style={{ fontSize: '0.76rem', color: '#059669', marginTop: '0.2rem' }}>
                        {t('emailSentAtLabel')}: {formatDateTime(item.sent_at)}
                      </div>
                    )}
                    {item.last_error && (
                      <div
                        style={{
                          fontSize: '0.76rem',
                          color: '#dc2626',
                          marginTop: '0.2rem',
                          wordBreak: 'break-word',
                        }}
                        title={item.last_error}
                      >
                        {item.last_error}
                      </div>
                    )}
                  </td>
                  <td>
                    {item.created_by ? (
                      <span className="feedback-origin-badge user" title={item.created_by}>
                        <User size={13} />
                        <span>{item.created_by}</span>
                      </span>
                    ) : (
                      <span className="feedback-empty-field">-</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {item.status === 'failed' && (
                        <button
                          type="button"
                          onClick={() => void handleRetry(item.id)}
                          title={t('emailRetryBtn')}
                          data-testid={`email-retry-btn-${item.id}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0.35rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-subtle)',
                            color: 'var(--text)',
                            cursor: 'pointer',
                          }}
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                      {(item.status === 'failed' || item.status === 'pending') && (
                        <button
                          type="button"
                          onClick={() => void handleDismiss(item.id)}
                          title={t('emailDismissBtn')}
                          data-testid={`email-dismiss-btn-${item.id}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0.35rem',
                            borderRadius: '6px',
                            border: '1px solid rgba(220, 38, 38, 0.35)',
                            background: 'rgba(220, 38, 38, 0.08)',
                            color: '#dc2626',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default EmailOutboxDashboard;
