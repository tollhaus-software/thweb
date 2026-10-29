import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, LogOut, Eye, ExternalLink } from 'lucide-react';
import { t } from '../../utils/i18n';

export interface HeaderOverflowMenuProps {
  onLogout: () => void;
  className?: string;
  canSimulate?: boolean;
  onOpenSimulator?: () => void;
}

export const HeaderOverflowMenu: React.FC<HeaderOverflowMenuProps> = ({
  onLogout,
  className = '',
  canSimulate = false,
  onOpenSimulator,
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
        <MoreVertical size={20} />
      </button>

      {isOpen && (
        <div className="header-overflow-dropdown" role="menu" aria-orientation="vertical">
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
