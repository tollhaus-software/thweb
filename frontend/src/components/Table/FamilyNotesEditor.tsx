import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Bold, Italic, Underline, Link as LinkIcon, Eye, ArrowUpRight, MessageSquare, Pencil } from 'lucide-react';
import { CellPopover } from './CellPopover';
import { t } from '../../utils/i18n';
import { FormattedText } from '../../utils/formattedText';
import { getFamilyName } from '../../utils/family';

export interface NotesTarget {
  type: 'family' | 'parent' | 'child';
  id?: string;
}

export interface FamilyNotesCellProps {
  value?: string;
  onOpen: (anchorEl: HTMLElement) => void;
  placeholder?: string;
  readOnly?: boolean;
  title?: string;
}

export const FamilyNotesCell: React.FC<FamilyNotesCellProps> = ({
  value = '',
  onOpen,
  placeholder,
  readOnly = false,
  title,
}) => {
  const triggerRef = useRef<HTMLDivElement>(null);

  const getPreviewInfo = () => {
    if (!value) return { preview: '', hasMoreLines: false, moreCount: 0 };
    const stripped = value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_~`]/g, '');
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

  const defaultPlaceholder = placeholder || t('addNote') || 'Notiz hinzufügen...';

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
          if (triggerRef.current) {
            onOpen(triggerRef.current);
          }
        }}
        onClick={(e) => {
          if (readOnly && value && triggerRef.current) {
            e.stopPropagation();
            onOpen(triggerRef.current);
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
          title={value || undefined}
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
            {preview || (readOnly ? '-' : defaultPlaceholder)}
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
                if (triggerRef.current) {
                  onOpen(triggerRef.current);
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
    </div>
  );
};

export interface FamilyNotesEditorProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  family: any | null;
  target?: NotesTarget | null;
  onSaveFamilyNotes: (familyId: string, notes: string) => Promise<void> | void;
  onSaveParentNotes: (parent: any, notes: string) => Promise<void> | void;
  onSaveChildNotes: (child: any, notes: string) => Promise<void> | void;
  onJumpToParent?: (parentId: string, familyId: string, familyName: string) => void;
  onJumpToChild?: (childId: string, familyId: string, familyName: string) => void;
  canWriteFamilies?: boolean;
  canWriteParents?: boolean;
  canWriteChildren?: boolean;
}

interface SectionNoteEditorProps {
  sectionId: string;
  title: string;
  badgeText?: string;
  initialValue: string;
  readOnly?: boolean;
  onSave: (val: string) => Promise<void> | void;
  jumpButton?: React.ReactNode;
  isTargeted?: boolean;
}

const SectionNoteEditor: React.FC<SectionNoteEditorProps> = ({
  sectionId,
  title,
  badgeText,
  initialValue,
  readOnly = false,
  onSave,
  jumpButton,
  isTargeted = false,
}) => {
  const [value, setValue] = useState(initialValue || '');
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue(initialValue || '');
  }, [initialValue]);

  useEffect(() => {
    if (isTargeted && !readOnly) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 50);
    }
  }, [isTargeted, readOnly]);

  const insertFormatting = (prefix: string, suffix: string, defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end) || defaultText;
    const replacement = `${prefix}${selectedText}${suffix}`;
    const newText = text.substring(0, start) + replacement + text.substring(end);
    setValue(newText);

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

  const handleSave = async () => {
    if (readOnly) return;
    setIsSaving(true);
    try {
      await onSave(value);
      setHasSaved(true);
      setTimeout(() => setHasSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const isDirty = value !== (initialValue || '');

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
      id={sectionId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        padding: '0.65rem 0.75rem',
        borderRadius: '6px',
        backgroundColor: isTargeted ? 'var(--accent-bg, rgba(59, 130, 246, 0.08))' : 'var(--bg-subtle, rgba(0, 0, 0, 0.02))',
        border: isTargeted ? '1.5px solid var(--accent, #3b82f6)' : '1px solid var(--border)',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-h)' }}>
            {title}
          </span>
          {badgeText && (
            <span
              style={{
                fontSize: '0.72rem',
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-hover)',
                color: 'var(--text-muted)',
                fontWeight: 500,
              }}
            >
              {badgeText}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {jumpButton}
        </div>
      </div>

      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '2px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              style={{
                ...toolbarBtnStyle,
                width: 'auto',
                padding: '0 6px',
                fontSize: '0.75rem',
                fontWeight: 500,
                backgroundColor: activeTab === 'edit' ? 'var(--accent-bg, rgba(59, 130, 246, 0.15))' : 'var(--bg-surface)',
                borderColor: activeTab === 'edit' ? 'var(--accent)' : 'var(--border)',
                color: activeTab === 'edit' ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              Editor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              style={{
                ...toolbarBtnStyle,
                width: 'auto',
                padding: '0 6px',
                fontSize: '0.75rem',
                fontWeight: 500,
                backgroundColor: activeTab === 'preview' ? 'var(--accent-bg, rgba(59, 130, 246, 0.15))' : 'var(--bg-surface)',
                borderColor: activeTab === 'preview' ? 'var(--accent)' : 'var(--border)',
                color: activeTab === 'preview' ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              <Eye size={12} style={{ marginRight: '3px' }} />
              {t('preview')}
            </button>
          </div>

          {activeTab === 'edit' && (
            <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => insertFormatting('**', '**')}
                style={toolbarBtnStyle}
                title={t('bold') + ' (Ctrl+B)'}
              >
                <Bold size={12} />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('*', '*')}
                style={toolbarBtnStyle}
                title={t('italic') + ' (Ctrl+I)'}
              >
                <Italic size={12} />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('<u>', '</u>')}
                style={toolbarBtnStyle}
                title={t('underline') + ' (Ctrl+U)'}
              >
                <Underline size={12} />
              </button>
              <button
                type="button"
                onClick={handleInsertLink}
                style={toolbarBtnStyle}
                title={t('link') + ' (Ctrl+K)'}
              >
                <LinkIcon size={12} />
              </button>
            </div>
          )}
        </div>
      )}

      {readOnly || activeTab === 'preview' ? (
        <div
          style={{
            minHeight: '60px',
            maxHeight: '160px',
            overflowY: 'auto',
            padding: '0.4rem 0.5rem',
            borderRadius: '4px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            fontSize: '0.85rem',
            lineHeight: 1.45,
            color: value && value.trim() ? 'var(--text)' : 'var(--text-muted)',
            fontStyle: value && value.trim() ? 'normal' : 'italic',
          }}
        >
          {value && value.trim() ? <FormattedText text={value} /> : (t('noNotesYet') || '(keine Notizen)')}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('addNote')}
          rows={3}
          style={{
            width: '100%',
            padding: '0.4rem 0.5rem',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text)',
            fontSize: '0.85rem',
            lineHeight: 1.45,
            resize: 'vertical',
            minHeight: '60px',
            maxHeight: '200px',
            boxSizing: 'border-box',
          }}
        />
      )}

      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.1rem' }}>
          {hasSaved && (
            <span style={{ fontSize: '0.75rem', color: 'var(--success, #16a34a)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              <Check size={12} /> {t('saved') || 'Gespeichert'}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.25rem 0.6rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: '4px',
              border: 'none',
              backgroundColor: isDirty ? 'var(--primary, #3b82f6)' : 'var(--bg-surface)',
              color: isDirty ? '#fff' : 'var(--text-muted)',
              cursor: isDirty && !isSaving ? 'pointer' : 'default',
              opacity: isDirty ? 1 : 0.6,
              transition: 'all 0.15s ease',
            }}
          >
            <Check size={12} />
            <span>{isSaving ? '...' : t('save') || 'Speichern'}</span>
          </button>
        </div>
      )}
    </div>
  );
};

interface RenderedOtherNoteProps {
  id: string;
  title: string;
  badgeText?: string;
  notes: string;
  canEdit?: boolean;
  onEditClick?: () => void;
  jumpButton?: React.ReactNode;
}

const RenderedOtherNote: React.FC<RenderedOtherNoteProps> = ({
  id,
  title,
  badgeText,
  notes,
  canEdit = true,
  onEditClick,
  jumpButton,
}) => {
  return (
    <div
      id={id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        padding: '0.55rem 0.65rem',
        borderRadius: '6px',
        backgroundColor: 'var(--bg-subtle, rgba(0, 0, 0, 0.02))',
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.825rem', color: 'var(--text-h)' }}>
            {title}
          </span>
          {badgeText && (
            <span
              style={{
                fontSize: '0.7rem',
                padding: '0.05rem 0.35rem',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-hover)',
                color: 'var(--text-muted)',
                fontWeight: 500,
              }}
            >
              {badgeText}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {jumpButton}
          {canEdit && onEditClick && (
            <button
              type="button"
              onClick={onEditClick}
              title={t('editNotes') || 'Notizen bearbeiten'}
              aria-label={t('editNotes') || 'Notizen bearbeiten'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 6px',
                fontSize: '0.72rem',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <Pencil size={11} />
              <span>{t('edit') || 'Bearbeiten'}</span>
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          fontSize: '0.8rem',
          lineHeight: 1.45,
          color: notes && notes.trim() ? 'var(--text)' : 'var(--text-muted)',
          fontStyle: notes && notes.trim() ? 'normal' : 'italic',
          padding: '0.2rem 0.1rem',
          maxHeight: '120px',
          overflowY: 'auto',
          wordBreak: 'break-word',
        }}
      >
        {notes && notes.trim() ? <FormattedText text={notes} /> : (t('noNotesYet') || '(keine Notizen)')}
      </div>
    </div>
  );
};

export const FamilyNotesEditor: React.FC<FamilyNotesEditorProps> = ({
  isOpen,
  onClose,
  anchorEl,
  family,
  target,
  onSaveFamilyNotes,
  onSaveParentNotes,
  onSaveChildNotes,
  onJumpToParent,
  onJumpToChild,
  canWriteFamilies = true,
  canWriteParents = true,
  canWriteChildren = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingTarget, setEditingTarget] = useState<NotesTarget>(target || { type: 'family' });

  useEffect(() => {
    if (isOpen) {
      setEditingTarget(target || { type: 'family' });
    }
  }, [isOpen, target]);

  // Scroll to targeted section when opened
  useEffect(() => {
    if (isOpen && target) {
      const targetId =
        target.type === 'family'
          ? 'family-notes-section-family'
          : target.type === 'parent'
          ? `family-notes-section-parent-${target.id}`
          : target.type === 'child'
          ? `family-notes-section-child-${target.id}`
          : null;

      if (targetId) {
        setTimeout(() => {
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 100);
      }
    }
  }, [isOpen, target]);

  if (!family) return null;

  const familyName = getFamilyName(family);
  const parents = family.parents || [];
  const children = family.children || [];

  interface NoteEntry {
    id: string;
    type: 'family' | 'parent' | 'child';
    entityId?: string;
    title: string;
    badgeText: string;
    notes: string;
    canEdit: boolean;
    onSave: (val: string) => Promise<void> | void;
    jumpButton?: React.ReactNode;
  }

  // Stable sequence: 1) Family notes, 2) Parent notes, 3) Child notes
  const entries: NoteEntry[] = [];

  // 1. Family-wide notes
  entries.push({
    id: 'family-notes-section-family',
    type: 'family',
    title: `${t('familyNotes')} (${familyName})`,
    badgeText: t('family') || 'Familie',
    notes: family.notes || '',
    canEdit: canWriteFamilies,
    onSave: (val) => onSaveFamilyNotes(family.id, val),
  });

  // 2. Parents' notes
  for (const p of parents) {
    const pName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Parent';
    entries.push({
      id: `family-notes-section-parent-${p.id}`,
      type: 'parent',
      entityId: p.id,
      title: pName,
      badgeText: t('parent') || 'Elternteil',
      notes: p.notes || '',
      canEdit: canWriteParents,
      onSave: (val) => onSaveParentNotes(p, val),
      jumpButton: onJumpToParent ? (
        <button
          type="button"
          className="family-parent-link"
          onClick={() => {
            onClose();
            onJumpToParent(p.id, family.id, familyName);
          }}
          title={t('jumpToParent')}
          style={{ fontSize: '0.75rem', padding: '1px 4px' }}
        >
          <span>{t('jumpToParent') || 'Zu Eltern'}</span>
          <ArrowUpRight size={12} className="family-link-icon" />
        </button>
      ) : undefined,
    });
  }

  // 3. Children's notes
  for (const c of children) {
    const cName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Kind';
    entries.push({
      id: `family-notes-section-child-${c.id}`,
      type: 'child',
      entityId: c.id,
      title: cName,
      badgeText: t('child') || 'Kind',
      notes: c.notes || '',
      canEdit: canWriteChildren,
      onSave: (val) => onSaveChildNotes(c, val),
      jumpButton: onJumpToChild ? (
        <button
          type="button"
          className="family-parent-link"
          onClick={() => {
            onClose();
            onJumpToChild(c.id, family.id, familyName);
          }}
          title={t('jumpToChild')}
          style={{ fontSize: '0.75rem', padding: '1px 4px' }}
        >
          <span>{t('jumpToChild') || 'Zu Kind'}</span>
          <ArrowUpRight size={12} className="family-link-icon" />
        </button>
      ) : undefined,
    });
  }

  const isEntryEditing = (entry: NoteEntry) => {
    if (editingTarget.type !== entry.type) return false;
    if (entry.type === 'family') return true;
    return entry.entityId === editingTarget.id || (!editingTarget.id && entry === entries.find(e => e.type === editingTarget.type));
  };

  return (
    <CellPopover
      isOpen={isOpen}
      onClose={onClose}
      anchorEl={anchorEl}
      width={520}
      minWidth={340}
    >
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '75vh',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.6rem 0.75rem',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <MessageSquare size={16} style={{ color: 'var(--accent, #3b82f6)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-h)' }}>
              {t('familyNotes')}: {familyName}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="secondary-button"
            style={{
              padding: '2px 4px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
            title={t('close') || 'Schließen'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Stable list of cards */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            padding: '0.75rem',
            overflowY: 'auto',
          }}
        >
          {entries.map((entry) => {
            const isEditing = isEntryEditing(entry);
            if (isEditing) {
              return (
                <SectionNoteEditor
                  key={entry.id}
                  sectionId={entry.id}
                  title={entry.title}
                  badgeText={entry.badgeText}
                  initialValue={entry.notes}
                  readOnly={!entry.canEdit}
                  isTargeted={true}
                  onSave={entry.onSave}
                  jumpButton={entry.jumpButton}
                />
              );
            }
            return (
              <RenderedOtherNote
                key={entry.id}
                id={entry.id}
                title={entry.title}
                badgeText={entry.badgeText}
                notes={entry.notes}
                canEdit={entry.canEdit}
                onEditClick={() => setEditingTarget({ type: entry.type, id: entry.entityId })}
                jumpButton={entry.jumpButton}
              />
            );
          })}
        </div>
      </div>
    </CellPopover>
  );
};
