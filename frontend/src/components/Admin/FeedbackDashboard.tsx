import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  Lightbulb,
  AlertTriangle,
  RefreshCw,
  Search,
  Tablet,
  User,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { t } from '../../utils/i18n';
import './FeedbackDashboard.css';

export interface FeedbackItem {
  id: string;
  feedback_type: string;
  description: string;
  contact_name: string;
  submitted_by?: string;
  submitted_by_email?: string;
  is_kiosk: boolean;
  kiosk_name?: string;
  created_at: string;
}

export interface FeedbackDashboardProps {
  token: string | null;
}

export const FeedbackDashboard: React.FC<FeedbackDashboardProps> = ({ token }) => {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (token && token !== 'null' && token !== 'undefined') {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/admin/feedback?limit=200', { headers });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const data: FeedbackItem[] = await res.json();
      setFeedbacks(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error('Failed to load feedback:', err);
      setError(err instanceof Error ? err.message : 'Error loading feedback');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchFeedback();
  }, [fetchFeedback]);

  // Counts by type
  const counts = useMemo(() => {
    let improvements = 0;
    let bugs = 0;
    let others = 0;
    for (const f of feedbacks) {
      if (f.feedback_type === 'Verbesserungsvorschlag') improvements++;
      else if (f.feedback_type === 'Fehlermeldung') bugs++;
      else others++;
    }
    return {
      all: feedbacks.length,
      improvement: improvements,
      bug: bugs,
      other: others,
    };
  }, [feedbacks]);

  // Filtered feedbacks
  const filteredFeedbacks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return feedbacks.filter((f) => {
      if (typeFilter !== 'all' && f.feedback_type !== typeFilter) {
        return false;
      }
      if (!q) return true;
      const desc = (f.description || '').toLowerCase();
      const contact = (f.contact_name || '').toLowerCase();
      const email = (f.submitted_by_email || '').toLowerCase();
      const kiosk = (f.kiosk_name || '').toLowerCase();
      const type = (f.feedback_type || '').toLowerCase();
      return (
        desc.includes(q) ||
        contact.includes(q) ||
        email.includes(q) ||
        kiosk.includes(q) ||
        type.includes(q)
      );
    });
  }, [feedbacks, typeFilter, searchQuery]);

  const formatDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const pad = (n: number) => String(n).padStart(2, '0');
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const year = d.getFullYear();
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch {
      return isoStr;
    }
  };

  const renderTypeBadge = (type: string) => {
    switch (type) {
      case 'Verbesserungsvorschlag':
        return (
          <span className="feedback-badge badge-improvement">
            <Lightbulb size={14} />
            <span>{t('feedbackTypeImprovement')}</span>
          </span>
        );
      case 'Fehlermeldung':
        return (
          <span className="feedback-badge badge-error">
            <AlertTriangle size={14} />
            <span>{t('feedbackTypeError')}</span>
          </span>
        );
      default:
        return (
          <span className="feedback-badge badge-other">
            <MessageSquare size={14} />
            <span>{t('feedbackTypeOther')}</span>
          </span>
        );
    }
  };

  return (
    <div className="feedback-dashboard-container" data-testid="feedback-dashboard">
      {/* Header controls: Search, Type filter, Refresh */}
      <div className="feedback-dashboard-toolbar">
        <div className="feedback-search-box">
          <Search size={16} className="feedback-search-icon" />
          <input
            type="text"
            className="feedback-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`${t('search')}...`}
            data-testid="feedback-search-input"
          />
        </div>

        <div className="feedback-filter-pills" role="radiogroup" aria-label={t('feedbackType')}>
          <button
            type="button"
            className={`feedback-pill-btn ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTypeFilter('all')}
            data-testid="feedback-filter-all"
          >
            <span>{t('feedbackFilterAll')}</span>
            <span className="feedback-pill-count">{counts.all}</span>
          </button>

          <button
            type="button"
            className={`feedback-pill-btn ${typeFilter === 'Verbesserungsvorschlag' ? 'active' : ''}`}
            onClick={() => setTypeFilter('Verbesserungsvorschlag')}
            data-testid="feedback-filter-improvement"
          >
            <Lightbulb size={14} className="pill-icon improvement" />
            <span>{t('feedbackTypeImprovement')}</span>
            <span className="feedback-pill-count">{counts.improvement}</span>
          </button>

          <button
            type="button"
            className={`feedback-pill-btn ${typeFilter === 'Fehlermeldung' ? 'active' : ''}`}
            onClick={() => setTypeFilter('Fehlermeldung')}
            data-testid="feedback-filter-error"
          >
            <AlertTriangle size={14} className="pill-icon error" />
            <span>{t('feedbackTypeError')}</span>
            <span className="feedback-pill-count">{counts.bug}</span>
          </button>

          <button
            type="button"
            className={`feedback-pill-btn ${typeFilter === 'Andere' ? 'active' : ''}`}
            onClick={() => setTypeFilter('Andere')}
            data-testid="feedback-filter-other"
          >
            <MessageSquare size={14} className="pill-icon other" />
            <span>{t('feedbackTypeOther')}</span>
            <span className="feedback-pill-count">{counts.other}</span>
          </button>
        </div>

        <button
          type="button"
          className="feedback-refresh-btn"
          onClick={() => void fetchFeedback()}
          disabled={loading}
          title={t('refresh') || 'Aktualisieren'}
          data-testid="feedback-refresh-btn"
        >
          <RefreshCw size={16} className={loading ? 'feedback-spinning' : ''} />
        </button>
      </div>

      {error && (
        <div className="feedback-error-banner" data-testid="feedback-error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading && feedbacks.length === 0 ? (
        <div className="feedback-loading-state" data-testid="feedback-loading">
          <RefreshCw size={24} className="feedback-spinning" />
          <span>{t('loading')}</span>
        </div>
      ) : filteredFeedbacks.length === 0 ? (
        <div className="feedback-empty-state" data-testid="feedback-empty-state">
          <MessageSquare size={40} className="feedback-empty-icon" />
          <p>{t('feedbackEmpty')}</p>
        </div>
      ) : (
        <div className="feedback-table-wrapper">
          <table className="feedback-table" data-testid="feedback-table">
            <thead>
              <tr>
                <th style={{ width: '160px' }}>{t('feedbackDate')}</th>
                <th style={{ width: '170px' }}>{t('feedbackTypeLabel')}</th>
                <th>{t('feedbackDescriptionLabel')}</th>
                <th style={{ width: '210px' }}>{t('feedbackContact')}</th>
                <th style={{ width: '190px' }}>{t('source') || 'Quelle'}</th>
              </tr>
            </thead>
            <tbody>
              {filteredFeedbacks.map((item) => (
                <tr key={item.id} data-testid={`feedback-row-${item.id}`}>
                  <td className="feedback-cell-date">
                    <div className="feedback-date-time">
                      <Calendar size={14} className="cell-icon" />
                      <span>{formatDateTime(item.created_at)}</span>
                    </div>
                  </td>
                  <td className="feedback-cell-type">{renderTypeBadge(item.feedback_type)}</td>
                  <td className="feedback-cell-desc">
                    <div className="feedback-desc-text">{item.description}</div>
                  </td>
                  <td className="feedback-cell-contact">
                    {item.contact_name ? (
                      <span className="feedback-contact-badge" title={item.contact_name}>
                        <User size={13} />
                        <span>{item.contact_name}</span>
                      </span>
                    ) : (
                      <span className="feedback-empty-field">-</span>
                    )}
                  </td>
                  <td className="feedback-cell-origin">
                    {item.is_kiosk ? (
                      <span className="feedback-origin-badge kiosk" title={item.kiosk_name || 'Kiosk'}>
                        <Tablet size={13} />
                        <span>{item.kiosk_name ? `Kiosk: ${item.kiosk_name}` : 'Kiosk Tablet'}</span>
                      </span>
                    ) : (
                      <span className="feedback-origin-badge user" title={item.submitted_by_email || 'Benutzer'}>
                        <User size={13} />
                        <span>{item.submitted_by_email || t('feedbackOriginUser')}</span>
                      </span>
                    )}
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

export default FeedbackDashboard;
