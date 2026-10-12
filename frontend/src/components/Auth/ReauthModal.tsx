import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reauthManager, type ReauthState } from '../../utils/reauthManager';
import { t } from '../../utils/i18n';
import { Lock, AlertCircle } from 'lucide-react';

export const ReauthModal: React.FC = () => {
  const { user, login } = useAuth();
  const [state, setState] = useState<ReauthState>(() => reauthManager.getState());

  useEffect(() => {
    return reauthManager.subscribe((newState) => {
      setState(newState);
    });
  }, []);

  if (!state.isOpen) {
    return null;
  }

  const clientId = window.ENV?.GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID || 'mock';
  const isMock = !clientId || clientId === 'mock';

  const isBusy = state.status === 'opening_popup' || state.status === 'popup_active';

  const handleReauthClick = () => {
    if (isMock) {
      const emailToUse = user?.email || 'developer@example.com';
      reauthManager.handleMockLogin(emailToUse, login);
    } else {
      reauthManager.launchPopup().catch((err) => {
        console.warn('[AUTH] Reauth popup flow cancelled or failed:', err);
      });
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div
        className="modal-container"
        style={{
          maxWidth: '480px',
          padding: '28px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'rgba(234, 179, 8, 0.15)',
              color: '#eab308',
            }}
          >
            <Lock size={22} />
          </div>
          <h2 style={{ margin: 0, fontSize: '1.35rem' }}>{t('sessionExpiredTitle')}</h2>
        </div>

        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px' }}>
          {t('sessionExpiredMessage')}
        </p>

        {state.popupBlocked && (
          <div
            style={{
              padding: '12px',
              marginBottom: '16px',
              borderRadius: '6px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '0.875rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{t('reauthPopupBlocked')}</span>
            </div>
            <a
              href="/oauth2/start?rd=/auth-callback.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                color: '#60a5fa',
                fontWeight: 600,
                textDecoration: 'underline',
              }}
            >
              {t('reauthOpenInNewTab')}
            </a>
          </div>
        )}

        {state.errorMessage === 'popupClosed' && !state.popupBlocked && (
          <div
            style={{
              padding: '10px 14px',
              marginBottom: '16px',
              borderRadius: '6px',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fbbf24',
              fontSize: '0.875rem',
            }}
          >
            {t('reauthPopupClosed')}
          </div>
        )}

        {isBusy && (
          <div
            style={{
              padding: '14px',
              marginBottom: '16px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--text-h)',
              fontSize: '0.92rem',
            }}
          >
            <div
              style={{
                width: '18px',
                height: '18px',
                border: '2px solid rgba(255,255,255,0.2)',
                borderTopColor: '#38bdf8',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span>{t('reauthWaiting')}</span>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button
            type="button"
            className="submit-btn"
            onClick={handleReauthClick}
            disabled={isBusy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            {!isMock && (
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path
                  fill="#fff"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#fff"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#fff"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#fff"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            {isMock ? t('reauthMockLogin') : t('reauthButton')}
          </button>
        </div>
      </div>
    </div>
  );
};
