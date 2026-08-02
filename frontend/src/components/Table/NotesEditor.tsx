import React, { useState, useEffect, useRef } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { t } from '../../utils/i18n';

interface NotesEditorProps {
  value: string;
  onSave: (val: string) => void;
  placeholder?: string;
}

export const NotesEditor: React.FC<NotesEditorProps> = ({
  value,
  onSave,
  placeholder = 'Add note...',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Keep tempValue in sync with prop updates
  useEffect(() => {
    setTempValue(value);
  }, [value]);

  // Handle click outside to save/close
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        handleSave();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, tempValue]);

  const handleSave = () => {
    onSave(tempValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  // Get the first part of the first line for preview
  const getPreviewText = () => {
    if (!value) return '';
    const firstLine = value.split('\n')[0];
    const maxLen = 25;
    if (firstLine.length > maxLen || value.includes('\n')) {
      return firstLine.slice(0, maxLen) + '...';
    }
    return firstLine;
  };

  const preview = getPreviewText();

  return (
    <div
      style={{ position: 'relative', width: '100%', display: 'inline-block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isEditing ? (
        <div
          onDoubleClick={() => setIsEditing(true)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            gap: '0.25rem',
            cursor: 'pointer',
            minHeight: '28px',
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: value ? 'var(--text-h)' : '#94a3b8',
              fontStyle: value ? 'normal' : 'italic',
              fontSize: '0.875rem',
              flex: 1,
            }}
          >
            {preview || placeholder}
          </span>
          <div
            style={{
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.15s ease-in-out',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--primary)',
                cursor: 'pointer',
                padding: '2px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--accent-bg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Pencil size={12} />
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={popupRef}
          className="glass-popup"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '0',
            marginBottom: '6px',
            zIndex: 1000,
            width: '360px',
            minWidth: '320px',
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxSizing: 'border-box',
            animation: 'fadeIn 0.15s ease-out',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('editNotes') || 'Edit Notes'}</span>
            <span style={{ fontWeight: 'normal', opacity: 0.7 }}>(Ctrl+Enter to save)</span>
          </div>
          <textarea
            ref={textareaRef}
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={6}
            autoFocus
            placeholder="Write some notes here..."
            style={{
              width: '100%',
              minHeight: '130px',
              padding: '8px 10px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: 'white',
              color: 'var(--text-h)',
              fontSize: '0.875rem',
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '4px 8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid var(--border)',
                borderRadius: '4px',
                background: 'white',
                color: '#475569',
                cursor: 'pointer',
                transition: 'all 0.1s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
            >
              <X size={12} />
              {t('cancel') || 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '4px 10px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                background: 'var(--primary)',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.1s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--primary)'}
            >
              <Check size={12} />
              {t('save') || 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
