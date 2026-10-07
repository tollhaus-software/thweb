import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { t } from '../../utils/i18n';
import { CellPopover } from './CellPopover';

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
  const triggerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tempValueRef = useRef(tempValue);

  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setTempValue(value);
  }

  useEffect(() => {
    tempValueRef.current = tempValue;
  }, [tempValue]);

  const handleSave = useCallback(() => {
    onSave(tempValueRef.current);
    setIsEditing(false);
  }, [onSave]);

  const handleCancel = useCallback(() => {
    setTempValue(value);
    tempValueRef.current = value;
    setIsEditing(false);
  }, [value]);

  const startEditing = () => {
    setIsEditing(true);
  };

  // Focus textarea when editing begins
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const length = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(length, length);
    }
  }, [isEditing]);

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
      ref={triggerRef}
      style={{ position: 'relative', width: '100%', display: 'inline-block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        onClick={() => {
          if (!isEditing) {
            startEditing();
          }
        }}
        onDoubleClick={() => {
          if (!isEditing) {
            startEditing();
          }
        }}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          gap: '0.25rem',
          cursor: 'pointer',
          minHeight: '28px',
          borderRadius: '4px',
          backgroundColor: isEditing ? 'var(--accent-bg)' : 'transparent',
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
            opacity: hovered || isEditing ? 1 : 0,
            transition: 'opacity 0.15s ease-in-out',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isEditing) {
                handleSave();
              } else {
                startEditing();
              }
            }}
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

      <CellPopover
        isOpen={isEditing}
        onClose={() => {
          if (tempValueRef.current !== value) {
            handleSave();
          } else {
            setIsEditing(false);
          }
        }}
        anchorEl={triggerRef}
        width={360}
        style={{
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{t('editNotes') || 'Edit Notes'}</span>
          <span style={{ fontWeight: 'normal', opacity: 0.7 }}>(Ctrl+Enter to save)</span>
        </div>
        <textarea
          ref={textareaRef}
          value={tempValue}
          onChange={(e) => {
            setTempValue(e.target.value);
            tempValueRef.current = e.target.value;
          }}
          onKeyDown={handleKeyDown}
          rows={6}
          placeholder="Write some notes here..."
          style={{
            width: '100%',
            minHeight: '130px',
            padding: '8px 10px',
            borderRadius: '4px',
            border: '1px solid var(--input-border)',
            background: 'var(--input-bg)',
            color: 'var(--input-text)',
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
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
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
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary)')}
          >
            <Check size={12} />
            {t('save') || 'Save'}
          </button>
        </div>
      </CellPopover>
    </div>
  );
};
