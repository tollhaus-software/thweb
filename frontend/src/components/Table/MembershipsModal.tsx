import React, { useState, useEffect, useRef } from 'react';
import { Plus, Check, X, Trash, Pencil, Calendar } from 'lucide-react';
import { t, CURRENT_LOCALE, formatDisplayDate, parseInputDate } from '../../utils/i18n';
import EasyEdit, { Types } from '../InlineEdit';
import { CalendarDropdown } from '../CalendarDropdown';
import { CellPopover } from './CellPopover';

const EasyEditComponent = EasyEdit;
const EasyEditTypes = Types;

export interface THMembership {
  id: string;
  parent_id: string;
  start_date: string;
  end_date?: string | null;
  membership_type: 'full_member' | 'supporting_member';
  created_at?: string;
  updated_at?: string;
}

export interface ParentWithMemberships {
  id: string;
  first_name: string;
  last_name: string;
  memberships?: THMembership[];
}

export interface FamilyWithChildren {
  id?: string;
  children?: Array<{
    id?: string;
    group_changes?: Array<{
      id?: string;
      change_date: string;
      target_group?: number;
    }>;
  }>;
}

export interface MembershipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  parent: ParentWithMemberships | null;
  family?: FamilyWithChildren | null;
  defaultStartDate?: string | null;
  readOnly?: boolean;
  onAddMembership: (
    parentId: string,
    startDate: string,
    endDate: string | null,
    membershipType: 'full_member' | 'supporting_member'
  ) => Promise<void>;
  onUpdateMembership?: (
    membershipId: string,
    fields: {
      start_date?: string;
      end_date?: string | null;
      membership_type?: 'full_member' | 'supporting_member';
    }
  ) => Promise<void>;
  onDeleteMembership: (membershipId: string) => Promise<void>;
}

const checkMembershipOverlap = (
  s1: string,
  e1: string | null | undefined,
  s2: string,
  e2: string | null | undefined
): boolean => {
  const end1 = e1 && e1.trim() !== '' ? e1.trim() : null;
  const end2 = e2 && e2.trim() !== '' ? e2.trim() : null;
  return (!end1 || end1 >= s2) && (!end2 || end2 >= s1);
};

