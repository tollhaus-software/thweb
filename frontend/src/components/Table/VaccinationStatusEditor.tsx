import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Plus, Trash, Pencil, Check, X, Calendar, Lock } from 'lucide-react';
import { t, CURRENT_LOCALE, formatDisplayDate, parseInputDate } from '../../utils/i18n';
import { CellPopover } from './CellPopover';
import { CalendarDropdown } from '../CalendarDropdown';
import { useIsMobile } from '../../hooks/useIsMobile';

export interface VaccinationCheck {
  vaccination_type: string;
  vaccination_status?: string;
  checked_by?: string;
  checked_on?: string;
  proof_seen?: string;
  entry_created_by?: string;
}

export interface VaccinationStatusPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  checks?: VaccinationCheck[];
  currentUserEmail?: string;
  onSave: (newChecks: VaccinationCheck[]) => void | Promise<void>;
  readOnly?: boolean;
  personType?: 'parent' | 'child';
}

export interface VaccinationStatusCellProps {
  id?: string;
  checks?: VaccinationCheck[];
  isActive?: boolean;
  onOpenManage: (anchor: HTMLElement | string) => void;
  isUnlocked?: boolean;
  onUnlock?: () => void;
  readOnly?: boolean;
}

const VACCINATION_STATUS_OPTIONS_BY_TYPE: Record<string, { label: string; value: string }[]> = {
  masern: [
    { label: 'Masern 1 Impfung', value: 'Masern 1 Impfung' },
    { label: 'Masern 2 Impfungen', value: 'Masern 2 Impfungen' },
    { label: 'Masern nicht benötigt (Geburtsdatum vor 1971)', value: 'Masern nicht benötigt (Geburtsdatum vor 1971)' },
  ],
};

const normalizeCheck = (check: VaccinationCheck): VaccinationCheck => {
  const rawType = (check.vaccination_type || '').trim();
  const rawTypeLower = rawType.toLowerCase();
  const vType = 'masern';
  let vStatus = check.vaccination_status || '';

  if (!vStatus) {
    if (
      rawType === 'Masern 1 Impfung' ||
      rawType === 'Masern 2 Impfungen' ||
      rawType === 'Masern nicht benötigt (Geburtsdatum vor 1971)'
    ) {
      vStatus = rawType;
    } else if (rawTypeLower === 'masern') {
      vStatus = 'Masern 2 Impfungen';
    } else {
      vStatus = rawType || 'Masern 2 Impfungen';
    }
  }

  return {
    ...check,
    vaccination_type: vType,
    vaccination_status: vStatus,
    checked_on: check.checked_on || new Date().toISOString().split('T')[0],
    checked_by: check.checked_by || '',
    entry_created_by: check.entry_created_by || '',
    proof_seen: check.proof_seen || 'Impfausweis',
  };
};

export const VaccinationStatusCell: React.FC<VaccinationStatusCellProps> = ({
  id,
  checks = [],
  isActive = false,
  onOpenManage,
  isUnlocked = true,
  onUnlock,
  readOnly = false,
}) => {
  const cellId = id || 'cell-vaccination';

  const latestCheck = React.useMemo(() => {
    if (!checks || checks.length === 0) return null;
    return checks.reduce((latest, current) => {
      if (!latest) return current;
      const latestTime = latest.checked_on ? new Date(latest.checked_on).getTime() : -Infinity;
      const currentTime = current.checked_on ? new Date(current.checked_on).getTime() : -Infinity;
      if (isNaN(latestTime) && isNaN(currentTime)) {
        return (current.checked_on || '') >= (latest.checked_on || '') ? current : latest;
      }
      if (isNaN(latestTime)) return current;
      if (isNaN(currentTime)) return latest;
      return currentTime >= latestTime ? current : latest;
    }, checks[0]);
  }, [checks]);

  const displayStatus = React.useMemo(() => {
    if (!latestCheck) return '';
    const normalized = normalizeCheck(latestCheck);
    return normalized.vaccination_status || normalized.vaccination_type;
  }, [latestCheck]);

  if (!isUnlocked) {
    return (
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        <div
          onClick={onUnlock}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.25rem 0.4rem',
            borderRadius: '4px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            transition: 'all 0.15s ease',
          }}
          title={t('vaccinationStatusHidden')}
        >
          <Lock size={14} />
        </div>
      </div>
    );
  }

  return (
    <div
      id={cellId}
      className="vaccination-cell-wrapper"
      onDoubleClick={(e) => {
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        const el = document.getElementById(cellId) || e.currentTarget;
        onOpenManage(el);
      }}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        gap: '0.25rem',
        minHeight: '28px',
        borderRadius: '4px',
        padding: '2px 4px',
        backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
        transition: 'background-color 0.15s ease-in-out',
        fontWeight: 'normal',
      }}
      title={readOnly ? t('vaccinationStatus') : t('manageVaccinationStatus')}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}
      >
        <ShieldCheck
          size={14}
          style={{
            color: checks && checks.length > 0 ? '#16a34a' : 'var(--text-muted)',
            flexShrink: 0,
          }}
        />
        {displayStatus ? (
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 500,
              color: 'var(--text-h)',
            }}
          >
            {displayStatus}
          </span>
        ) : (
          <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
            {t('noVaccinationStatus')}
          </span>
        )}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const el = document.getElementById(cellId) || e.currentTarget;
            onOpenManage(el);
          }}
          className="cell-edit-pencil-btn"
          title={t('manageVaccinationStatus')}
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
};

