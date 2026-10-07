import React, { useState, useEffect, useRef } from 'react';
import { Plus, Check, X, Trash, Pencil, Calendar } from 'lucide-react';
import { t, CURRENT_LOCALE, formatDisplayDate, parseInputDate } from '../../utils/i18n';
import { CellPopover } from './CellPopover';
import EasyEdit, { Types } from '../InlineEdit';
import { CalendarDropdown } from '../CalendarDropdown';

const EasyEditComponent = EasyEdit;
const EasyEditTypes = Types;

export interface ChildGroupChange {
  id: string;
  child: string;
  change_date: string;
  target_group: number;
  created_at?: string;
  updated_at?: string;
}

export interface ChildWithChanges {
  id: string;
  first_name: string;
  last_name: string;
  group_changes?: ChildGroupChange[];
}

interface GroupChangesPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  child: ChildWithChanges | null;
  onAddGroupChange: (childId: string, changeDate: string, targetGroup: number) => Promise<void>;
  onUpdateGroupChange?: (changeId: string, changeDate: string, targetGroup: number) => Promise<void>;
  onDeleteGroupChange: (changeId: string) => Promise<void>;
}

export const GroupChangesPopover: React.FC<GroupChangesPopoverProps> = ({
  isOpen,
  onClose,
  anchorEl,
  child,
  onAddGroupChange,
  onUpdateGroupChange,
  onDeleteGroupChange,
}) => {
  // Sort changes chronologically: oldest at the top
  const sortedChanges = React.useMemo(() => {
    return [...(child?.group_changes || [])].sort((a, b) =>
      a.change_date.localeCompare(b.change_date)
    );
  }, [child?.group_changes]);

  // Determine pre-filled next group: (newest group + 1)
  const calculateNextGroup = React.useCallback((): number => {
    if (!sortedChanges || sortedChanges.length === 0) return 1;
    const newest = sortedChanges[sortedChanges.length - 1];
    const newestGroup = newest.target_group;
    if (newestGroup === 1) return 2;
    if (newestGroup === 2) return 3;
    if (newestGroup === 3) return 0; // After Hort, exit
    return 1;
  }, [sortedChanges]);

  const getInitialNewDate = (): string => {
    const today = new Date();
    return CURRENT_LOCALE === 'de' ? formatDisplayDate(today) : today.toISOString().split('T')[0];
  };

  // Special case: opening when child has no group changes yet behaves as if '+' was pressed immediately
  const isInitiallyEmpty = !child?.group_changes || child.group_changes.length === 0;
  const [isAddingRow, setIsAddingRow] = useState(isInitiallyEmpty);
  const [newDate, setNewDate] = useState<string>(getInitialNewDate);
  const [newTargetGroup, setNewTargetGroup] = useState<number>(() => calculateNextGroup());
  const [isCalendarOpen, setIsCalendarOpen] = useState(isInitiallyEmpty);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const dateContainerRef = useRef<HTMLDivElement>(null);

  // Focus date input when adding row
  useEffect(() => {
    if (isOpen && isAddingRow) {
      const timer = setTimeout(() => {
        if (dateInputRef.current) {
          dateInputRef.current.focus();
          dateInputRef.current.select();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isAddingRow]);

  const handleStartAdd = () => {
    setNewDate(getInitialNewDate());
    setNewTargetGroup(calculateNextGroup());
    setIsAddingRow(true);
    setIsCalendarOpen(true);
  };

  const handleCancelAdd = () => {
    setIsAddingRow(false);
    setIsCalendarOpen(false);
  };

  const handleSaveNewRow = async () => {
    if (!child || !newDate) return;
    const parsedDate = parseInputDate(newDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
      alert(t('invalidDateFormat'));
      return;
    }
    try {
      await onAddGroupChange(child.id, `${parsedDate}T00:00:00Z`, newTargetGroup);
      setIsAddingRow(false);
      setIsCalendarOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save group change';
      alert(message);
    }
  };

  const handleSaveDate = async (gc: ChildGroupChange, newDateIso: string) => {
    try {
      if (onUpdateGroupChange) {
        await onUpdateGroupChange(gc.id, `${newDateIso}T00:00:00Z`, gc.target_group);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update date';
      alert(message);
    }
  };

  const handleSaveTargetGroup = async (gc: ChildGroupChange, newTargetGroupValue: number) => {
    try {
      if (onUpdateGroupChange) {
        await onUpdateGroupChange(gc.id, gc.change_date, newTargetGroupValue);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update target group';
      alert(message);
    }
  };

  const handleDelete = async (changeId: string) => {
    if (!window.confirm(t('groupChangeDeleteConfirm'))) return;
    try {
      await onDeleteGroupChange(changeId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete group change';
      alert(message);
    }
  };

  const groupLabels: Record<number, string> = {
    0: t('exit'),
    1: t('group1'),
    2: t('group2'),
    3: t('group3'),
  };

  const groupOptions = [
    { label: t('group1'), value: '1' },
    { label: t('group2'), value: '2' },
    { label: t('group3'), value: '3' },
    { label: t('exit'), value: '0' },
  ];

  if (!isOpen || !child) return null;

  return (
    <CellPopover
      isOpen={isOpen}
      onClose={onClose}
      anchorEl={anchorEl}
      width={420}
      minWidth={360}
      style={{
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Group Changes Table */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: '6px',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', width: '150px' }}>{t('date')}</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('group')}</th>
              <th style={{ padding: '6px 8px', width: '36px', textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {sortedChanges.map((gc) => {
              const initialDate = gc.change_date ? gc.change_date.split('T')[0] : '';
              const dateDisplayValue = CURRENT_LOCALE === 'de' ? formatDisplayDate(initialDate) : initialDate;

              return (
                <tr key={gc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <EasyEditComponent
                      type={EasyEditTypes.DATE}
                      value={dateDisplayValue}
                      onSave={(val: string) => {
                        const isoDate = parseInputDate(val);
                        if (isoDate) {
                          handleSaveDate(gc, isoDate);
                        }
                      }}
                      editButtonLabel={<Pencil size={13} />}
                      instructions={t('date')}
                      displayComponent={<span>{formatDisplayDate(gc.change_date)}</span>}
                      viewAttributes={{}}
                      inputAttributes={{}}
                      onCancel={() => {}}
                      onValidate={(val: string) => {
                        const parsed = parseInputDate(val);
                        return /^\d{4}-\d{2}-\d{2}$/.test(parsed);
                      }}
                    />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <EasyEditComponent
                      type={EasyEditTypes.SELECT}
                      value={String(gc.target_group)}
                      options={groupOptions}
                      onSave={(val: string) => {
                        handleSaveTargetGroup(gc, parseInt(val, 10));
                      }}
                      editButtonLabel={<Pencil size={13} />}
                      instructions={t('group')}
                      displayComponent={
                        <span
                          style={{
                            fontWeight: gc.target_group === 0 ? 'normal' : 600,
                            color: gc.target_group === 0 ? 'var(--text-muted)' : 'inherit',
                          }}
                        >
                          {groupLabels[gc.target_group] || `${t('targetGroup')}: ${gc.target_group}`}
                        </span>
                      }
                      viewAttributes={{}}
                      inputAttributes={{}}
                      onCancel={() => {}}
                      onValidate={() => true}
                    />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleDelete(gc.id)}
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
                </tr>
              );
            })}

            {/* Empty editable row at bottom when adding */}
            {isAddingRow && (
              <tr
                style={{
                  background: 'var(--accent-bg, rgba(2, 132, 199, 0.06))',
                  borderTop: sortedChanges.length > 0 ? '1px dashed var(--primary)' : 'none',
                }}
              >
                <td style={{ padding: '6px 8px' }}>
                  <div
                    ref={dateContainerRef}
                    style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}
                  >
                    <input
                      ref={dateInputRef}
                      type="text"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      onFocus={() => setIsCalendarOpen(true)}
                      onClick={() => setIsCalendarOpen(true)}
                      placeholder={CURRENT_LOCALE === 'de' ? 'TT.MM.JJJJ' : 'YYYY-MM-DD'}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setIsCalendarOpen(false);
                          handleSaveNewRow();
                        }
                        if (e.key === 'Escape') {
                          if (isCalendarOpen) {
                            setIsCalendarOpen(false);
                          } else {
                            handleCancelAdd();
                          }
                        }
                        if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) {
                          e.preventDefault();
                          setIsCalendarOpen((prev) => !prev);
                        }
                      }}
                      style={{
                        padding: '3px 26px 3px 6px',
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
                      tabIndex={-1}
                      style={{
                        position: 'absolute',
                        right: '4px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2px',
                        color: isCalendarOpen ? 'var(--primary)' : '#64748b',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCalendarOpen((prev) => !prev);
                      }}
                      title={t('date')}
                    >
                      <Calendar size={15} />
                    </button>
                    <CalendarDropdown
                      anchorRef={dateContainerRef}
                      isOpen={isCalendarOpen}
                      onClose={() => setIsCalendarOpen(false)}
                      selectedDateStr={newDate}
                      onSelectDate={(formatted) => {
                        setNewDate(formatted);
                        setIsCalendarOpen(false);
                      }}
                    />
                  </div>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <select
                    value={newTargetGroup}
                    onChange={(e) => setNewTargetGroup(parseInt(e.target.value, 10))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveNewRow();
                      if (e.key === 'Escape') handleCancelAdd();
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
                    <option value={1}>{t('group1')}</option>
                    <option value={2}>{t('group2')}</option>
                    <option value={3}>{t('group3')}</option>
                    <option value={0}>{t('exit')}</option>
                  </select>
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={handleSaveNewRow}
                      title={t('save')}
                      style={{
                        background: 'var(--primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '3px 6px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelAdd}
                      title={t('cancel')}
                      style={{
                        background: 'transparent',
                        color: '#64748b',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        padding: '3px 6px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {!isAddingRow && sortedChanges.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  style={{
                    padding: '1rem',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontStyle: 'italic',
                  }}
                >
                  {t('noGroupChangesRecorded')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Centered neutral '+' button under the existing rows */}
      {!isAddingRow && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '6px 0 2px 0',
          }}
        >
          <button
            type="button"
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
            title={t('addGroupChange')}
          >
            <Plus size={16} />
          </button>
        </div>
      )}
    </CellPopover>
  );
};
