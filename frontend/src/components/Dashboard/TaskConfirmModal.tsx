import React, { useEffect } from 'react';
import { Check } from 'lucide-react';
import { t } from '../../utils/i18n';
import './TaskConfirmModal.css';

export interface TaskConfirmModalProps {
  isOpen: boolean;
  taskLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  embedded?: boolean;
}

export const TaskConfirmModal: React.FC<TaskConfirmModalProps> = ({
  isOpen,
  taskLabel,
  onConfirm,
  onClose,
  embedded = false,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const titleText = t('confirmCheckTask').replace('{task}', taskLabel);

  return (
    <div
      className="task-confirm-modal-overlay"
      data-testid="task-confirm-modal-overlay"
      onClick={onClose}
    >
      <div
        className={`task-confirm-modal-container ${embedded ? 'embedded' : ''}`}
        data-testid="task-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-confirm-modal-title"
      >
        <div className="task-confirm-modal-header">
          <div className="task-confirm-modal-icon-wrap">
            <Check size={embedded ? 20 : 26} className="task-confirm-modal-check-icon" />
          </div>
          <h2
            id="task-confirm-modal-title"
            className="task-confirm-modal-title"
            data-testid="task-confirm-modal-title"
          >
            {titleText}
          </h2>
        </div>

        <div className="task-confirm-modal-actions">
          <button
            type="button"
            className="task-confirm-modal-btn task-confirm-modal-btn-cancel"
            data-testid="task-confirm-cancel-btn"
            onClick={onClose}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className="task-confirm-modal-btn task-confirm-modal-btn-confirm"
            data-testid="task-confirm-confirm-btn"
            onClick={onConfirm}
            autoFocus
          >
            <Check size={embedded ? 16 : 20} />
            <span>{t('checkOff')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
