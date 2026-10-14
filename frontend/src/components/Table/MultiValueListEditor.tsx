import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Pencil, Trash, Plus, Check, X } from 'lucide-react';
import { t } from '../../utils/i18n';
import { CellPopover } from './CellPopover';

export interface MultiValueListEditorProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  values: string[];
  onSave: (newValues: string[]) => void;
  placeholder?: string;
  title?: string;
}

export const MultiValueListPopover: React.FC<MultiValueListEditorProps> = ({
  isOpen,
  onClose,
  anchorEl,
  values = [],
  onSave,
  placeholder = '',
  title,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addValue, setAddValue] = useState('');

  const editInputRef = useRef<HTMLInputElement>(null);
  const editWrapperRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const addWrapperRef = useRef<HTMLDivElement>(null);

  const editValueRef = useRef(editValue);
  const addValueRef = useRef(addValue);
  const isAddingRef = useRef(isAdding);
  const editingIndexRef = useRef(editingIndex);
  const valuesRef = useRef(values);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    editValueRef.current = editValue;
  }, [editValue]);

  useEffect(() => {
    addValueRef.current = addValue;
  }, [addValue]);

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

  // When popover opens: if no values yet, behave as if '+' was already pressed
  useEffect(() => {
    if (isOpen) {
      if (!values || values.length === 0) {
        setIsAdding(true);
        isAddingRef.current = true;
        setAddValue('');
        addValueRef.current = '';
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

  const commitEdit = useCallback((idx: number, val: string) => {
    const trimmed = val.trim();
    const currentValues = valuesRef.current || [];
    const currentVal = (currentValues[idx] || '').trim();
    if (trimmed === '') {
      // Remove item if saved empty
      const newValues = currentValues.filter((_, i) => i !== idx);
      onSaveRef.current(newValues);
    } else if (trimmed !== currentVal) {
      const newValues = [...currentValues];
      newValues[idx] = trimmed;
      onSaveRef.current(newValues);
    }
    setEditingIndex(null);
    setEditValue('');
    editValueRef.current = '';
    editingIndexRef.current = null;
  }, []);

  const commitAdd = useCallback((val: string) => {
    const trimmed = val.trim();
    if (trimmed) {
      const currentValues = valuesRef.current || [];
      onSaveRef.current([...currentValues, trimmed]);
    }
    setIsAdding(false);
    setAddValue('');
    addValueRef.current = '';
    isAddingRef.current = false;
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
    setIsAdding(false);
    isAddingRef.current = false;
    setEditingIndex(idx);
    editingIndexRef.current = idx;
    setEditValue(currentVal);
    editValueRef.current = currentVal;
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    editingIndexRef.current = null;
    setEditValue('');
    editValueRef.current = '';
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
  };

  const cancelAdd = () => {
    setIsAdding(false);
    isAddingRef.current = false;
    setAddValue('');
    addValueRef.current = '';
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

  const handleDelete = (idx: number) => {
    const currentValues = valuesRef.current || [];
    const newValues = currentValues.filter((_, i) => i !== idx);
    onSaveRef.current(newValues);
    if (editingIndex === idx) {
      cancelEdit();
    }
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
          fontSize: '0.85rem',
          fontWeight: 600,
          color: 'var(--text-h)',
          padding: '2px 4px 4px 4px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {title || placeholder}
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
            {values.map((val, idx) => {
              if (editingIndex === idx) {
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
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
                  <td
                    style={{ padding: '6px 8px', cursor: 'pointer', wordBreak: 'break-all' }}
                    onDoubleClick={() => startEdit(idx, val)}
                    title={t('edit') || 'Doppelklick zum Bearbeiten'}
                  >
                    <span style={{ color: 'var(--text-h)' }}>{val}</span>
                  </td>
                  <td style={{ padding: '6px 8px', width: '56px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        className="easy-edit-button edit-entry-btn"
                        onClick={() => startEdit(idx, val)}
                        title={t('edit') || 'Bearbeiten'}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '3px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          color: 'var(--text-muted)',
                          borderRadius: '4px',
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="easy-edit-button delete-entry-btn"
                        onClick={() => handleDelete(idx)}
                        title={t('delete') || 'Löschen'}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '3px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          color: '#ef4444',
                          borderRadius: '4px',
                        }}
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </td>
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
