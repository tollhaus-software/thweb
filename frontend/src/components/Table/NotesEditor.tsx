import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Pencil, Check, X, Bold, Italic, Underline, Link as LinkIcon, Eye } from 'lucide-react';
import { t } from '../../utils/i18n';
import { CellPopover } from './CellPopover';
import { FormattedText, stripFormatting } from '../../utils/formattedText';

export interface NotesEditorProps {
  value: string;
  onSave: (val: string) => void;
  placeholder?: string;
  title?: string;
  readOnly?: boolean;
}

export const NotesEditor: React.FC<NotesEditorProps> = ({
  value,
  onSave,
  placeholder = 'Add note...',
  title,
  readOnly = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
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
    if (readOnly) return;
    onSave(tempValueRef.current);
    setIsOpen(false);
    setActiveTab('edit');
  }, [onSave, readOnly]);

  const handleCancel = useCallback(() => {
    setTempValue(value);
    tempValueRef.current = value;
    setIsOpen(false);
    setActiveTab('edit');
  }, [value]);

  const openEditor = (initialTab: 'edit' | 'preview' = 'edit') => {
    if (readOnly) {
      if (!value) return; // Nothing to view if empty and read-only
      setActiveTab('preview');
    } else {
      setActiveTab(initialTab);
    }
    setIsOpen(true);
  };

  // Focus textarea when editing tab is active
  useEffect(() => {
    if (isOpen && activeTab === 'edit' && !readOnly && textareaRef.current) {
      textareaRef.current.focus();
      const length = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(length, length);
    }
  }, [isOpen, activeTab, readOnly]);

  const insertFormatting = (prefix: string, suffix: string, defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end) || defaultText;
    const replacement = `${prefix}${selectedText}${suffix}`;
    const newText = text.substring(0, start) + replacement + text.substring(end);
    setTempValue(newText);
    tempValueRef.current = newText;

    setTimeout(() => {
      textarea.focus();
      const newCursorStart = start + prefix.length;
      const newCursorEnd = newCursorStart + selectedText.length;
      textarea.setSelectionRange(newCursorStart, newCursorEnd);
    }, 0);
  };

  const handleInsertLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    if (selectedText.startsWith('http://') || selectedText.startsWith('https://')) {
      insertFormatting('[Link-Titel](', ')', selectedText);
    } else if (selectedText) {
      insertFormatting('[', '](https://example.com)', selectedText);
    } else {
      insertFormatting('[Link-Titel](https://example.com)', '', '');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      insertFormatting('**', '**');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      insertFormatting('*', '*');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      insertFormatting('<u>', '</u>');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      handleInsertLink();
    }
  };

  // Get the first line for preview (CSS handles text-overflow ellipsis within the cell width)
  // and check if there are additional non-empty lines to indicate continuation
  const getPreviewInfo = () => {
    if (!value) return { preview: '', hasMoreLines: false, moreCount: 0 };
    const stripped = stripFormatting(value);
    const lines = stripped.split('\n');
    const firstLineIndex = lines.findIndex((l) => l.trim().length > 0);
    const firstLine = firstLineIndex >= 0 ? lines[firstLineIndex] : '';
    const moreLines = firstLineIndex >= 0 ? lines.slice(firstLineIndex + 1).filter((l) => l.trim().length > 0) : [];
    return {
      preview: firstLine,
      hasMoreLines: moreLines.length > 0,
      moreCount: moreLines.length,
    };
  };

  const { preview, hasMoreLines, moreCount } = getPreviewInfo();
  const moreTooltip =
    moreCount === 1
      ? t('oneMoreLine') || '1 weitere Zeile'
      : `${moreCount} ${t('moreLines') || 'weitere Zeilen'}`;

  const toolbarBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    border: '1px solid var(--border)',
    borderRadius: '4px',
    background: 'var(--bg-surface)',
    color: 'var(--text)',
    cursor: 'pointer',
    transition: 'background-color 0.1s',
  };

  return (
    <div
      ref={triggerRef}
      style={{ position: 'relative', width: '100%', display: 'inline-block' }}
    >
      <div
        className="notes-cell-wrapper"
        onDoubleClick={(e) => {
          e.stopPropagation();
          window.getSelection()?.removeAllRanges();
          if (!isOpen) {
            openEditor('edit');
          }
        }}
        onClick={(e) => {
          if (readOnly && value) {
            e.stopPropagation();
            openEditor('preview');
          }
        }}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          gap: '0.25rem',
          minHeight: '28px',
          borderRadius: '4px',
          backgroundColor: isOpen ? 'var(--accent-bg)' : 'transparent',
          cursor: readOnly ? (value ? 'pointer' : 'default') : 'text',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            overflow: 'hidden',
            flex: 1,
            minWidth: 0,
          }}
          title={value ? stripFormatting(value) : undefined}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: value ? 'var(--text-h)' : 'var(--text-muted, #94a3b8)',
              fontStyle: value ? 'normal' : 'italic',
              fontSize: '0.875rem',
              flex: 1,
            }}
          >
            {preview || (readOnly ? '-' : placeholder)}
          </span>
          {hasMoreLines && (
            <span
              className="notes-more-indicator"
              style={{
                flexShrink: 0,
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                backgroundColor: 'var(--bg-subtle, rgba(0, 0, 0, 0.05))',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                padding: '0 4px',
                lineHeight: '1.25',
                letterSpacing: '1px',
                userSelect: 'none',
              }}
              title={moreTooltip}
              aria-label={moreTooltip}
            >
              ...
            </span>
          )}
        </div>
        {!readOnly && (
          <div className="cell-edit-pencil-btn-wrapper" style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isOpen) {
                  handleSave();
                } else {
                  openEditor('edit');
                }
              }}
              className="cell-edit-pencil-btn easy-edit-button"
              title={title || t('editNotes')}
              aria-label={title || t('editNotes')}
            >
              <Pencil size={13} />
            </button>
          </div>
        )}
      </div>

      <CellPopover
        isOpen={isOpen}
        className="glass-popup cell-popover"
        onClose={() => {
          if (readOnly) {
            setIsOpen(false);
          } else if (tempValueRef.current !== value) {
            handleSave();
          } else {
            setIsOpen(false);
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
            alignItems: 'center',
          }}
        >
          <span>{title || (readOnly ? (t('viewNotes') || 'View Notes') : (t('editNotes') || 'Edit Notes'))}</span>
          {!readOnly && activeTab === 'edit' && (
            <span style={{ fontWeight: 'normal', opacity: 0.7 }}>(Ctrl+Enter to save)</span>
          )}
        </div>

        {/* Toolbar & View/Edit Toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '4px',
          }}
        >
          {!readOnly && activeTab === 'edit' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                title={`${t('bold') || 'Bold'} (Ctrl+B)`}
                onClick={() => insertFormatting('**', '**')}
                style={toolbarBtnStyle}
                aria-label="Bold"
              >
                <Bold size={13} />
              </button>
              <button
                type="button"
                title={`${t('italic') || 'Italic'} (Ctrl+I)`}
                onClick={() => insertFormatting('*', '*')}
                style={toolbarBtnStyle}
                aria-label="Italic"
              >
                <Italic size={13} />
              </button>
              <button
                type="button"
                title={`${t('underline') || 'Underline'} (Ctrl+U)`}
                onClick={() => insertFormatting('<u>', '</u>')}
                style={toolbarBtnStyle}
                aria-label="Underline"
              >
                <Underline size={13} />
              </button>
              <button
                type="button"
                title={`${t('link') || 'Link'} (Ctrl+K)`}
                onClick={handleInsertLink}
                style={toolbarBtnStyle}
                aria-label="Link"
              >
                <LinkIcon size={13} />
              </button>
            </div>
          ) : (
            <div />
          )}

          {!readOnly && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                background: 'var(--bg-subtle, #f1f5f9)',
                padding: '2px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 6px',
                  fontSize: '0.75rem',
                  fontWeight: activeTab === 'edit' ? 600 : 'normal',
                  background: activeTab === 'edit' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'edit' ? 'var(--text-h)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'edit' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <Pencil size={11} />
                <span>{t('edit') || 'Edit'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 6px',
                  fontSize: '0.75rem',
                  fontWeight: activeTab === 'preview' ? 600 : 'normal',
                  background: activeTab === 'preview' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'preview' ? 'var(--text-h)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'preview' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <Eye size={11} />
                <span>{t('preview') || 'Preview'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Editor or Preview */}
        {!readOnly && activeTab === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={tempValue}
            onChange={(e) => {
              setTempValue(e.target.value);
              tempValueRef.current = e.target.value;
            }}
            onKeyDown={handleKeyDown}
            rows={6}
            placeholder={placeholder}
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
        ) : (
          <div
            className="notes-preview-container"
            style={{
              width: '100%',
              minHeight: '130px',
              maxHeight: '260px',
              overflowY: 'auto',
              padding: '8px 10px',
              borderRadius: '4px',
              border: '1px solid var(--input-border, var(--border))',
              background: 'var(--input-bg, var(--bg-surface))',
              color: 'var(--input-text, var(--text))',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              boxSizing: 'border-box',
            }}
          >
            {(readOnly ? value : tempValue).trim() ? (
              <FormattedText text={readOnly ? value : tempValue} />
            ) : (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {placeholder}
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
          {readOnly ? (
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '4px 10px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid var(--border)',
                borderRadius: '4px',
                background: 'var(--bg-surface)',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              <X size={12} />
              {t('close') || 'Close'}
            </button>
          ) : (
            <>
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
                  color: 'var(--primary-contrast, white)',
                  cursor: 'pointer',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary)')}
              >
                <Check size={12} />
                {t('save') || 'Save'}
              </button>
            </>
          )}
        </div>
      </CellPopover>
    </div>
  );
};