export const VaccinationStatusPopover: React.FC<VaccinationStatusPopoverProps> = ({
  isOpen,
  onClose,
  anchorEl,
  checks = [],
  currentUserEmail = '',
  onSave,
  readOnly = false,
  personType = 'parent',
}) => {
  const isMobile = useIsMobile();

  // Normalize checks directly from props
  const normalizedChecks = React.useMemo(() => {
    return (checks || []).map(normalizeCheck);
  }, [checks]);

  const getInitialNewDate = (): string => {
    const today = new Date();
    return CURRENT_LOCALE === 'de' ? formatDisplayDate(today) : today.toISOString().split('T')[0];
  };

  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [newDate, setNewDate] = useState<string>(getInitialNewDate);
  const [newCheckedBy, setNewCheckedBy] = useState<string>(currentUserEmail);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const statusSelectRef = useRef<HTMLSelectElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const dateContainerRef = useRef<HTMLDivElement>(null);

  // Focus status select when adding row
  useEffect(() => {
    if (isOpen && isAddingRow) {
      const timer = setTimeout(() => {
        if (statusSelectRef.current) {
          statusSelectRef.current.focus();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isAddingRow]);

  const handleStartAdd = () => {
    setNewStatus('');
    setNewDate(getInitialNewDate());
    setNewCheckedBy(currentUserEmail || '');
    setIsAddingRow(true);
    setIsCalendarOpen(false);
  };

  const handleCancelAdd = () => {
    setIsAddingRow(false);
    setIsCalendarOpen(false);
  };

  const handleSaveNewRow = async () => {
    if (!newStatus.trim()) return;
    const parsedDate = parseInputDate(newDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
      alert(t('invalidDateFormat'));
      return;
    }

    const newCheck: VaccinationCheck = {
      vaccination_type: 'masern',
      vaccination_status: newStatus.trim(),
      checked_on: parsedDate,
      checked_by: newCheckedBy.trim() || currentUserEmail || 'admin',
      entry_created_by: currentUserEmail || 'admin',
      proof_seen: 'Impfausweis',
    };

    try {
      await onSave([...normalizedChecks, newCheck]);
      setIsAddingRow(false);
      setIsCalendarOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save vaccination check';
      alert(message);
    }
  };

  const handleDeleteCheck = async (index: number) => {
    if (!window.confirm(t('vaccinationCheckDeleteConfirm'))) return;
    const updated = normalizedChecks.filter((_, idx) => idx !== index);
    try {
      await onSave(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete vaccination check';
      alert(message);
    }
  };

  const statusOptions = React.useMemo(() => {
    const all = VACCINATION_STATUS_OPTIONS_BY_TYPE['masern'] || [];
    if (personType === 'child') {
      return all.filter((opt) => opt.value !== 'Masern nicht benötigt (Geburtsdatum vor 1971)');
    }
    return all;
  }, [personType]);

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <CellPopover
        isOpen={isOpen}
        onClose={onClose}
        anchorEl={anchorEl}
        style={{
          padding: '12px 14px 20px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {/* Mobile Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={18} style={{ color: normalizedChecks.length > 0 ? '#16a34a' : 'var(--text-muted)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>
              {t('vaccinationStatus')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
            }}
            aria-label={t('cancel')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Existing Checks as Responsive Cards */}
        {normalizedChecks.length === 0 && !isAddingRow && (
          <div
            style={{
              padding: '1.25rem 0.5rem',
              textAlign: 'center',
              color: '#94a3b8',
              fontStyle: 'italic',
              fontSize: '0.875rem',
            }}
          >
            {t('noVaccinationChecksRecorded')}
          </div>
        )}

        {normalizedChecks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {normalizedChecks.map((item, idx) => {
              const currentStatus = item.vaccination_status || item.vaccination_type || 'Masern 2 Impfungen';
              const checkedBy = (item.checked_by || '').trim();
              const entryCreatedBy = (item.entry_created_by || '').trim();
              const showDifferentCreator = Boolean(
                entryCreatedBy &&
                checkedBy &&
                entryCreatedBy.toLowerCase() !== checkedBy.toLowerCase()
              );

              return (
                <div
                  key={idx}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    background: 'var(--bg-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)', wordBreak: 'break-word' }}>
                      {currentStatus}
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCheck(idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px',
                          borderRadius: '4px',
                          flexShrink: 0,
                        }}
                        title={t('delete')}
                        aria-label={t('delete')}
                      >
                        <Trash size={15} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={13} style={{ flexShrink: 0 }} />
                      <span>{formatDisplayDate(item.checked_on)}</span>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span>{t('checkedBy')}:</span>
                      <span style={{ color: 'var(--text)' }}>
                        {checkedBy || '-'}
                        {showDifferentCreator && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                            ({entryCreatedBy})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mobile Add Form */}
        {isAddingRow && (
          <div
            style={{
              border: '1px solid var(--primary)',
              borderRadius: '8px',
              padding: '12px',
              background: 'var(--accent-bg, rgba(2, 132, 199, 0.06))',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' }}>
              {t('addVaccinationCheck')}
            </div>

            {/* Status Select */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('vaccinationStatus')}
              </label>
              <select
                ref={statusSelectRef}
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                style={{
                  padding: '8px 10px',
                  fontSize: '0.875rem',
                  border: '1px solid var(--input-border)',
                  borderRadius: '6px',
                  background: 'var(--input-bg)',
                  color: newStatus ? 'var(--input-text)' : 'var(--text-muted)',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <option value="" disabled>
                  {t('pleaseSelect')}
                </option>
                {statusOptions.map((sOpt) => (
                  <option key={sOpt.value} value={sOpt.value} style={{ color: 'var(--input-text)' }}>
                    {sOpt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Input with Calendar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('date')}
              </label>
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
                  style={{
                    padding: '8px 36px 8px 10px',
                    fontSize: '0.875rem',
                    border: '1px solid var(--input-border)',
                    borderRadius: '6px',
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
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    color: isCalendarOpen ? 'var(--primary)' : '#64748b',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCalendarOpen((prev) => !prev);
                  }}
                  title={t('date')}
                >
                  <Calendar size={18} />
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
            </div>

            {/* Checked By Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('checkedBy')}
              </label>
              <input
                type="text"
                value={newCheckedBy}
                onChange={(e) => setNewCheckedBy(e.target.value)}
                placeholder="E-Mail"
                style={{
                  padding: '8px 10px',
                  fontSize: '0.875rem',
                  border: '1px solid var(--input-border)',
                  borderRadius: '6px',
                  background: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Actions: Save / Cancel */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={handleSaveNewRow}
                disabled={!newStatus.trim()}
                style={{
                  flex: 1,
                  padding: '8px 14px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  background: newStatus.trim() ? 'var(--primary)' : 'var(--border)',
                  color: newStatus.trim() ? 'var(--primary-contrast, #fff)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: newStatus.trim() ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Check size={16} />
                <span>{t('save')}</span>
              </button>
              <button
                type="button"
                onClick={handleCancelAdd}
                style={{
                  padding: '8px 14px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  background: 'transparent',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <X size={16} />
                <span>{t('cancel')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Mobile '+' Add Button */}
        {!readOnly && !isAddingRow && (
          <button
            type="button"
            onClick={handleStartAdd}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '8px 16px',
              fontSize: '0.875rem',
              fontWeight: 500,
              background: 'var(--bg-subtle)',
              color: 'var(--text)',
              border: '1px dashed var(--border-strong, #94a3b8)',
              borderRadius: '8px',
              cursor: 'pointer',
              marginTop: '4px',
            }}
            title={t('addVaccinationCheck')}
          >
            <Plus size={16} />
            <span>{t('addVaccinationCheck')}</span>
          </button>
        )}
      </CellPopover>
    );
  }

  return (
    <CellPopover
      isOpen={isOpen}
      onClose={onClose}
      anchorEl={anchorEl}
      width={readOnly ? 780 : 870}
      minWidth={readOnly ? 740 : 830}
      style={{
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Vaccination Checks Table */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: '6px',
          overflowX: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '310px' }} />
            <col style={{ width: '190px' }} />
            <col style={{ width: '220px' }} />
            {!readOnly && <col style={{ width: '80px' }} />}
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('vaccinationStatus')}</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('date')}</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('checkedBy')}</th>
              {!readOnly && <th style={{ padding: '6px 8px', textAlign: 'center' }}></th>}
            </tr>
          </thead>
          <tbody>
            {normalizedChecks.map((item, idx) => {
              const currentStatus = item.vaccination_status || item.vaccination_type || 'Masern 2 Impfungen';
              const checkedBy = (item.checked_by || '').trim();
              const entryCreatedBy = (item.entry_created_by || '').trim();
              const showDifferentCreator = Boolean(
                entryCreatedBy &&
                checkedBy &&
                entryCreatedBy.toLowerCase() !== checkedBy.toLowerCase()
              );

              return (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Vaccination Status (Non-editable) */}
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ fontWeight: 600 }}>{currentStatus}</span>
                  </td>

                  {/* Date (Non-editable) */}
                  <td style={{ padding: '6px 8px' }}>
                    <span>{formatDisplayDate(item.checked_on)}</span>
                  </td>

                  {/* Gecheckt durch (Non-editable view; shows "<checked_by>\n(<entry_created_by>)" if different) */}
                  <td style={{ padding: '6px 8px' }}>
                    {showDifferentCreator ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.3 }}>
                        <span>{checkedBy || '-'}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          ({entryCreatedBy})
                        </span>
                      </div>
                    ) : (
                      <span>{checkedBy || '-'}</span>
                    )}
                  </td>

                  {/* Delete Action */}
                  {!readOnly && (
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteCheck(idx)}
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
              );
            })}

            {/* Editable row at bottom when adding */}
            {isAddingRow && (
              <tr
                style={{
                  background: 'var(--accent-bg, rgba(2, 132, 199, 0.06))',
                  borderTop: normalizedChecks.length > 0 ? '1px dashed var(--primary)' : 'none',
                }}
              >
                {/* Status Select */}
                <td style={{ padding: '6px 8px' }}>
                  <select
                    ref={statusSelectRef}
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (newStatus.trim()) {
                          handleSaveNewRow();
                        }
                      }
                      if (e.key === 'Escape') handleCancelAdd();
                    }}
                    style={{
                      padding: '3px 6px',
                      fontSize: '0.825rem',
                      border: '1px solid var(--input-border)',
                      borderRadius: '4px',
                      background: 'var(--input-bg)',
                      color: newStatus ? 'var(--input-text)' : 'var(--text-muted)',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="" disabled>
                      {t('pleaseSelect')}
                    </option>
                    {statusOptions.map((sOpt) => (
                      <option key={sOpt.value} value={sOpt.value} style={{ color: 'var(--input-text)' }}>
                        {sOpt.label}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Date Input with Calendar */}
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
                        padding: '3px 28px 3px 6px',
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

                {/* Gecheckt durch (Editable text input) */}
                <td style={{ padding: '6px 8px' }}>
                  <input
                    type="text"
                    value={newCheckedBy}
                    onChange={(e) => setNewCheckedBy(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveNewRow();
                      if (e.key === 'Escape') handleCancelAdd();
                    }}
                    placeholder="E-Mail"
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
                  />
                </td>

                {/* Actions: Save / Cancel */}
                <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={handleSaveNewRow}
                      disabled={!newStatus.trim()}
                      title={t('save')}
                      style={{
                        background: newStatus.trim() ? 'var(--primary)' : 'var(--border)',
                        color: newStatus.trim() ? 'var(--primary-contrast, #fff)' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '3px 6px',
                        cursor: newStatus.trim() ? 'pointer' : 'not-allowed',
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
            {!isAddingRow && normalizedChecks.length === 0 && (
              <tr>
                <td
                  colSpan={readOnly ? 3 : 4}
                  style={{
                    padding: '1rem',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontStyle: 'italic',
                  }}
                >
                  {t('noVaccinationChecksRecorded')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Centered neutral '+' button under the existing rows */}
      {!readOnly && !isAddingRow && (
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
            title={t('addVaccinationCheck')}
          >
            <Plus size={16} />
          </button>
        </div>
      )}
    </CellPopover>
  );
};

export interface StandaloneVaccinationStatusEditorProps {
  checks?: VaccinationCheck[];
  currentUserEmail?: string;
  onSave: (newChecks: VaccinationCheck[]) => void;
  isUnlocked?: boolean;
  onUnlock?: () => void;
  readOnly?: boolean;
  personType?: 'parent' | 'child';
}

export const VaccinationStatusEditor: React.FC<StandaloneVaccinationStatusEditorProps> = ({
  checks = [],
  currentUserEmail = '',
  onSave,
  isUnlocked = true,
  onUnlock,
  readOnly = false,
  personType = 'parent',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={triggerRef} style={{ width: '100%' }}>
        <VaccinationStatusCell
          checks={checks}
          isActive={isOpen}
          onOpenManage={() => setIsOpen(true)}
          isUnlocked={isUnlocked}
          onUnlock={onUnlock}
          readOnly={readOnly}
        />
      </div>
      <VaccinationStatusPopover
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorEl={triggerRef}
        checks={checks}
        currentUserEmail={currentUserEmail}
        onSave={onSave}
        readOnly={readOnly}
        personType={personType}
      />
    </>
  );
};
