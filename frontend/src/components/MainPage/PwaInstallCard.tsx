import React, { useState, useEffect } from 'react';
import { Smartphone, Download, Copy, Check, Compass, X, ChevronDown, ChevronUp } from 'lucide-react';
import { pwaInstallStore, usePwaInstallState, type PwaInstallSnapshot } from '../../utils/pwaInstall';
import { t } from '../../utils/i18n';
import './PwaInstallCard.css';

const ShareIconInline: React.FC = () => (
  <span className="main-page-pwa-inline-icon" aria-label="Teilen Symbol">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  </span>
);

const AddToHomeIconInline: React.FC = () => (
  <span className="main-page-pwa-inline-icon" aria-label="Zum Home-Bildschirm Symbol">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  </span>
);

const CopyUrlButton: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const targetUrl = typeof window !== 'undefined' ? `${window.location.origin}/` : '';
    if (!targetUrl) return;

    let ok = false;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(targetUrl);
        ok = true;
      } catch {
        ok = false;
      }
    }

    if (!ok && typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = targetUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        ok = true;
      } catch {
        ok = false;
      }
    }

    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <button
      type="button"
      className="main-page-pwa-copy-btn"
      onClick={() => void handleCopy()}
      data-testid="pwa-copy-link-btn"
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
      <span>{copied ? t('pwaLinkCopied') : t('pwaCopyLink')}</span>
    </button>
  );
};

interface PwaInstallInstructionsContentProps {
  state: PwaInstallSnapshot;
  onInstalled?: () => void;
  testIdPrefix?: string;
}

export const PwaInstallInstructionsContent: React.FC<PwaInstallInstructionsContentProps> = ({
  state,
  onInstalled,
  testIdPrefix = 'main-page-pwa',
}) => {
  const { deferredPrompt, platformInfo } = state;
  const { platform, isIos } = platformInfo;

  const handleInstallClick = async () => {
    const accepted = await pwaInstallStore.promptInstall();
    if (accepted) {
      onInstalled?.();
    }
  };

  return (
    <>
      <p className="main-page-pwa-desc">
        Installiere Tollhaus auf deinem Startbildschirm für schnellen Vollbild-Zugriff ohne Browserleisten.
      </p>

      {isIos ? (
        platform === 'ios-inapp' ? (
          <div className="main-page-pwa-ios-steps main-page-pwa-warning-box" data-testid="pwa-ios-inapp-steps">
            <div className="main-page-pwa-context-note">
              <Compass size={18} className="main-page-pwa-note-icon" />
              <span>
                Du hast diesen Link in einer App geöffnet. In-App-Browser unterstützen <strong>„Zum Home-Bildschirm“</strong> nicht.
              </span>
            </div>
            <div className="main-page-pwa-ios-step">
              <span className="main-page-pwa-step-badge">1</span>
              <span>
                Tippe unten oder oben rechts auf das <strong>Safari-Symbol (Kompass)</strong>, oder kopiere den Link für <strong>Safari</strong>:
              </span>
            </div>
            <div className="main-page-pwa-copy-row">
              <CopyUrlButton />
            </div>
            <div className="main-page-pwa-ios-step">
              <span className="main-page-pwa-step-badge">2</span>
              <span>
                Wähle in Safari <strong>Teilen</strong> <ShareIconInline /> und dann <strong>„Zum Home-Bildschirm“</strong> <AddToHomeIconInline />
              </span>
            </div>
          </div>
        ) : platform === 'ios-chrome' ? (
          <div className="main-page-pwa-ios-steps" data-testid="pwa-ios-chrome-steps">
            <div className="main-page-pwa-ios-step">
              <span className="main-page-pwa-step-badge">1</span>
              <span>
                Tippe in Chrome <strong>oben rechts</strong> in der Adressleiste auf <strong>Teilen</strong> <ShareIconInline />
              </span>
            </div>
            <div className="main-page-pwa-ios-step">
              <span className="main-page-pwa-step-badge">2</span>
              <span>
                Scrolle nach unten, wähle <strong>„Zum Home-Bildschirm“</strong> <AddToHomeIconInline /> und tippe auf <strong>„Hinzufügen“</strong>
              </span>
            </div>
          </div>
        ) : platform === 'ios-other' ? (
          <div className="main-page-pwa-ios-steps main-page-pwa-warning-box" data-testid="pwa-ios-other-steps">
            <div className="main-page-pwa-context-note">
              <Compass size={18} className="main-page-pwa-note-icon" />
              <span>
                Für die App-Installation auf dem iPhone/iPad öffne diese Seite bitte in <strong>Safari</strong>.
              </span>
            </div>
            <div className="main-page-pwa-ios-step">
              <span className="main-page-pwa-step-badge">1</span>
              <span>Kopiere den Link und öffne ihn in <strong>Safari</strong>:</span>
            </div>
            <div className="main-page-pwa-copy-row">
              <CopyUrlButton />
            </div>
            <div className="main-page-pwa-ios-step">
              <span className="main-page-pwa-step-badge">2</span>
              <span>
                Tippe in Safari auf <strong>Teilen</strong> <ShareIconInline /> → <strong>„Zum Home-Bildschirm“</strong> <AddToHomeIconInline /> → <strong>„Hinzufügen“</strong>
              </span>
            </div>
          </div>
        ) : (
          /* Real Safari on iOS (or SFSafariViewController sheet) */
          <div className="main-page-pwa-ios-steps" data-testid="pwa-ios-safari-steps">
            <div className="main-page-pwa-ios-step">
              <span className="main-page-pwa-step-badge">1</span>
              <span>
                Tippe in der Safari-Leiste auf <strong>Teilen</strong> <ShareIconInline /> (oder zuerst auf <strong>•••</strong> und dann <strong>Teilen</strong>)
              </span>
            </div>
            <div className="main-page-pwa-ios-step">
              <span className="main-page-pwa-step-badge">2</span>
              <span>
                Scrolle nach unten, wähle <strong>„Zum Home-Bildschirm“</strong> <AddToHomeIconInline /> und tippe oben rechts auf <strong>„Hinzufügen“</strong>
              </span>
            </div>
            <p className="main-page-pwa-ios-hint" data-testid="pwa-ios-safari-hint">
              Kein „Zum Home-Bildschirm“ im Menü? Falls du den Link aus einer App (z.&nbsp;B. Mail, WhatsApp, Signal) geöffnet hast, tippe zuerst unten rechts auf das <strong>Safari-Symbol (Kompass)</strong>.
            </p>
          </div>
        )
      ) : (
        /* Android / Chromium Installation Action */
        <div className="main-page-pwa-android-section">
          {deferredPrompt ? (
            <button
              type="button"
              className="main-page-pwa-install-btn"
              onClick={() => void handleInstallClick()}
              data-testid={`${testIdPrefix}-install-btn`}
            >
              <Download size={18} />
              <span>App jetzt installieren</span>
            </button>
          ) : (
            <div className="main-page-pwa-android-tip">
              Tippe im Browser-Menü (oben rechts auf <strong>⋮</strong>) auf <strong>„App installieren“</strong> oder <strong>„Zum Startbildschirm hinzufügen“</strong>.
            </div>
          )}
        </div>
      )}
    </>
  );
};