export const MembershipsModal: React.FC<MembershipsModalProps> = ({
  isOpen,
  onClose,
  anchorEl = null,
  parent,
  family,
  defaultStartDate,
  readOnly = false,
  onAddMembership,
  onUpdateMembership,
  onDeleteMembership,
}) => {
  // Sort memberships chronologically (oldest at top, most recent at bottom)
  const sortedMemberships = React.useMemo(() => {
    return [...(parent?.memberships || [])].sort(
      (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );
  }, [parent?.memberships]);

  // Determine if the most recent membership has no end date
  const mostRecentMembership = sortedMemberships.length > 0
    ? sortedMemberships[sortedMemberships.length - 1]
    : null;

  const isMostRecentMissingEndDate = Boolean(
    mostRecentMembership && (!mostRecentMembership.end_date || mostRecentMembership.end_date.trim() === '')
  );

  const isInitiallyEmpty = sortedMemberships.length === 0;

  const getOldestGroupChangeDate = (): string | null => {
    if (defaultStartDate) return defaultStartDate;
    if (!family?.children || family.children.length === 0) return null;
    const allDates: string[] = [];
    for (const child of family.children) {
      for (const gc of child.group_changes || []) {
        if (gc && gc.change_date) {
          const datePart = gc.change_date.split('T')[0].trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            allDates.push(datePart);
          }
        }
      }
    }
    if (allDates.length === 0) return null;
    allDates.sort();
    return allDates[0];
  };

  const getInitialNewStartDate = (): string => {
    if (mostRecentMembership?.end_date) {
      const datePart = mostRecentMembership.end_date.split('T')[0];
      const parts = datePart.split('-').map(Number);
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const nextDay = new Date(parts[0], parts[1] - 1, parts[2] + 1);
        return CURRENT_LOCALE === 'de' ? formatDisplayDate(nextDay) : nextDay.toISOString().split('T')[0];
      }
    }
    const oldestGcDate = getOldestGroupChangeDate();
    if (oldestGcDate) {
      return formatDisplayDate(oldestGcDate);
    }
    const today = new Date();
    return CURRENT_LOCALE === 'de' ? formatDisplayDate(today) : today.toISOString().split('T')[0];
  };

  const [isAddingRow, setIsAddingRow] = useState(!readOnly && isInitiallyEmpty);
  const [newMembershipType, setNewMembershipType] = useState<'full_member' | 'supporting_member'>('full_member');
  const [newStartDate, setNewStartDate] = useState<string>(getInitialNewStartDate);
  const [newEndDate, setNewEndDate] = useState<string>('');
  const [isStartCalendarOpen, setIsStartCalendarOpen] = useState(!readOnly && isInitiallyEmpty);
  const [isEndCalendarOpen, setIsEndCalendarOpen] = useState(false);

  const startDateInputRef = useRef<HTMLInputElement>(null);
  const startDateContainerRef = useRef<HTMLDivElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const endDateContainerRef = useRef<HTMLDivElement>(null);

  // Focus start date input when adding row
  useEffect(() => {
    if (isOpen && isAddingRow) {
      const timer = setTimeout(() => {
        if (startDateInputRef.current) {
          startDateInputRef.current.focus();
          startDateInputRef.current.select();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isAddingRow]);

  const handleClose = React.useCallback(() => {
    setIsAddingRow(false);
    setIsStartCalendarOpen(false);
    setIsEndCalendarOpen(false);
    setNewEndDate('');
    onClose();
  }, [onClose]);



  const handleStartAdd = () => {
    if (isMostRecentMissingEndDate) return;
    setNewStartDate(getInitialNewStartDate());
    setNewEndDate('');
    setNewMembershipType('full_member');
    setIsAddingRow(true);
    setIsStartCalendarOpen(true);
  };

  const handleCancelAdd = () => {
    setIsAddingRow(false);
    setIsStartCalendarOpen(false);
    setIsEndCalendarOpen(false);
  };

  const handleSaveNewRow = async () => {
    if (!parent || !newStartDate) return;
    const parsedStartDate = parseInputDate(newStartDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedStartDate)) {
      alert(t('invalidDateFormat'));
      return;
    }

    let parsedEndDate: string | null = null;
    if (newEndDate.trim()) {
      parsedEndDate = parseInputDate(newEndDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedEndDate)) {
        alert(t('invalidDateFormat'));
        return;
      }
      if (parsedEndDate <= parsedStartDate) {
        alert(t('endDateMustBeAfterStartDate'));
        return;
      }
    }

    // Check overlap with any existing membership
    for (const existing of sortedMemberships) {
      const existingStart = existing.start_date.split('T')[0];
      const existingEnd = existing.end_date ? existing.end_date.split('T')[0] : null;
      if (checkMembershipOverlap(parsedStartDate, parsedEndDate, existingStart, existingEnd)) {
        alert(t('membershipsCannotOverlap'));
        return;
      }
    }

    try {
      await onAddMembership(
        parent.id,
        `${parsedStartDate}T00:00:00Z`,
        parsedEndDate ? `${parsedEndDate}T00:00:00Z` : null,
        newMembershipType
      );
      setIsAddingRow(false);
      setIsStartCalendarOpen(false);
      setIsEndCalendarOpen(false);
      setNewEndDate('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save membership';
      alert(message);
    }
  };

  const handleSaveType = async (m: THMembership, newType: 'full_member' | 'supporting_member') => {
    try {
      if (onUpdateMembership) {
        await onUpdateMembership(m.id, { membership_type: newType });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update membership type';
      alert(message);
    }
  };

  const handleSaveStartDate = async (m: THMembership, newStartDateIso: string) => {
    const currentEnd = m.end_date ? m.end_date.split('T')[0] : null;
    if (currentEnd && currentEnd <= newStartDateIso) {
      alert(t('endDateMustBeAfterStartDate'));
      return;
    }

    // Check overlap with other memberships
    for (const other of sortedMemberships) {
      if (other.id === m.id) continue;
      const otherStart = other.start_date.split('T')[0];
      const otherEnd = other.end_date ? other.end_date.split('T')[0] : null;
      if (checkMembershipOverlap(newStartDateIso, currentEnd, otherStart, otherEnd)) {
        alert(t('membershipsCannotOverlap'));
        return;
      }
    }

    try {
      if (onUpdateMembership) {
        await onUpdateMembership(m.id, { start_date: `${newStartDateIso}T00:00:00Z` });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update start date';
      alert(message);
    }
  };

  const handleSaveEndDate = async (m: THMembership, newEndDateIso: string | null) => {
    const currentStart = m.start_date.split('T')[0];
    if (newEndDateIso && newEndDateIso <= currentStart) {
      alert(t('endDateMustBeAfterStartDate'));
      return;
    }

    // Check overlap with other memberships
    for (const other of sortedMemberships) {
      if (other.id === m.id) continue;
      const otherStart = other.start_date.split('T')[0];
      const otherEnd = other.end_date ? other.end_date.split('T')[0] : null;
      if (checkMembershipOverlap(currentStart, newEndDateIso, otherStart, otherEnd)) {
        alert(t('membershipsCannotOverlap'));
        return;
      }
    }

    try {
      if (onUpdateMembership) {
        await onUpdateMembership(m.id, {
          end_date: newEndDateIso ? `${newEndDateIso}T00:00:00Z` : null,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update end date';
      alert(message);
    }
  };

  const handleDelete = async (membershipId: string) => {
    if (!window.confirm(t('membershipDeleteConfirm'))) return;
    try {
      await onDeleteMembership(membershipId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete membership';
      alert(message);
    }
  };

  if (!isOpen || !parent) return null;

  return (
    <CellPopover
      isOpen={isOpen}
      onClose={handleClose}
      anchorEl={anchorEl}
      className="glass-popup memberships-popover"
      width={500}
      minWidth={460}
      style={{
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Existing Memberships Table */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: '6px',
        }}
      >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left', width: '130px' }}>{t('membershipType')}</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', width: '150px' }}>{t('startDateLabel')}</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', width: '150px' }}>{t('endDateLabel')}</th>
                {!readOnly && <th style={{ padding: '6px 8px', width: '36px', textAlign: 'center' }}></th>}
              </tr>
            </thead>
            <tbody>
              {sortedMemberships.map((m) => {
                const initialStartDate = m.start_date ? m.start_date.split('T')[0] : '';
                const startDateDisplayValue = CURRENT_LOCALE === 'de' ? formatDisplayDate(initialStartDate) : initialStartDate;

                const initialEndDate = m.end_date ? m.end_date.split('T')[0] : '';
                const endDateDisplayValue = initialEndDate ? (CURRENT_LOCALE === 'de' ? formatDisplayDate(initialEndDate) : initialEndDate) : '';

                if (readOnly) {
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ fontWeight: 600 }}>
                          {m.membership_type === 'full_member' ? t('full_member') : t('supporting_member')}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span>{formatDisplayDate(m.start_date)}</span>
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span>{m.end_date ? formatDisplayDate(m.end_date) : '-'}</span>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    {/* Membership Type Inline Edit */}
                    <td style={{ padding: '6px 8px' }}>
                      <EasyEditComponent
                        type={EasyEditTypes.SELECT}
                        value={m.membership_type}
                        options={[
                          { label: t('full_member'), value: 'full_member' },
                          { label: t('supporting_member'), value: 'supporting_member' },
                        ]}
                        onSave={(val: string) => {
                          handleSaveType(m, val as 'full_member' | 'supporting_member');
                        }}
                        editButtonLabel={<Pencil size={13} />}
                        instructions={t('membershipType')}
                        displayComponent={
                          <span style={{ fontWeight: 600 }}>
                            {m.membership_type === 'full_member' ? t('full_member') : t('supporting_member')}
                          </span>
                        }
                        viewAttributes={{}}
                        inputAttributes={{}}
                        onCancel={() => {}}
                        onValidate={() => true}
                      />
                    </td>

                    {/* Start Date Inline Edit */}
                    <td style={{ padding: '6px 8px' }}>
                      <EasyEditComponent
                        type={EasyEditTypes.DATE}
                        value={startDateDisplayValue}
                        onSave={(val: string) => {
                          const isoDate = parseInputDate(val);
                          if (isoDate) {
                            handleSaveStartDate(m, isoDate);
                          }
                        }}
                        editButtonLabel={<Pencil size={13} />}
                        instructions={t('startDateLabel')}
                        displayComponent={<span>{formatDisplayDate(m.start_date)}</span>}
                        viewAttributes={{}}
                        inputAttributes={{}}
                        onCancel={() => {}}
                        onValidate={(val: string) => {
                          const parsed = parseInputDate(val);
                          return /^\d{4}-\d{2}-\d{2}$/.test(parsed);
                        }}
                      />
                    </td>

                    {/* End Date Inline Edit */}
                    <td style={{ padding: '6px 8px' }}>
                      <EasyEditComponent
                        type={EasyEditTypes.DATE}
                        value={endDateDisplayValue}
                        placeholder="-"
                        onSave={(val: string) => {
                          if (!val || !val.trim() || val.trim() === '-') {
                            handleSaveEndDate(m, null);
                          } else {
                            const isoDate = parseInputDate(val);
                            if (isoDate) {
                              handleSaveEndDate(m, isoDate);
                            }
                          }
                        }}
                        editButtonLabel={<Pencil size={13} />}
                        instructions={t('endDateLabel')}
                        displayComponent={<span>{m.end_date ? formatDisplayDate(m.end_date) : '-'}</span>}
                        viewAttributes={{}}
                        inputAttributes={{}}
                        onCancel={() => {}}
                        onValidate={(val: string) => {
                          if (!val || !val.trim() || val.trim() === '-') return true;
                          const parsed = parseInputDate(val);
                          return /^\d{4}-\d{2}-\d{2}$/.test(parsed);
                        }}
                      />
                    </td>

                    {/* Delete Action */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleDelete(m.id)}
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
                    borderTop: sortedMemberships.length > 0 ? '1px dashed var(--primary)' : 'none',
                  }}
                >
                  {/* Membership Type Select */}
                  <td style={{ padding: '6px 8px' }}>
                    <select
                      value={newMembershipType}
                      onChange={(e) => setNewMembershipType(e.target.value as 'full_member' | 'supporting_member')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveNewRow();
                        if (e.key === 'Escape') {
                          e.stopPropagation();
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
                      <option value="full_member">{t('full_member')}</option>
                      <option value="supporting_member">{t('supporting_member')}</option>
                    </select>
                  </td>

                  {/* Start Date Input */}
                  <td style={{ padding: '6px 8px' }}>
                    <div
                      ref={startDateContainerRef}
                      style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}
                    >
                      <input
                        ref={startDateInputRef}
                        type="text"
                        value={newStartDate}
                        onChange={(e) => setNewStartDate(e.target.value)}
                        onFocus={() => setIsStartCalendarOpen(true)}
                        onClick={() => setIsStartCalendarOpen(true)}
                        placeholder={CURRENT_LOCALE === 'de' ? 'TT.MM.JJJJ' : 'YYYY-MM-DD'}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setIsStartCalendarOpen(false);
                            handleSaveNewRow();
                          }
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            if (isStartCalendarOpen) {
                              setIsStartCalendarOpen(false);
                            } else {
                              handleCancelAdd();
                            }
                          }
                          if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) {
                            e.preventDefault();
                            setIsStartCalendarOpen((prev) => !prev);
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
                          color: isStartCalendarOpen ? 'var(--primary)' : '#64748b',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsStartCalendarOpen((prev) => !prev);
                        }}
                        title={t('date')}
                      >
                        <Calendar size={15} />
                      </button>
                      <CalendarDropdown
                        anchorRef={startDateContainerRef}
                        isOpen={isStartCalendarOpen}
                        onClose={() => setIsStartCalendarOpen(false)}
                        selectedDateStr={newStartDate}
                        onSelectDate={(formatted) => {
                          setNewStartDate(formatted);
                          setIsStartCalendarOpen(false);
                        }}
                      />
                    </div>
                  </td>

                  {/* End Date Input */}
                  <td style={{ padding: '6px 8px' }}>
                    <div
                      ref={endDateContainerRef}
                      style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}
                    >
                      <input
                        ref={endDateInputRef}
                        type="text"
                        value={newEndDate}
                        onChange={(e) => setNewEndDate(e.target.value)}
                        onFocus={() => setIsEndCalendarOpen(true)}
                        onClick={() => setIsEndCalendarOpen(true)}
                        placeholder={CURRENT_LOCALE === 'de' ? 'TT.MM.JJJJ (optional)' : 'YYYY-MM-DD (optional)'}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setIsEndCalendarOpen(false);
                            handleSaveNewRow();
                          }
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            if (isEndCalendarOpen) {
                              setIsEndCalendarOpen(false);
                            } else {
                              handleCancelAdd();
                            }
                          }
                          if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) {
                            e.preventDefault();
                            setIsEndCalendarOpen((prev) => !prev);
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
                          color: isEndCalendarOpen ? 'var(--primary)' : '#64748b',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEndCalendarOpen((prev) => !prev);
                        }}
                        title={t('date')}
                      >
                        <Calendar size={15} />
                      </button>
                      <CalendarDropdown
                        anchorRef={endDateContainerRef}
                        isOpen={isEndCalendarOpen}
                        onClose={() => setIsEndCalendarOpen(false)}
                        selectedDateStr={newEndDate}
                        onSelectDate={(formatted) => {
                          setNewEndDate(formatted);
                          setIsEndCalendarOpen(false);
                        }}
                      />
                    </div>
                  </td>

                  {/* Actions: Check / Cancel */}
                  <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={handleSaveNewRow}
                        title={t('save')}
                        style={{
                          background: 'var(--primary)',
                          color: 'var(--primary-contrast, #fff)',
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

              {/* No items recorded placeholder */}
              {!isAddingRow && sortedMemberships.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: '1rem',
                      textAlign: 'center',
                      color: '#94a3b8',
                      fontStyle: 'italic',
                    }}
                  >
                    {t('noMembershipsRecorded')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Centered neutral '+' button under the existing rows */}
        {!isAddingRow && !readOnly && (
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
              disabled={isMostRecentMissingEndDate}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px 16px',
                fontSize: '0.85rem',
                fontWeight: 500,
                background: 'var(--bg-subtle)',
                color: isMostRecentMissingEndDate ? 'var(--text-muted)' : 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: isMostRecentMissingEndDate ? 'not-allowed' : 'pointer',
                opacity: isMostRecentMissingEndDate ? 0.5 : 1,
                transition: 'background-color 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isMostRecentMissingEndDate) {
                  e.currentTarget.style.backgroundColor = 'var(--border)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isMostRecentMissingEndDate) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
                }
              }}
              title={
                isMostRecentMissingEndDate
                  ? t('cannotAddMembershipOngoing')
                  : t('addMembership')
              }
            >
              <Plus size={16} />
            </button>
          </div>
        )}

    </CellPopover>
  );
};

export const MembershipsPopover = MembershipsModal;
export default MembershipsModal;
