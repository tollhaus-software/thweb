import React, { useState, useEffect, useRef } from 'react';
import { Plus, Check, X, Trash, Pencil } from 'lucide-react';
import { t } from '../../utils/i18n';
import { CellPopover } from './CellPopover';
import EasyEdit, { Types } from '../InlineEdit';

const EasyEditComponent = EasyEdit;
const EasyEditTypes = Types;

export interface ChildWithFamiliencards {
  id: string;
  first_name: string;
  last_name: string;
  familiencards?: number[];
}

export interface FamiliencardsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  child: ChildWithFamiliencards | null;
  onSaveFamiliencards: (childId: string, updatedCards: number[]) => Promise<void>;
  readOnly?: boolean;
}

export const FamiliencardsPopover: React.FC<FamiliencardsPopoverProps> = ({
  isOpen,
  onClose,
  anchorEl,
  child,
  onSaveFamiliencards,
  readOnly = false,
}) => {
  // Sort years chronologically ascending
  const sortedYears = React.useMemo(() => {
    return [...(child?.familiencards || [])].sort((a, b) => a - b);
  }, [child?.familiencards]);

  const currentYearStr = String(new Date().getFullYear());
  const isInitiallyEmpty = !readOnly && (!child?.familiencards || child.familiencards.length === 0);
  const [isAddingRow, setIsAddingRow] = useState(isInitiallyEmpty);
  const [newYear, setNewYear] = useState<string>(currentYearStr);

  const yearInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const empty = !readOnly && (!child?.familiencards || child.familiencards.length === 0);
      setIsAddingRow(empty);
      setNewYear(currentYearStr);
    }
  }, [isOpen, child?.id, readOnly, currentYearStr]);

  useEffect(() => {
    if (isOpen && isAddingRow) {
      const timer = setTimeout(() => {
        if (yearInputRef.current) {
          yearInputRef.current.focus();
          yearInputRef.current.select();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isAddingRow]);

  const handleStartAdd = () => {
    setNewYear(currentYearStr);
    setIsAddingRow(true);
  };

  const handleCancelAdd = () => {
    setIsAddingRow(false);
  };

  const handleSaveNewYear = async () => {
    if (!child || !newYear.trim()) return;

    const yr = parseInt(newYear.trim(), 10);
    if (isNaN(yr) || yr < 1900 || yr > 2100 || !/^\d{4}$/.test(newYear.trim())) {
      alert(t('yearInvalid'));
      return;
    }

    const currentList = child.familiencards || [];
    if (currentList.includes(yr)) {
      alert(t('yearDuplicate'));
      return;
    }

    const updatedList = [...currentList, yr].sort((a, b) => a - b);

    try {
      await onSaveFamiliencards(child.id, updatedList);
      setIsAddingRow(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save Familiencard';
      alert(message);
    }
  };

  const handleUpdateYear = async (oldYear: number, newYearVal: string) => {
    if (!child) return;
    const yr = parseInt(newYearVal.trim(), 10);
    if (isNaN(yr) || yr < 1900 || yr > 2100 || !/^\d{4}$/.test(newYearVal.trim())) {
      alert(t('yearInvalid'));
      return;
    }

    const currentList = child.familiencards || [];
    if (yr !== oldYear && currentList.includes(yr)) {
      alert(t('yearDuplicate'));
      return;
    }

    const updatedList = currentList.map((y) => (y === oldYear ? yr : y)).sort((a, b) => a - b);
    try {
      await onSaveFamiliencards(child.id, updatedList);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update Familiencard';
      alert(message);
    }
  };

  const handleDeleteYear = async (yr: number) => {
    if (!child) return;
    if (!window.confirm(t('familiencardDeleteConfirm'))) return;

    const updatedList = (child.familiencards || []).filter((y) => y !== yr);
    try {
      await onSaveFamiliencards(child.id, updatedList);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete Familiencard';
      alert(message);
    }
  };

  if (!isOpen || !child) return null;

  return (
    <CellPopover
      isOpen={isOpen}
      onClose={onClose}
      anchorEl={anchorEl}
      width={280}
      minWidth={240}
      style={{
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: '6px',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('year')}</th>
              {!readOnly && <th style={{ padding: '6px 8px', width: '36px', textAlign: 'center' }}></th>}
            </tr>
          </thead>
          <tbody>
            {sortedYears.map((yr) => (
              <tr key={yr} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px' }}>
                  {readOnly ? (
                    <span>{yr}</span>
                  ) : (
                    <EasyEditComponent
                      type={EasyEditTypes.TEXT}
                      value={String(yr)}
                      onSave={(val: string) => handleUpdateYear(yr, val)}
                      editButtonLabel={<Pencil size={13} />}
                      instructions={t('year')}
                      displayComponent={<span>{yr}</span>}
                      viewAttributes={{}}
                      inputAttributes={{}}
                      onCancel={() => {}}
                      onValidate={(val: string) => {
                        const parsed = parseInt(val.trim(), 10);
                        return !isNaN(parsed) && /^\d{4}$/.test(val.trim()) && parsed >= 1900 && parsed <= 2100;
                      }}
                    />
                  )}
                </td>
                {!readOnly && (
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleDeleteYear(yr)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px',
                        borderRadius: '4px',
                      }}
                      title={t('delete')}
                    >
                      <Trash size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}

            {/* Empty editable row at bottom when adding */}
            {isAddingRow && (
              <tr
                style={{
                  background: 'var(--accent-bg, rgba(2, 132, 199, 0.06))',
                  borderTop: sortedYears.length > 0 ? '1px dashed var(--primary)' : 'none',
                }}
              >
                <td style={{ padding: '6px 8px' }}>
                  <input
                    ref={yearInputRef}
                    type="text"
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    placeholder="JJJJ"
                    maxLength={4}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveNewYear();
                      }
                      if (e.key === 'Escape') {
                        handleCancelAdd();
                      }
                    }}
                    style={{
                      padding: '3px 6px',
                      fontSize: '0.825rem',
                      border: '1px solid var(--input-border)',
                      borderRadius: '4px',
                      background: 'var(--input-bg)',
                      color: 'var(--input-text)',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                    required
                  />
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={handleSaveNewYear}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary, #0284c7)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px',
                        borderRadius: '4px',
                      }}
                      title={t('save')}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelAdd}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted, #94a3b8)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px',
                        borderRadius: '4px',
                      }}
                      title={t('cancel')}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && !isAddingRow && (
        <button
          type="button"
          onClick={handleStartAdd}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.825rem',
            padding: '4px 8px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text-main)',
            cursor: 'pointer',
            alignSelf: 'flex-start',
            marginTop: '2px',
          }}
        >
          <Plus size={14} />
          <span>{t('addFamiliencard')}</span>
        </button>
      )}
    </CellPopover>
  );
};
