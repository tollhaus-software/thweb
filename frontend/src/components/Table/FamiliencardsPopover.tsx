import React, { useState, useEffect, useRef } from 'react';
import { Plus, Check, X, Trash, Pencil, List } from 'lucide-react';
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

  const currentYear = new Date().getFullYear();
  const maxYear = currentYear + 10;

  const getDefaultYear = React.useCallback(
    (existingCards?: number[]) => {
      const cards = existingCards || [];
      return cards.includes(currentYear) ? currentYear + 1 : currentYear;
    },
    [currentYear]
  );

  const dropdownYears = React.useMemo(() => {
    const years: number[] = [];
    // Next 2 years, current year, last 10 years
    for (let y = currentYear + 2; y >= currentYear - 10; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  const isInitiallyEmpty = !readOnly && (!child?.familiencards || child.familiencards.length === 0);
  const [isAddingRow, setIsAddingRow] = useState(isInitiallyEmpty);
  const [newYear, setNewYear] = useState<string>(() => String(getDefaultYear(child?.familiencards)));
  const [isCustom, setIsCustom] = useState(false);

  const selectRef = useRef<HTMLSelectElement>(null);
  const yearInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const empty = !readOnly && (!child?.familiencards || child.familiencards.length === 0);
      setIsAddingRow(empty);
      setIsCustom(false);
      setNewYear(String(getDefaultYear(child?.familiencards)));
    }
  }, [isOpen, child?.id, child?.familiencards, readOnly, getDefaultYear]);

  useEffect(() => {
    if (isOpen && isAddingRow) {
      const timer = setTimeout(() => {
        if (!isCustom && selectRef.current) {
          selectRef.current.focus();
        } else if (isCustom && yearInputRef.current) {
          yearInputRef.current.focus();
          yearInputRef.current.select();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isAddingRow, isCustom]);

  const handleStartAdd = () => {
    setIsCustom(false);
    setNewYear(String(getDefaultYear(child?.familiencards)));
    setIsAddingRow(true);
  };

  const handleCancelAdd = () => {
    setIsAddingRow(false);
    setIsCustom(false);
  };

  const handleSaveNewYear = async () => {
    if (!child || !newYear.trim()) return;

    const yr = parseInt(newYear.trim(), 10);
    if (isNaN(yr) || yr <= 2000 || yr >= maxYear || !/^\d{4}$/.test(newYear.trim())) {
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
      setIsCustom(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save Familiencard';
      alert(message);
    }
  };

  const handleUpdateYear = async (oldYear: number, newYearVal: string) => {
    if (!child) return;
    const yr = parseInt(newYearVal.trim(), 10);
    if (isNaN(yr) || yr <= 2000 || yr >= maxYear || !/^\d{4}$/.test(newYearVal.trim())) {
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
                        return !isNaN(parsed) && /^\d{4}$/.test(val.trim()) && parsed > 2000 && parsed < maxYear;
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
                  {!isCustom ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <select
                        ref={selectRef}
                        data-testid="familiencard-year-select"
                        value={dropdownYears.includes(Number(newYear)) ? newYear : 'custom'}
                        onChange={(e) => {
                          if (e.target.value === 'custom') {
                            setIsCustom(true);
                            setNewYear('');
                          } else {
                            setNewYear(e.target.value);
                          }
                        }}
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
                      >
                        {dropdownYears.map((yr) => (
                          <option key={yr} value={String(yr)}>
                            {yr}
                          </option>
                        ))}
                        <option value="custom">{t('otherYear')}</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustom(true);
                          setNewYear('');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted, #94a3b8)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px',
                          borderRadius: '4px',
                          flexShrink: 0,
                        }}
                        title={t('enterCustomYear')}
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustom(false);
                          setNewYear(String(getDefaultYear(child.familiencards)));
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted, #94a3b8)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px',
                          borderRadius: '4px',
                          flexShrink: 0,
                        }}
                        title={t('selectFromList')}
                      >
                        <List size={13} />
                      </button>
                    </div>
                  )}
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
