import React, { useState, useEffect, useRef } from 'react';
import { Lightbulb, AlertTriangle, MessageSquare, CheckCircle2, X, Loader2 } from 'lucide-react';
import { useAuth, isKioskMode } from '../../context/AuthContext';
import { t } from '../../utils/i18n';
import './FeedbackModal.css';

export type FeedbackType = 'Verbesserungsvorschlag' | 'Fehlermeldung' | 'Andere';

export interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  token?: string | null;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  embedded = false,
  token = null,
}) => {
  const { user } = useAuth();
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('Verbesserungsvorschlag');
  const [description, setDescription] = useState<string>('');
  const [contactName, setContactName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFeedbackType('Verbesserungsvorschlag');
      setDescription('');

      // Pre-fill "Bei Rückfragen" with email if current user is not a kiosk
      const isKiosk = isKioskMode() || user?.roles?.includes('kiosk') || user?.email?.startsWith('kiosk@');
      const userEmail = user?.email || (token && token.includes('@') && !token.startsWith('kiosk') ? token : '');
      const defaultContact = (!isKiosk && userEmail) ? userEmail : '';
      setContactName(defaultContact);

      setIsSubmitting(false);
      setIsSuccess(false);
      setErrorMessage(null);

      // Focus textarea after render
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, user, token]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-App-View': 'dashboard',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/dashboard/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          feedback_type: feedbackType,
          description: description.trim(),
          contact_name: contactName.trim(),
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(errorText || `Status ${res.status}`);
      }

      setIsSuccess(true);
      // Automatically close after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: unknown) {
      console.error('Failed to submit feedback:', err);
      setErrorMessage(t('feedbackError'));
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="feedback-modal-overlay"
      data-testid="feedback-modal-overlay"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className={`feedback-modal-container ${embedded ? 'embedded' : ''}`}
        data-testid="feedback-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
      >
        <header className="feedback-modal-header">
          <div className="feedback-modal-title-wrap">
            <MessageSquare size={embedded ? 20 : 24} className="feedback-modal-header-icon" />
            <h2 id="feedback-modal-title" className="feedback-modal-title">
              {t('feedbackTitle')}
            </h2>
          </div>
          <button
            type="button"
            className="feedback-modal-close-btn"
            onClick={onClose}
            aria-label={t('feedbackCancel')}
            title={t('feedbackCancel')}
            disabled={isSubmitting}
            data-testid="feedback-modal-close-btn"
          >
            <X size={embedded ? 18 : 22} />
          </button>
        </header>

        {isSuccess ? (
          <div className="feedback-modal-success" data-testid="feedback-modal-success">
            <CheckCircle2 size={48} className="feedback-modal-success-icon" />
            <p className="feedback-modal-success-text">{t('feedbackSuccess')}</p>
          </div>
        ) : (
          <form className="feedback-modal-form" onSubmit={handleSubmit} data-testid="feedback-form">
            {errorMessage && (
              <div className="feedback-modal-error-banner" data-testid="feedback-modal-error">
                <AlertTriangle size={18} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Feedback Type Selector */}
            <div className="feedback-modal-field">
              <label className="feedback-modal-label">{t('feedbackType')}</label>
              <div className="feedback-modal-type-grid" role="radiogroup" aria-label={t('feedbackType')}>
                <button
                  type="button"
                  className={`feedback-type-btn ${feedbackType === 'Verbesserungsvorschlag' ? 'active' : ''}`}
                  onClick={() => setFeedbackType('Verbesserungsvorschlag')}
                  role="radio"
                  aria-checked={feedbackType === 'Verbesserungsvorschlag'}
                  data-testid="feedback-type-improvement"
                >
                  <Lightbulb size={16} className="feedback-type-icon improvement" />
                  <span>{t('feedbackTypeImprovement')}</span>
                </button>

                <button
                  type="button"
                  className={`feedback-type-btn ${feedbackType === 'Fehlermeldung' ? 'active' : ''}`}
                  onClick={() => setFeedbackType('Fehlermeldung')}
                  role="radio"
                  aria-checked={feedbackType === 'Fehlermeldung'}
                  data-testid="feedback-type-error"
                >
                  <AlertTriangle size={16} className="feedback-type-icon error" />
                  <span>{t('feedbackTypeError')}</span>
                </button>

                <button
                  type="button"
                  className={`feedback-type-btn ${feedbackType === 'Andere' ? 'active' : ''}`}
                  onClick={() => setFeedbackType('Andere')}
                  role="radio"
                  aria-checked={feedbackType === 'Andere'}
                  data-testid="feedback-type-other"
                >
                  <MessageSquare size={16} className="feedback-type-icon other" />
                  <span>{t('feedbackTypeOther')}</span>
                </button>
              </div>
            </div>

            {/* Description */}
            <div className="feedback-modal-field">
              <label htmlFor="feedback-description" className="feedback-modal-label">
                {t('feedbackDescription')} <span className="required-star">*</span>
              </label>
              <textarea
                id="feedback-description"
                ref={textareaRef}
                className="feedback-modal-textarea"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('feedbackDescriptionPlaceholder')}
                required
                data-testid="feedback-description-input"
              />
            </div>

            {/* Contact Name (Optional) */}
            <div className="feedback-modal-field">
              <label htmlFor="feedback-contact-name" className="feedback-modal-label">
                {t('feedbackContactLabel')} <span className="feedback-modal-optional-label">({t('optional') || 'optional'})</span>
              </label>
              <input
                id="feedback-contact-name"
                type="text"
                className="feedback-modal-input"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder={t('feedbackContactPlaceholder')}
                data-testid="feedback-contact-input"
              />
            </div>

            {/* Actions */}
            <div className="feedback-modal-actions">
              <button
                type="button"
                className="feedback-modal-btn cancel"
                onClick={onClose}
                disabled={isSubmitting}
                data-testid="feedback-cancel-btn"
              >
                {t('feedbackCancel')}
              </button>
              <button
                type="submit"
                className="feedback-modal-btn submit"
                disabled={isSubmitting || !description.trim()}
                data-testid="feedback-submit-btn"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} className="feedback-spinner" />
                    <span>{t('feedbackSending')}</span>
                  </>
                ) : (
                  <span>{t('feedbackSubmit')}</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
