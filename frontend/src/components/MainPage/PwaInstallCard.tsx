import React, { useState, useEffect } from 'react';
import { Smartphone, Download } from 'lucide-react';
import './PwaInstallCard.css';

const STORAGE_KEY = 'pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PwaInstallCard: React.FC = () => {
  const [isDismissed, setIsDismissed] = useState<boolean>(true); // default true until checked
  const [isStandalone, setIsStandalone] = useState<boolean>(true); // default true until checked
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check dismissed in localStorage
    const dismissed = localStorage.getItem(STORAGE_KEY) === 'true';
    setIsDismissed(dismissed);

    // Check standalone (already installed)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // Detect iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIos(ios);

    // Capture Android/Desktop beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsDismissed(true);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error('Install prompt error:', err);
    }
  };

  // Do not show if already in standalone app, already installed, or dismissed
  if (isStandalone || isDismissed || isInstalled) {
    return null;
  }

  return (
    <section className="main-page-card main-page-pwa-card" data-testid="main-page-pwa-card">
      <div className="main-page-card-header">
        <Smartphone size={22} className="main-page-card-icon pwa-card-icon" />
        <h2 className="main-page-card-title" data-testid="main-page-pwa-title">
          Tollhaus als App nutzen
        </h2>
      </div>

      <div className="main-page-card-body main-page-pwa-body">
        <p className="main-page-pwa-desc">
          Installiere Tollhaus auf deinem Startbildschirm für schnellen Vollbild-Zugriff ohne Browserleisten.
        </p>

        {isIos ? (
          /* iOS Safari Installation Steps */
          <div className="main-page-pwa-ios-steps">
            <div className="main-page-pwa-ios-step">
              <span className="main-page-pwa-step-badge">1</span>
              <span>
                Tippe unten in der Safari-Leiste auf <strong>Teilen</strong>{' '}
                <span className="main-page-pwa-inline-icon" aria-label="Teilen Symbol">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                </span>
              </span>
            </div>
            <div className="main-page-pwa-ios-step">
              <span className="main-page-pwa-step-badge">2</span>
              <span>
                Scrolle und wähle <strong>„Zum Home-Bildschirm“</strong>{' '}
                <span className="main-page-pwa-inline-icon" aria-label="Zum Home-Bildschirm Symbol">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </span>
              </span>
            </div>
          </div>
        ) : (
          /* Android / Desktop Installation Action */
          <div className="main-page-pwa-android-section">
            {deferredPrompt ? (
              <button
                type="button"
                className="main-page-pwa-install-btn"
                onClick={handleInstallClick}
                data-testid="main-page-pwa-install-btn"
              >
                <Download size={18} />
                <span>App jetzt installieren</span>
              </button>
            ) : (
              <div className="main-page-pwa-android-tip">
                Tippe im Browser-Menü (oben rechts auf <strong>⋮</strong>) auf <strong>„App installieren“</strong>.
              </div>
            )}
          </div>
        )}

        <div className="main-page-pwa-footer">
          <button
            type="button"
            className="main-page-pwa-dismiss-btn"
            onClick={handleDismiss}
            data-testid="main-page-pwa-dismiss-btn"
          >
            Nicht mehr anzeigen
          </button>
        </div>
      </div>
    </section>
  );
};
