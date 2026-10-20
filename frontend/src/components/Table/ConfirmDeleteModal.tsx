import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Trash } from 'lucide-react';
import { t } from '../../utils/i18n';

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  expectedName?: string;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  expectedName = '',
}) => {
  const [typedName, setTypedName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanExpected = expectedName.trim();
  const requiresFallback = cleanExpected.length === 0;
  const targetName = requiresFallback ? t('deleteFallbackKeyword') : cleanExpected;

  useEffect(() => {
    if (isOpen) {
      setTypedName('');
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

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

  const isMatch = typedName.trim().toLowerCase() === targetName.toLowerCase();

  const handleConfirm = () => {
    if (!isMatch) return;
    onConfirm();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container confirm-delete-modal-container"
        style={{ maxWidth: '440px', width: '90%', textAlign: 'left' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <h2 style={{ color: '#ef4444', margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>
            {title || t('delete')}
          </h2>
        </div>

        <p style={{ color: 'var(--text-muted, #475569)', fontSize: '0.92rem', marginBottom: '1.25rem', lineHeight: '1.5' }}>
          {message}
        </p>

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            htmlFor="confirm-delete-name-input"
            style={{
              display: 'block',
              fontSize: '0.85rem',
              fontWeight: 500,
              color: 'var(--text, #334155)',
              marginBottom: '0.45rem',
            }}
          >
            {requiresFallback
              ? t('deleteConfirmPromptFallback').replace('%s', targetName)
              : t('deleteConfirmPrompt')}
            {!requiresFallback && (
              <span
                style={{
                  fontWeight: 700,
                  color: '#dc2626',
                  marginLeft: '5px',
                  userSelect: 'all',
                }}
              >
                {targetName}
              </span>
            )}
          </label>
          <input
            id="confirm-delete-name-input"
            ref={inputRef}
            type="text"
            className="confirm-delete-input"
            value={typedName}
            placeholder={targetName}
            onChange={(e) => setTypedName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isMatch) {
                e.preventDefault();
                handleConfirm();
              }
            }}
            autoComplete="off"
            spellCheck={false}
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem',
              fontSize: '0.95rem',
              borderRadius: '6px',
              border: isMatch ? '1px solid #ef4444' : '1px solid var(--border)',
              background: 'var(--input-bg, #ffffff)',
              color: 'var(--text, #0f172a)',
              outline: 'none',
              boxSizing: 'border-box',
              boxShadow: isMatch ? '0 0 0 2px rgba(239, 68, 68, 0.2)' : undefined,
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          />
        </div>

        <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="cancel-btn"
            onClick={onClose}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className="submit-btn"
            disabled={!isMatch}
            style={{
              backgroundColor: isMatch ? '#ef4444' : '#cbd5e1',
              cursor: isMatch ? 'pointer' : 'not-allowed',
              opacity: isMatch ? 1 : 0.65,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background-color 0.15s ease, opacity 0.15s ease',
            }}
            onClick={handleConfirm}
          >
            <Trash size={15} />
            <span>{t('delete')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
