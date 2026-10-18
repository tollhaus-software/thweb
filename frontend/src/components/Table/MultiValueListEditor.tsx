import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Pencil, Trash, Plus, Check, X } from 'lucide-react';
import { t } from '../../utils/i18n';
import { CellPopover } from './CellPopover';

export interface MultiValueFlagConfig {
  key: string;              // e.g. 'address_list'
  icon: React.ReactNode;    // e.g. '📋'
  label?: string;           // e.g. 'In Adressliste verwenden'
  titleActive?: string;
  titleInactive?: string;
  defaultValue?: boolean;   // default for newly added items (defaults to true)
}

export interface MultiValueEntry {
  value: string;
  address_list?: boolean;
  identifier_email?: boolean;
  [key: string]: any;
}

export type MultiValueItem = string | MultiValueEntry;

export interface MultiValueListEditorProps<T extends MultiValueItem = MultiValueItem> {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  values: T[];
  onSave: (newValues: T[]) => void;
  flags?: MultiValueFlagConfig[];
  placeholder?: string;
  title?: string;
  canEditItem?: (item: T, idx: number) => boolean;
  canDeleteItem?: (item: T, idx: number) => boolean;
  canToggleFlag?: (item: T | null, flagKey: string, idx: number) => boolean;
  disabledReason?: (item: T | null, action: 'edit' | 'delete' | 'toggle', flagKey?: string) => string | undefined;
}

export const getEntryValue = (entry: MultiValueItem): string => {
  if (typeof entry === 'string') return entry;
  return entry?.value || '';
};

export const isFlagActive = (entry: MultiValueItem, flagKey: string, defaultValue = true): boolean => {
  if (typeof entry === 'string') return defaultValue;
  if (entry[flagKey] !== undefined) return Boolean(entry[flagKey]);
  if (entry.flags && entry.flags[flagKey] !== undefined) return Boolean(entry.flags[flagKey]);
  return defaultValue;
};

