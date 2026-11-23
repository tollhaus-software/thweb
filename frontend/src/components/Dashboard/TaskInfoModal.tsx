import React, { useEffect } from 'react';
import { Info } from 'lucide-react';
import { t } from '../../utils/i18n';
import './TaskInfoModal.css';

export interface TaskInfoModalProps {
  isOpen: boolean;
  taskTitle: string;
  infoText: string;
  onClose: () => void;
  embedded?: boolean;
}

export const TaskInfoModal: React.FC<TaskInfoModalProps> = ({
  isOpen,
  taskTitle,
  infoText,
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

  return (
    <div
      className="task-info-modal-overlay"
      data-testid="task-info-modal-overlay"
      onClick={onClose}
    >
      <div
        className={`task-info-modal-container ${embedded ? 'embedded' : ''}`}
        data-testid="task-info-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-info-modal-title"
      >
        <div className="task-info-modal-header">
          <div className="task-info-modal-icon-wrap">
            <Info size={embedded ? 20 : 26} className="task-info-modal-info-icon" />
          </div>
          <h2
            id="task-info-modal-title"
            className="task-info-modal-title"
            data-testid="task-info-modal-title"
          >
            {taskTitle}
          </h2>
        </div>

        <div className="task-info-modal-body" data-testid="task-info-modal-body">
          <p className="task-info-modal-text">{infoText}</p>
        </div>

        <div className="task-info-modal-actions">
          <button
            type="button"
            className="task-info-modal-btn"
            data-testid="task-info-close-btn"
            onClick={onClose}
            autoFocus
          >
            <span>{t('close')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