export const PwaInstallCard: React.FC = () => {
  const state = usePwaInstallState();
  const { isDismissed, isStandalone, isInstalled, deferredPrompt, platformInfo } = state;
  const [isExpanded, setIsExpanded] = useState(false);

  // Do not show if not on a mobile device, already in standalone app, already installed, or dismissed
  if (!platformInfo.isMobile || isStandalone || isDismissed || isInstalled) {
    return null;
  }

  const handlePrimaryBannerAction = async () => {
    if (!platformInfo.isIos && deferredPrompt) {
      await pwaInstallStore.promptInstall();
      return;
    }
    setIsExpanded((prev) => !prev);
  };

  return (
    <section
      className={`main-page-card main-page-pwa-card ${isExpanded ? 'is-expanded' : 'is-compact'}`}
      data-testid="main-page-pwa-card"
    >
      <div className="main-page-pwa-banner-row">
        <button
          type="button"
          className="main-page-pwa-banner-toggle"
          onClick={() => void handlePrimaryBannerAction()}
          aria-expanded={!platformInfo.isIos && deferredPrompt ? undefined : isExpanded}
          data-testid="main-page-pwa-toggle-btn"
        >
          <Smartphone size={20} className="main-page-card-icon pwa-card-icon" />
          <h2 className="main-page-card-title main-page-pwa-banner-title" data-testid="main-page-pwa-title">
            Tollhaus als App nutzen
          </h2>
          <span className="main-page-pwa-banner-cta">
            {!platformInfo.isIos && deferredPrompt ? (
              <>
                <Download size={15} />
                <span>Installieren</span>
              </>
            ) : (
              <>
                <span>{isExpanded ? 'Schließen' : 'Anleitung'}</span>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </>
            )}
          </span>
        </button>

        <button
          type="button"
          className="main-page-pwa-banner-dismiss-icon"
          onClick={() => pwaInstallStore.dismiss()}
          aria-label="Nicht mehr anzeigen"
          title="Nicht mehr anzeigen"
          data-testid="main-page-pwa-dismiss-btn"
        >
          <X size={18} />
        </button>
      </div>

      {isExpanded && (
        <div className="main-page-card-body main-page-pwa-body" data-testid="main-page-pwa-expanded-body">
          <PwaInstallInstructionsContent state={state} testIdPrefix="main-page-pwa" />

          <div className="main-page-pwa-footer">
            <button
              type="button"
              className="main-page-pwa-dismiss-btn"
              onClick={() => pwaInstallStore.dismiss()}
              data-testid="main-page-pwa-dismiss-text-btn"
            >
              Nicht mehr anzeigen
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

interface PwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({ isOpen, onClose }) => {
  const state = usePwaInstallState();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay pwa-install-modal-overlay"
      data-testid="pwa-install-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-container pwa-install-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-modal-title"
        data-testid="pwa-install-modal"
      >
        <div className="simulator-modal-header">
          <div className="simulator-modal-title">
            <Smartphone size={20} className="simulator-modal-icon" />
            <h2 id="pwa-install-modal-title">Tollhaus als App nutzen</h2>
          </div>
          <button
            type="button"
            className="simulator-close-btn"
            onClick={onClose}
            aria-label={t('close')}
            data-testid="pwa-install-modal-close-icon"
          >
            <X size={20} />
          </button>
        </div>

        <div className="pwa-install-modal-body main-page-pwa-body">
          <PwaInstallInstructionsContent
            state={state}
            onInstalled={onClose}
            testIdPrefix="pwa-modal"
          />
        </div>

        <div className="simulator-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={onClose}
            data-testid="pwa-install-modal-close"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};