export const MultiValueListPopover: React.FC<MultiValueListEditorProps> = ({
  isOpen,
  onClose,
  anchorEl,
  values = [],
  onSave,
  flags,
  placeholder = '',
  title,
  canEditItem,
  canDeleteItem,
  canToggleFlag,
  disabledReason,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addValue, setAddValue] = useState('');
  const [addFlags, setAddFlags] = useState<Record<string, boolean>>({});

  const editInputRef = useRef<HTMLInputElement>(null);
  const editWrapperRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const addWrapperRef = useRef<HTMLDivElement>(null);

  const editValueRef = useRef(editValue);
  const addValueRef = useRef(addValue);
  const addFlagsRef = useRef(addFlags);
  const isAddingRef = useRef(isAdding);
  const editingIndexRef = useRef(editingIndex);
  const valuesRef = useRef(values);
  const onSaveRef = useRef(onSave);
  const flagsRef = useRef(flags);
  const canEditItemRef = useRef(canEditItem);
  const canDeleteItemRef = useRef(canDeleteItem);
  const canToggleFlagRef = useRef(canToggleFlag);

  useEffect(() => {
    editValueRef.current = editValue;
  }, [editValue]);

  useEffect(() => {
    addValueRef.current = addValue;
  }, [addValue]);

  useEffect(() => {
    addFlagsRef.current = addFlags;
  }, [addFlags]);

  useEffect(() => {
    isAddingRef.current = isAdding;
  }, [isAdding]);

  useEffect(() => {
    editingIndexRef.current = editingIndex;
  }, [editingIndex]);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    flagsRef.current = flags;
  }, [flags]);

  useEffect(() => {
    canEditItemRef.current = canEditItem;
  }, [canEditItem]);

  useEffect(() => {
    canDeleteItemRef.current = canDeleteItem;
  }, [canDeleteItem]);

  useEffect(() => {
    canToggleFlagRef.current = canToggleFlag;
  }, [canToggleFlag]);

  // When popover opens: if no values yet, behave as if '+' was already pressed
  useEffect(() => {
    if (isOpen) {
      if (!values || values.length === 0) {
        setIsAdding(true);
        isAddingRef.current = true;
        setAddValue('');
        addValueRef.current = '';
        const initialFlags: Record<string, boolean> = {};
        for (const f of flagsRef.current || []) {
          initialFlags[f.key] = f.defaultValue ?? true;
        }
        setAddFlags(initialFlags);
      } else {
        setIsAdding(false);
        isAddingRef.current = false;
      }
      setEditingIndex(null);
      editingIndexRef.current = null;
      setEditValue('');
      editValueRef.current = '';
    }
  }, [isOpen]);

  // Auto-focus inputs
  useEffect(() => {
    if (isOpen && isAdding) {
      const timer = setTimeout(() => {
        if (addInputRef.current) {
          addInputRef.current.focus();
          addInputRef.current.select();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isAdding]);

  useEffect(() => {
    if (isOpen && editingIndex !== null) {
      const timer = setTimeout(() => {
        if (editInputRef.current) {
          editInputRef.current.focus();
          editInputRef.current.select();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, editingIndex]);

  const handleDelete = useCallback((idx: number) => {
    const currentValues = valuesRef.current || [];
    if (idx < 0 || idx >= currentValues.length) return;
    const item = currentValues[idx];
    if (canDeleteItemRef.current && !canDeleteItemRef.current(item, idx)) {
      return;
    }
    const newValues = currentValues.filter((_, i) => i !== idx);
    onSaveRef.current(newValues);
    if (editingIndexRef.current === idx) {
      setEditingIndex(null);
      setEditValue('');
      editValueRef.current = '';
      editingIndexRef.current = null;
    }
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingIndex(null);
    editingIndexRef.current = null;
    setEditValue('');
    editValueRef.current = '';
  }, []);

  const commitEdit = useCallback(
    (idx: number, val: string) => {
      const trimmed = val.trim();
      const currentValues = valuesRef.current || [];
      if (idx < 0 || idx >= currentValues.length) {
        cancelEdit();
        return;
      }

      const existingItem = currentValues[idx];
      if (canEditItemRef.current && !canEditItemRef.current(existingItem, idx)) {
        cancelEdit();
        return;
      }

      const currentVal = getEntryValue(existingItem).trim();

      if (trimmed === '') {
        if (canDeleteItemRef.current && !canDeleteItemRef.current(existingItem, idx)) {
          cancelEdit();
          return;
        }
        handleDelete(idx);
        return;
      }

      if (trimmed !== currentVal) {
        let updatedItem: MultiValueItem;
        if (typeof existingItem === 'object' && existingItem !== null) {
          updatedItem = { ...existingItem, value: trimmed };
        } else if (flagsRef.current && flagsRef.current.length > 0) {
          const itemObj: Record<string, any> = { value: trimmed };
          for (const f of flagsRef.current) {
            itemObj[f.key] = f.defaultValue ?? true;
          }
          updatedItem = itemObj as MultiValueEntry;
        } else {
          updatedItem = trimmed;
        }

        const newValues = [...currentValues];
        newValues[idx] = updatedItem as any;
        onSaveRef.current(newValues);
      }

      cancelEdit();
    },
    [cancelEdit, handleDelete]
  );

  const cancelAdd = useCallback(() => {
    setIsAdding(false);
    isAddingRef.current = false;
    setAddValue('');
    addValueRef.current = '';
  }, []);

  const commitAdd = useCallback(
    (val: string) => {
      const trimmed = val.trim();
      if (!trimmed) {
        cancelAdd();
        return;
      }
      const currentValues = valuesRef.current || [];

      let newItem: MultiValueItem;
      if (flagsRef.current && flagsRef.current.length > 0) {
        const itemObj: Record<string, any> = { value: trimmed };
        for (const f of flagsRef.current) {
          itemObj[f.key] = addFlagsRef.current[f.key] ?? f.defaultValue ?? true;
        }
        newItem = itemObj as MultiValueEntry;
      } else {
        if (currentValues.length > 0 && typeof currentValues[0] === 'object' && currentValues[0] !== null) {
          newItem = { value: trimmed };
        } else {
          newItem = trimmed;
        }
      }

      const newValues = [...currentValues, newItem as any];
      onSaveRef.current(newValues);
      cancelAdd();
    },
    [cancelAdd]
  );

  const handleToggleFlag = useCallback((idx: number, flagKey: string) => {
    const currentValues = valuesRef.current || [];
    if (idx < 0 || idx >= currentValues.length) return;
    const item = currentValues[idx];

    if (canToggleFlagRef.current && !canToggleFlagRef.current(item, flagKey, idx)) {
      return;
    }

    const flagConfig = (flagsRef.current || []).find((f) => f.key === flagKey);
    const def = flagConfig?.defaultValue ?? true;
    const currentActive = isFlagActive(item, flagKey, def);
    const nextActive = !currentActive;

    // If currently editing this row, preserve what the user has currently typed
    const currentValueText = editingIndexRef.current === idx && editValueRef.current.trim()
      ? editValueRef.current.trim()
      : getEntryValue(item);

    let updatedItem: MultiValueItem;
    if (typeof item === 'object' && item !== null) {
      updatedItem = { ...item, value: currentValueText, [flagKey]: nextActive };
    } else {
      updatedItem = { value: currentValueText, [flagKey]: nextActive };
    }

    const newValues = [...currentValues];
    newValues[idx] = updatedItem as any;
    onSaveRef.current(newValues);
  }, []);

  const handleClosePopover = useCallback(() => {
    if (isAddingRef.current && addValueRef.current.trim()) {
      commitAdd(addValueRef.current);
    } else if (editingIndexRef.current !== null) {
      commitEdit(editingIndexRef.current, editValueRef.current);
    }
    setEditingIndex(null);
    setIsAdding(false);
    setEditValue('');
    setAddValue('');
    onClose();
  }, [commitAdd, commitEdit, onClose]);

  const startEdit = (idx: number, currentVal: string) => {
    const currentValues = valuesRef.current || [];
    if (idx >= 0 && idx < currentValues.length) {
      const item = currentValues[idx];
      if (canEditItemRef.current && !canEditItemRef.current(item, idx)) {
        return;
      }
    }
    setIsAdding(false);
    isAddingRef.current = false;
    setEditingIndex(idx);
    editingIndexRef.current = idx;
    setEditValue(currentVal);
    editValueRef.current = currentVal;
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Enter') {
      commitEdit(idx, editValueRef.current);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      cancelEdit();
    }
  };

  const handleEditBlur = (e: React.FocusEvent<HTMLInputElement>, idx: number) => {
    const related = e.relatedTarget as Node | null;
    if (related && editWrapperRef.current?.contains(related)) {
      return;
    }
    commitEdit(idx, editValueRef.current);
  };

  const handleStartAdd = () => {
    setEditingIndex(null);
    editingIndexRef.current = null;
    setIsAdding(true);
    isAddingRef.current = true;
    setAddValue('');
    addValueRef.current = '';
    const initialFlags: Record<string, boolean> = {};
    for (const f of flagsRef.current || []) {
      initialFlags[f.key] = f.defaultValue ?? true;
    }
    setAddFlags(initialFlags);
  };

  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitAdd(addValueRef.current);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      cancelAdd();
    }
  };

  const handleAddBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const related = e.relatedTarget as Node | null;
    if (related && addWrapperRef.current?.contains(related)) {
      return;
    }
    commitAdd(addValueRef.current);
  };

  if (!isOpen) return null;

  return (
    <CellPopover
      isOpen={isOpen}
      onClose={handleClosePopover}
      anchorEl={anchorEl}
      className="glass-popup multivalue-popover"
      width={340}
      minWidth={280}
      style={{
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Subtle popover header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          padding: '2px 4px 6px 4px',
        }}
      >
        <span
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--text-h)',
          }}
        >
          {title || placeholder}
        </span>
        <button
          type="button"
          onClick={handleClosePopover}
          title={t('close') || 'Schließen'}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            color: 'var(--text-secondary, #94a3b8)',
            display: 'inline-flex',
            alignItems: 'center',
            borderRadius: '4px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-h)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Rows container */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: '6px',
          overflow: 'hidden',
          maxHeight: '260px',
          overflowY: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <tbody>
            {values.map((item, idx) => {
              const val = getEntryValue(item);

              if (editingIndex === idx) {
                return (
                  <tr key={idx} style={{ background: 'var(--bg-subtle)' }}>
                    <td style={{ padding: '6px 8px' }} colSpan={2}>
                      <div
                        ref={editWrapperRef}
                        className="easy-edit-inline-wrapper"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => {
                            setEditValue(e.target.value);
                            editValueRef.current = e.target.value;
                          }}
                          onKeyDown={(e) => handleEditKeyDown(e, idx)}
                          onBlur={(e) => handleEditBlur(e, idx)}
                          autoFocus
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: '3px 6px',
                            fontSize: '0.85rem',
                            border: '1px solid var(--primary)',
                            borderRadius: '4px',
                            background: 'var(--input-bg)',
                            color: 'var(--input-text)',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                        {flags && flags.length > 0 && (
                          <div
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {flags.map((flag) => {
                              const isActive = isFlagActive(item, flag.key, flag.defaultValue ?? true);
                              const canToggle = !canToggleFlag || canToggleFlag(item, flag.key, idx);
                              const flagDisabledTitle = disabledReason?.(item, 'toggle', flag.key);
                              const titleText = !canToggle && flagDisabledTitle
                                ? flagDisabledTitle
                                : (isActive
                                    ? flag.titleActive || `${flag.label || flag.key}: Ein`
                                    : flag.titleInactive || `${flag.label || flag.key}: Aus`);
                              return (
                                <button
                                  key={flag.key}
                                  type="button"
                                  className={`multivalue-flag-btn flag-${flag.key}`}
                                  disabled={!canToggle}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    if (canToggle) {
                                      handleToggleFlag(idx, flag.key);
                                    }
                                  }}
                                  title={titleText}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: canToggle ? 'pointer' : 'not-allowed',
                                    padding: '2px 4px',
                                    fontSize: '0.95rem',
                                    lineHeight: 1,
                                    opacity: canToggle ? (isActive ? 1 : 0.25) : (isActive ? 0.6 : 0.15),
                                    filter: isActive ? 'none' : 'grayscale(100%)',
                                    transition: 'opacity 0.15s ease, filter 0.15s ease, transform 0.1s ease',
                                    borderRadius: '4px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                  onMouseEnter={(e) => {
                                    if (canToggle) e.currentTarget.style.transform = 'scale(1.15)';
                                  }}
                                  onMouseLeave={(e) => {
                                    if (canToggle) e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                >
                                  {flag.icon}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                          <button
                            type="button"
                            className="easy-edit-button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              commitEdit(idx, editValueRef.current);
                            }}
                            title={t('save') || 'Speichern'}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '3px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              color: 'var(--primary)',
                              borderRadius: '4px',
                            }}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            className="easy-edit-button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              cancelEdit();
                            }}
                            title={t('cancel') || 'Abbrechen'}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '3px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              color: '#94a3b8',
                              borderRadius: '4px',
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={idx}
                  style={{
                    borderBottom: idx === values.length - 1 && !isAdding ? 'none' : '1px solid var(--border)',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {(() => {
                    const canEdit = !canEditItem || canEditItem(item, idx);
                    const canDelete = !canDeleteItem || canDeleteItem(item, idx);
                    const editDisabledTitle = disabledReason?.(item, 'edit');
                    const deleteDisabledTitle = disabledReason?.(item, 'delete');
                    return (
                      <>
                        <td
                          style={{
                            padding: '6px 8px',
                            cursor: canEdit ? 'pointer' : 'default',
                            wordBreak: 'break-all',
                          }}
                          onDoubleClick={() => {
                            if (canEdit) startEdit(idx, val);
                          }}
                          title={canEdit ? (t('edit') || 'Doppelklick zum Bearbeiten') : (editDisabledTitle || undefined)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: 'var(--text-h)', flex: 1, minWidth: 0 }}>{val}</span>
                            {flags && flags.length > 0 && (
                              <div
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {flags.map((flag) => {
                                  const isActive = isFlagActive(item, flag.key, flag.defaultValue ?? true);
                                  const canToggle = !canToggleFlag || canToggleFlag(item, flag.key, idx);
                                  const flagDisabledTitle = disabledReason?.(item, 'toggle', flag.key);
                                  const titleText = !canToggle && flagDisabledTitle
                                    ? flagDisabledTitle
                                    : (isActive
                                        ? flag.titleActive || `${flag.label || flag.key}: Ein`
                                        : flag.titleInactive || `${flag.label || flag.key}: Aus`);
                                  return (
                                    <button
                                      key={flag.key}
                                      type="button"
                                      className={`multivalue-flag-btn flag-${flag.key}`}
                                      disabled={!canToggle}
                                      onClick={() => {
                                        if (canToggle) handleToggleFlag(idx, flag.key);
                                      }}
                                      title={titleText}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: canToggle ? 'pointer' : 'not-allowed',
                                        padding: '2px 4px',
                                        fontSize: '0.95rem',
                                        lineHeight: 1,
                                        opacity: canToggle ? (isActive ? 1 : 0.25) : (isActive ? 0.6 : 0.15),
                                        filter: isActive ? 'none' : 'grayscale(100%)',
                                        transition: 'opacity 0.15s ease, filter 0.15s ease, transform 0.1s ease',
                                        borderRadius: '4px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (canToggle) e.currentTarget.style.transform = 'scale(1.15)';
                                      }}
                                      onMouseLeave={(e) => {
                                        if (canToggle) e.currentTarget.style.transform = 'scale(1)';
                                      }}
                                    >
                                      {flag.icon}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '6px 8px', width: '56px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              type="button"
                              className="easy-edit-button edit-entry-btn"
                              disabled={!canEdit}
                              onClick={() => {
                                if (canEdit) startEdit(idx, val);
                              }}
                              title={canEdit ? (t('edit') || 'Bearbeiten') : (editDisabledTitle || t('edit') || 'Bearbeiten')}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: canEdit ? 'pointer' : 'not-allowed',
                                padding: '3px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                color: canEdit ? '#64748b' : '#cbd5e1',
                                borderRadius: '4px',
                                opacity: canEdit ? 1 : 0.35,
                              }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              className="easy-edit-button delete-entry-btn"
                              disabled={!canDelete}
                              onClick={() => {
                                if (canDelete) handleDelete(idx);
                              }}
                              title={canDelete ? (t('delete') || 'Löschen') : (deleteDisabledTitle || t('delete') || 'Löschen')}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: canDelete ? 'pointer' : 'not-allowed',
                                padding: '3px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                color: canDelete ? '#ef4444' : '#fca5a5',
                                borderRadius: '4px',
                                opacity: canDelete ? 1 : 0.35,
                              }}
                            >
                              <Trash size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    );
                  })()}
                </tr>
              );
            })}

            {/* Add row */}
            {isAdding && (
              <tr style={{ background: 'var(--bg-subtle)' }}>
                <td style={{ padding: '6px 8px' }} colSpan={2}>
                  <div
                    ref={addWrapperRef}
                    className="easy-edit-inline-wrapper"
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      ref={addInputRef}
                      type="text"
                      value={addValue}
                      onChange={(e) => {
                        setAddValue(e.target.value);
                        addValueRef.current = e.target.value;
                      }}
                      onKeyDown={handleAddKeyDown}
                      onBlur={handleAddBlur}
                      autoFocus
                      placeholder={t('newItem') || 'Neuer Eintrag...'}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '3px 6px',
                        fontSize: '0.85rem',
                        border: '1px solid var(--primary)',
                        borderRadius: '4px',
                        background: 'var(--input-bg)',
                        color: 'var(--input-text)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    {flags && flags.length > 0 && (
                      <div
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {flags.map((flag) => {
                          const isActive = addFlags[flag.key] ?? flag.defaultValue ?? true;
                          const canToggle = !canToggleFlag || canToggleFlag(null as any, flag.key, -1);
                          const flagDisabledTitle = disabledReason?.(null as any, 'toggle', flag.key);
                          const titleText = !canToggle && flagDisabledTitle
                            ? flagDisabledTitle
                            : (isActive
                                ? flag.titleActive || `${flag.label || flag.key}: Ein`
                                : flag.titleInactive || `${flag.label || flag.key}: Aus`);
                          return (
                            <button
                              key={flag.key}
                              type="button"
                              className={`multivalue-flag-btn flag-${flag.key}`}
                              disabled={!canToggle}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                if (canToggle) {
                                  setAddFlags((prev) => ({
                                    ...prev,
                                    [flag.key]: !(prev[flag.key] ?? flag.defaultValue ?? true),
                                  }));
                                }
                              }}
                              title={titleText}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: canToggle ? 'pointer' : 'not-allowed',
                                padding: '2px 4px',
                                fontSize: '0.95rem',
                                lineHeight: 1,
                                opacity: canToggle ? (isActive ? 1 : 0.25) : (isActive ? 0.6 : 0.15),
                                filter: isActive ? 'none' : 'grayscale(100%)',
                                transition: 'opacity 0.15s ease, filter 0.15s ease, transform 0.1s ease',
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              onMouseEnter={(e) => {
                                if (canToggle) e.currentTarget.style.transform = 'scale(1.15)';
                              }}
                              onMouseLeave={(e) => {
                                if (canToggle) e.currentTarget.style.transform = 'scale(1)';
                              }}
                            >
                              {flag.icon}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="easy-edit-button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          commitAdd(addValueRef.current);
                        }}
                        title={t('save') || 'Speichern'}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '3px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          color: 'var(--primary)',
                          borderRadius: '4px',
                        }}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        className="easy-edit-button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          cancelAdd();
                        }}
                        title={t('cancel') || 'Abbrechen'}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '3px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          color: '#94a3b8',
                          borderRadius: '4px',
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {!isAdding && values.length === 0 && (
              <tr
                className="multivalue-empty-placeholder-row"
                style={{
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
                onClick={handleStartAdd}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={placeholder}
              >
                <td
                  colSpan={2}
                  style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontStyle: 'italic',
                    userSelect: 'none',
                  }}
                >
                  {placeholder}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Horizontally centered '+' button at the bottom */}
      {!isAdding && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '4px 0 2px 0',
          }}
        >
          <button
            type="button"
            className="easy-edit-button add-value-btn"
            onClick={handleStartAdd}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 16px',
              fontSize: '0.85rem',
              fontWeight: 500,
              background: 'var(--bg-subtle)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--border)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
            }}
            title={placeholder}
          >
            <Plus size={16} />
          </button>
        </div>
      )}
    </CellPopover>
  );
};

export const MultiValueListEditor = MultiValueListPopover;
export default MultiValueListPopover;
