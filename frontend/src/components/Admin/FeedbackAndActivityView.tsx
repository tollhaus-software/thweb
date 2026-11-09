import React, { useState } from 'react';
import { MessageSquare, Activity, Mail } from 'lucide-react';
import { t } from '../../utils/i18n';
import { FeedbackDashboard } from './FeedbackDashboard';
import { ActivityDashboard } from './ActivityDashboard';
import { EmailOutboxDashboard } from './EmailOutboxDashboard';

export interface FeedbackAndActivityViewProps {
  token: string | null;
  initialSubTab?: 'feedback' | 'activity' | 'emails';
}

export const FeedbackAndActivityView: React.FC<FeedbackAndActivityViewProps> = ({
  token,
  initialSubTab = 'feedback',
}) => {
  const [subTab, setSubTab] = useState<'feedback' | 'activity' | 'emails'>(initialSubTab);

  return (
    <div
      className="admin-feedback-activity-container"
      data-testid="feedback-and-activity-container"
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        padding: '1.25rem',
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Sub Tabs: 1. Feedback, 2. Activity and feature usage, 3. Email Outbox */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'feedback'}
            onClick={() => setSubTab('feedback')}
            data-testid="subtab-feedback"
            style={{
              padding: '0.5rem 1rem',
              background: subTab === 'feedback' ? 'var(--primary)' : 'var(--bg-subtle)',
              color: subTab === 'feedback' ? 'var(--primary-contrast, white)' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <MessageSquare size={16} />
            <span>{t('feedbackSubTab')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'activity'}
            onClick={() => setSubTab('activity')}
            data-testid="subtab-activity"
            style={{
              padding: '0.5rem 1rem',
              background: subTab === 'activity' ? 'var(--primary)' : 'var(--bg-subtle)',
              color: subTab === 'activity' ? 'var(--primary-contrast, white)' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <Activity size={16} />
            <span>{t('activitySubTab')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'emails'}
            onClick={() => setSubTab('emails')}
            data-testid="subtab-emails"
            style={{
              padding: '0.5rem 1rem',
              background: subTab === 'emails' ? 'var(--primary)' : 'var(--bg-subtle)',
              color: subTab === 'emails' ? 'var(--primary-contrast, white)' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <Mail size={16} />
            <span>{t('emailOutboxSubTab')}</span>
          </button>
        </div>
      </div>

      {/* Sub Tab Content */}
      {subTab === 'feedback' ? (
        <FeedbackDashboard token={token} />
      ) : subTab === 'activity' ? (
        <ActivityDashboard token={token} />
      ) : (
        <EmailOutboxDashboard token={token} />
      )}
    </div>
  );
};

export default FeedbackAndActivityView;
