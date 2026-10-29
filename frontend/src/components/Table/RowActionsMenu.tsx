import React, { useState, useRef } from 'react';
import { MoreVertical, Trash } from 'lucide-react';
import { CellPopover } from './CellPopover';
import { useIsMobile } from '../../hooks/useIsMobile';
import { t } from '../../utils/i18n';

export interface RowActionsMenuProps {
  onDelete?: () => void;
  deleteLabel?: string;
  disabled?: boolean;
  disabledTooltip?: string;
  entityName?: string;
  ariaLabel?: string;
  className?: string;
  testId?: string;
  deleteTestId?: string;
}

export const RowActionsMenu: React.FC<RowActionsMenuProps> = ({
  onDelete,
  deleteLabel,
  disabled = false,
  disabledTooltip,
  entityName,
  ariaLabel,
  className = '',
  testId,
  deleteTestId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobile();

  return (
    <div
      className={`row-actions-menu-container ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        className="easy-edit-button row-actions-menu-trigger"
        data-testid={testId}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-label={ariaLabel || t('actions')}
        title={ariaLabel || t('actions')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        style={{
          padding: '0.25rem',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border)',
          color: '#64748b',
          background: 'transparent',
          height: '28px',
          width: '28px',
          boxSizing: 'border-box',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text-h)';
          e.currentTarget.style.borderColor = 'var(--border-strong, #94a3b8)';
          e.currentTarget.style.backgroundColor = 'var(--bg-hover, rgba(0, 0, 0, 0.04))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#64748b';
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <MoreVertical size={16} />
      </button>

      {isOpen && (
        <CellPopover
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          anchorEl={buttonRef}
          width={200}
          minWidth={170}
          className="glass-popup row-actions-popover"
        >
          <div className="row-actions-menu-list" role="menu">
            {isMobile && entityName && (
              <div className="row-actions-sheet-header">
                <span className="row-actions-sheet-name">{entityName}</span>
              </div>
            )}
            {onDelete && (
              <button
                type="button"
                role="menuitem"
                className="row-action-menu-item row-action-delete"
                data-testid={deleteTestId || 'row-action-delete'}
                disabled={disabled}
                title={disabled ? (disabledTooltip || t('permissionRequired')) : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  if (!disabled) {
                    onDelete();
                  }
                }}
              >
                <Trash size={16} style={{ flexShrink: 0 }} />
                <span>{deleteLabel || t('delete')}</span>
              </button>
            )}
          </div>
        </CellPopover>
      )}
    </div>
  );
};
