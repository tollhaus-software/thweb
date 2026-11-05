import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, LogOut, Eye, ExternalLink, LayoutDashboard, History, Shield, Key, User, MessageSquare } from 'lucide-react';
import { t } from '../../utils/i18n';
import type { TabId } from '../../utils/navigation';

export interface HeaderOverflowMenuProps {
  onLogout: () => void;
  className?: string;
  userEmail?: string;
  canSimulate?: boolean;
  onOpenSimulator?: () => void;
  onOpenFeedback?: () => void;
  onSelectTab?: (tab: TabId) => void;
  canReadAudit?: boolean;
  canManageUsers?: boolean;
  canProvisionKiosk?: boolean;
  activeTab?: string;
}

export const HeaderOverflowMenu: React.FC<HeaderOverflowMenuProps> = ({
  onLogout,
  className = '',
  userEmail,
  canSimulate = false,
  onOpenSimulator,
  onOpenFeedback,
  onSelectTab,
  canReadAudit = false,
  canManageUsers = false,
  canProvisionKiosk = false,
  activeTab = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  const handleLogoutClick = () => {
    setIsOpen(false);
    onLogout();
  };

  const handleSimulateClick = () => {
    setIsOpen(false);
    onOpenSimulator?.();
  };

  return (
    <div ref={menuRef} className={`header-overflow-menu-container ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        className="header-overflow-btn"
        data-testid="header-overflow-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreVertical size={20} className="desktop-only" />
        <User size={20} className="mobile-only" />
      </button>

      {isOpen && (
        <div className="header-overflow-dropdown" role="menu" aria-orientation="vertical">
          {userEmail && (
            <>
              <div className="header-overflow-user-info" data-testid="overflow-user-info">
                <User size={16} className="overflow-user-icon" />
                <span className="overflow-user-email" title={userEmail}>
                  {userEmail}
                </span>
              </div>
              <div className="header-overflow-divider" />
            </>
          )}
          {onSelectTab && (
            <>
              <button
                type="button"
                role="menuitem"
                className={`header-overflow-menu-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                data-testid="overflow-dashboard-button"
                onClick={() => {
                  setIsOpen(false);
                  onSelectTab('dashboard');
                }}
              >
                <LayoutDashboard size={16} />
                <span>{t('dashboard')}</span>
              </button>

              {canReadAudit && (
                <button
                  type="button"
                  role="menuitem"
                  className={`header-overflow-menu-item ${activeTab === 'audit' ? 'active' : ''}`}
                  data-testid="overflow-audit-button"
                  onClick={() => {
                    setIsOpen(false);
                    onSelectTab('audit');
                  }}
                >
                  <History size={16} />
                  <span>{t('audit')}</span>
                </button>
              )}

              {canManageUsers && (
                <button
                  type="button"
                  role="menuitem"
                  className={`header-overflow-menu-item ${activeTab === 'admin' ? 'active' : ''}`}
                  data-testid="overflow-admin-button"
                  onClick={() => {
                    setIsOpen(false);
                    onSelectTab('admin');
                  }}
                >
                  <Shield size={16} />
                  <span>{t('admin')}</span>
                </button>
              )}

              {canProvisionKiosk && (
                <button
                  type="button"
                  role="menuitem"
                  className={`header-overflow-menu-item ${activeTab === 'kiosk' ? 'active' : ''}`}
                  data-testid="overflow-kiosk-button"
                  onClick={() => {
                    setIsOpen(false);
                    onSelectTab('kiosk');
                  }}
                >
                  <Key size={16} />
                  <span>{t('kioskCertificates')}</span>
                </button>
              )}

              <div className="header-overflow-divider" />
            </>
          )}

          {canSimulate && (
            <button
              type="button"
              role="menuitem"
              className="header-overflow-menu-item"
              data-testid="overflow-simulate-button"
              onClick={handleSimulateClick}
            >
              <Eye size={16} />
              <span>{t('simulatePermissions')}</span>
            </button>
          )}

          <a
            href="https://www.tollhaus-stuttgart.de/impressum"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="header-overflow-menu-item header-overflow-impressum"
            data-testid="overflow-impressum-link"
            onClick={() => setIsOpen(false)}
          >
            <ExternalLink size={16} />
            <span>{t('impressum')}</span>
          </a>

          {onOpenFeedback && (
            <button
              type="button"
              role="menuitem"
              className="header-overflow-menu-item"
              data-testid="overflow-feedback-button"
              onClick={() => {
                setIsOpen(false);
                onOpenFeedback();
              }}
            >
              <MessageSquare size={16} />
              <span>{t('sendFeedback')}</span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            className="header-overflow-menu-item header-overflow-signout"
            data-testid="overflow-signout-button"
            onClick={handleLogoutClick}
          >
            <LogOut size={16} />
            <span>{t('logout')}</span>
          </button>
        </div>
      )}
    </div>
  );
};
