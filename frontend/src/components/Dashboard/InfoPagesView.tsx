import React, { useState, useEffect } from 'react';
import { Coffee, Flame, Sparkles, Scissors, BookOpen, ArrowLeft } from 'lucide-react';
import { t } from '../../utils/i18n';

export interface InfoPage {
  id: string;
  title: string;
  url: string;
  icon?: string;
  description?: string;
}

const DEFAULT_INFO_PAGES: InfoPage[] = [
  {
    id: 'kaffeemaschine',
    title: 'Kaffeemaschine',
    url: '/info-pages/kaffeemaschine.html',
    icon: 'coffee',
    description: 'Bedienung, Reinigung und Pflege der Kaffeemaschine',
  },
  {
    id: 'herd',
    title: 'Herd',
    url: '/info-pages/herd.html',
    icon: 'flame',
    description: 'Bedienung der Kochfelder und des Backofens',
  },
  {
    id: 'spuelmaschine',
    title: 'Spülmaschine',
    url: '/info-pages/spuelmaschine.html',
    icon: 'sparkles',
    description: 'Einräumen, Spülprogramme und Siebreinigung',
  },
  {
    id: 'schneidehilfe',
    title: 'Schneidehilfe',
    url: '/info-pages/schneidehilfe.html',
    icon: 'scissors',
    description: 'Sicherer Umgang und Reinigung der Schneidehilfe',
  },
];

export interface InfoPagesViewProps {
  embedded?: boolean;
  activePageId: string | null;
  onSelectPage: (id: string | null) => void;
  onBackToDashboard: () => void;
}

export const InfoPagesView: React.FC<InfoPagesViewProps> = ({
  embedded = false,
  activePageId,
  onSelectPage,
  onBackToDashboard,
}) => {
  const [pages, setPages] = useState<InfoPage[]>(DEFAULT_INFO_PAGES);

  useEffect(() => {
    let ignore = false;
    const fetchManifest = async () => {
      try {
        const res = await fetch('/info-pages/manifest.json');
        if (!res.ok) return;
        const data = await res.json();
        if (!ignore && Array.isArray(data) && data.length > 0) {
          setPages(data);
        }
      } catch {
        // Fall back to default pages
      }
    };
    void fetchManifest();
    return () => {
      ignore = true;
    };
  }, []);

  const renderIcon = (iconName?: string) => {
    const size = embedded ? 40 : 54;
    switch (iconName?.toLowerCase()) {
      case 'coffee':
      case 'kaffeemaschine':
        return <Coffee size={size} />;
      case 'flame':
      case 'herd':
        return <Flame size={size} />;
      case 'sparkles':
      case 'spuelmaschine':
        return <Sparkles size={size} />;
      case 'scissors':
      case 'schneidehilfe':
        return <Scissors size={size} />;
      default:
        return <BookOpen size={size} />;
    }
  };

  const activePage = activePageId
    ? pages.find((p) => p.id.toLowerCase() === activePageId.toLowerCase())
    : null;

  if (activePage) {
    return (
      <div className="kiosk-info-page-view" data-testid="kiosk-info-page-view">
        <header className="kiosk-info-page-header">
          <button
            onClick={() => onSelectPage(null)}
            className="kiosk-info-page-back-btn"
            data-testid="info-pages-back-to-grid-btn"
            title={t('infoPages')}
            aria-label={t('infoPages')}
          >
            <ArrowLeft size={embedded ? 18 : 22} />
            <span>{t('infoPages')}</span>
          </button>
          <h2 className="kiosk-info-page-title">{activePage.title}</h2>
          <div style={{ width: embedded ? 80 : 120 }} />
        </header>

        <iframe
          src={activePage.url}
          title={activePage.title}
          className="kiosk-info-page-frame"
          allow="autoplay; fullscreen; encrypted-media"
          data-testid="info-page-iframe"
        />
      </div>
    );
  }

  return (
    <div className="kiosk-info-pages-container" data-testid="kiosk-info-pages-container">
      <header className="kiosk-header">
        <button
          onClick={onBackToDashboard}
          className="kiosk-info-page-back-btn"
          data-testid="info-pages-back-to-dashboard-btn"
          title={t('home')}
          aria-label={t('home')}
        >
          <ArrowLeft size={embedded ? 18 : 22} />
          <span>{t('home')}</span>
        </button>

        <h1 className="kiosk-header-date">{t('infoPages')}</h1>

        <div style={{ width: embedded ? 80 : 120 }} />
      </header>

      <div className="kiosk-info-pages-grid" data-testid="kiosk-info-pages-grid">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            className="kiosk-info-page-box"
            onClick={() => onSelectPage(page.id)}
            data-testid={`kiosk-info-page-box-${page.id}`}
            title={page.title}
            aria-label={page.title}
          >
            <div className="kiosk-info-page-box-icon">
              {renderIcon(page.icon || page.id)}
            </div>
            <h3 className="kiosk-info-page-box-title">{page.title}</h3>
            {page.description && (
              <p className="kiosk-info-page-box-desc">{page.description}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default InfoPagesView;
