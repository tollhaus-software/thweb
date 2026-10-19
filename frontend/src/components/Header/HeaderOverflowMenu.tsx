import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, LogOut } from 'lucide-react';
import { t } from '../../utils/i18n';

export interface HeaderOverflowMenuProps {
  onLogout: () => void;
  className?: string;
}

export const HeaderOverflowMenu: React.FC<HeaderOverflowMenuProps> = ({
  onLogout,
  className = '',
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

  return (
    <div ref={menuRef} className={`header-overflow-menu-container ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        className="header-overflow-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreVertical size={20} />
      </button>

      {isOpen && (
        <div className="header-overflow-dropdown" role="menu" aria-orientation="vertical">
          <button
            type="button"
            role="menuitem"
            className="header-overflow-menu-item"
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
