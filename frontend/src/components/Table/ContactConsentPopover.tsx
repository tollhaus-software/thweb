import React, { useState, useEffect, useRef } from 'react';
import { Plus, Check, X, Trash, Pencil, Calendar } from 'lucide-react';
import { CellPopover } from './CellPopover';
import { t, CURRENT_LOCALE, formatDisplayDate, parseInputDate } from '../../utils/i18n';
import EasyEdit, { Types } from '../InlineEdit';
import { CalendarDropdown } from '../CalendarDropdown';

const EasyEditComponent = EasyEdit;
const EasyEditTypes = Types;

export interface ContactConsentItem {
  id: string;
  parent_id: string;
  consent_type: string;
  status: 'granted' | 'revoked';
  granted_at: string;
  revoked_at?: string | null;
  channel: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface ContactConsentPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  parent: {
    id: string;
    first_name: string;
    last_name: string;
    contact_consents?: ContactConsentItem[];
  } | null;
  onSave: (payload: {
    parentId: string;
    consentId?: string;
    consentType: string;
    status: 'granted' | 'revoked';
    grantedAt: string;
    channel: string;
    notes: string;
  }) => Promise<void>;
  onDelete?: (consentId: string) => Promise<void>;
  readOnly?: boolean;
}

export const ContactConsentPopover: React.FC<ContactConsentPopoverProps> = ({
  isOpen,
  onClose,
  anchorEl,
  parent,
  onSave,
  onDelete,
  readOnly = false,
}) => {
  // Sort consents chronologically (oldest at top, newest/current at bottom)
  const sortedConsents = React.useMemo(() => {
    return [...(parent?.contact_consents || [])].sort((a, b) => {
      const timeA = new Date(a.granted_at).getTime();
      const timeB = new Date(b.granted_at).getTime();
      if (timeA !== timeB) return timeA - timeB;
      const crA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const crB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return crA - crB;
    });
  }, [parent?.contact_consents]);

  const isInitiallyEmpty = sortedConsents.length === 0;

  const getInitialDateStr = (): string => {
    const today = new Date();
    return CURRENT_LOCALE === 'de' ? formatDisplayDate(today) : today.toISOString().split('T')[0];
  };

  const [isAddingRow, setIsAddingRow] = useState(!readOnly && isInitiallyEmpty);
  const [newStatus, setNewStatus] = useState<'granted' | 'revoked'>('granted');
  const [newDate, setNewDate] = useState<string>(getInitialDateStr);
  const [newChannel, setNewChannel] = useState<string>('email');
  const [newNotes, setNewNotes] = useState<string>('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateContainerRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsAddingRow(!readOnly && isInitiallyEmpty);
      setNewStatus('granted');
      setNewDate(getInitialDateStr());
      setNewChannel('email');
      setNewNotes('');
      setIsCalendarOpen(false);
    }
  }, [isOpen, isInitiallyEmpty, readOnly]);

  const handleStartAdd = () => {
    setNewStatus('granted');
    setNewDate(getInitialDateStr());
    setNewChannel('email');
    setNewNotes('');
    setIsAddingRow(true);
    setIsCalendarOpen(false);
  };

  const handleCancelAdd = () => {
    setIsAddingRow(false);
    setIsCalendarOpen(false);
    setError(null);
  };

  const handleSaveNewRow = async () => {
    if (!parent) return;
    const isoDate = parseInputDate(newDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      alert(t('invalidDateFormat') || 'Ungültiges Datumsformat');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        parentId: parent.id,
        consentType: 'alumni_contact',
        status: newStatus,
        grantedAt: isoDate,
        channel: newChannel.trim() || 'email',
        notes: newNotes.trim(),
      });
      setIsAddingRow(false);
      setIsCalendarOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Speichern');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveField = async (
    item: ContactConsentItem,
    fields: Partial<{ status: 'granted' | 'revoked'; grantedAt: string; channel: string; notes: string }>
  ) => {
    if (!parent) return;
    setIsSaving(true);
    setError(null);
    try {
      const isoDate = fields.grantedAt
        ? parseInputDate(fields.grantedAt)
        : (item.granted_at ? item.granted_at.split('T')[0] : new Date().toISOString().slice(0, 10));

      await onSave({
        parentId: parent.id,
        consentId: item.id,
        consentType: item.consent_type || 'alumni_contact',
        status: fields.status ?? item.status,
        grantedAt: isoDate,
        channel: fields.channel !== undefined ? fields.channel.trim() : (item.channel || 'email'),
        notes: fields.notes !== undefined ? fields.notes.trim() : (item.notes || ''),
      });
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Aktualisieren');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!onDelete) return;
    if (!window.confirm(t('confirmDeleteConsent') || 'Möchten Sie diesen Eintrag wirklich löschen?')) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onDelete(id);
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Löschen');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !parent) return null;

  return (
    <CellPopover
      isOpen={isOpen}
      onClose={onClose}
      anchorEl={anchorEl}
      className="glass-popup contact-consent-popover"
      width={640}
      minWidth={520}
      style={{
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxHeight: '85vh',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
            {t('contactConsent')}
          </h3>
          <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {parent.first_name} {parent.last_name}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="icon-button"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
          title={t('close') || 'Schließen'}
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: '0.8rem', padding: '4px 8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>
          {error}
        </div>
      )}

      {/* Table of Consents */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: '6px',
          overflow: 'hidden',
          background: 'var(--bg-surface)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-subtle, rgba(0, 0, 0, 0.03))', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', width: '120px' }}>{t('consentStatus')}</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', width: '130px' }}>{t('consentDate')}</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', width: '100px' }}>{t('consentChannel')}</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('consentNotes')}</th>
              {!readOnly && <th style={{ padding: '6px 8px', width: '36px', textAlign: 'center' }}></th>}
            </tr>
          </thead>
          <tbody>
            {sortedConsents.map((item, idx) => {
              const isNewest = idx === sortedConsents.length - 1;
              const isGranted = item.status === 'granted';
              const displayDate = formatDisplayDate(item.granted_at);

              if (readOnly) {
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          color: isGranted ? '#15803d' : '#b91c1c',
                          background: isGranted ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        {isGranted ? <Check size={12} /> : <X size={12} />}
                        <span>{isGranted ? t('consentGranted') : t('consentRevoked')}</span>
                      </span>
                      {isNewest && (
                        <span style={{ marginLeft: '4px', fontSize: '0.7rem', padding: '1px 4px', borderRadius: '3px', background: 'var(--primary-subtle, rgba(0, 100, 200, 0.1))', color: 'var(--primary)', fontWeight: 600 }}>
                          {t('currentConsent') || 'Aktuell'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '6px 8px' }}>{displayDate}</td>
                    <td style={{ padding: '6px 8px' }}>{item.channel || 'email'}</td>
                    <td style={{ padding: '6px 8px' }}>{item.notes || '-'}</td>
                  </tr>
                );
              }

              return (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Status Inline Edit */}
                  <td style={{ padding: '6px 8px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <EasyEditComponent
                        type={EasyEditTypes.SELECT}
                        value={item.status}
                        options={[
                          { label: t('consentGranted'), value: 'granted' },
                          { label: t('consentRevoked'), value: 'revoked' },
                        ]}
                        onSave={(val: string) => {
                          handleSaveField(item, { status: val as 'granted' | 'revoked' });
                        }}
                        editButtonLabel={<Pencil size={13} />}
                        instructions={t('consentStatus')}
                        displayComponent={
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              color: isGranted ? '#15803d' : '#b91c1c',
                              background: isGranted ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                            }}
                          >
                            {isGranted ? <Check size={12} /> : <X size={12} />}
                            <span>{isGranted ? t('consentGranted') : t('consentRevoked')}</span>
                          </span>
                        }
                        viewAttributes={{}}
                        inputAttributes={{}}
                        onCancel={() => {}}
                        onValidate={() => true}
                      />
                      {isNewest && (
                        <span style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: '3px', background: 'var(--primary-subtle, rgba(0, 100, 200, 0.1))', color: 'var(--primary)', fontWeight: 600 }}>
                          {t('currentConsent') || 'Aktuell'}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Date Inline Edit */}
                  <td style={{ padding: '6px 8px' }}>
                    <EasyEditComponent
                      type={EasyEditTypes.DATE}
                      value={displayDate}
                      onSave={(val: string) => {
                        handleSaveField(item, { grantedAt: val });
                      }}
                      editButtonLabel={<Pencil size={13} />}
                      instructions={t('consentDate')}
                      displayComponent={<span>{displayDate}</span>}
                      viewAttributes={{}}
                      inputAttributes={{}}
                      onCancel={() => {}}
                      onValidate={(val: string) => {
                        const parsed = parseInputDate(val);
                        return /^\d{4}-\d{2}-\d{2}$/.test(parsed);
                      }}
                    />
                  </td>

                  {/* Channel Inline Edit */}
                  <td style={{ padding: '6px 8px' }}>
                    <EasyEditComponent
                      type={EasyEditTypes.TEXT}
                      value={item.channel || 'email'}
                      onSave={(val: string) => {
                        handleSaveField(item, { channel: val });
                      }}
                      editButtonLabel={<Pencil size={13} />}
                      instructions={t('consentChannel')}
                      displayComponent={<span>{item.channel || 'email'}</span>}
                      viewAttributes={{}}
                      inputAttributes={{}}
                      onCancel={() => {}}
                      onValidate={() => true}
                    />
                  </td>

                  {/* Notes Inline Edit */}
                  <td style={{ padding: '6px 8px' }}>
                    <EasyEditComponent
                      type={EasyEditTypes.TEXT}
                      value={item.notes || ''}
                      placeholder="-"
                      onSave={(val: string) => {
                        handleSaveField(item, { notes: val });
                      }}
                      editButtonLabel={<Pencil size={13} />}
                      instructions={t('consentNotes')}
                      displayComponent={<span>{item.notes || '-'}</span>}
                      viewAttributes={{}}
                      inputAttributes={{}}
                      onCancel={() => {}}
                      onValidate={() => true}
                    />
                  </td>

                  {/* Delete Action */}
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      disabled={isSaving}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--danger, #ef4444)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px',
                        borderRadius: '4px',
                      }}
                      title={t('delete') || 'Löschen'}
                    >
                      <Trash size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}

            {/* Empty editable row when adding */}
            {isAddingRow && (
              <tr
                style={{
                  background: 'var(--accent-bg, rgba(2, 132, 199, 0.06))',
                  borderTop: sortedConsents.length > 0 ? '1px dashed var(--primary)' : 'none',
                }}
              >
                {/* Status Select */}
                <td style={{ padding: '6px 8px' }}>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as 'granted' | 'revoked')}
                    style={{
                      padding: '3px 6px',
                      fontSize: '0.825rem',
                      border: '1px solid var(--input-border, var(--border))',
                      borderRadius: '4px',
                      background: 'var(--input-bg, var(--bg-surface))',
                      color: 'var(--text)',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="granted">{t('consentGranted')}</option>
                    <option value="revoked">{t('consentRevoked')}</option>
                  </select>
                </td>

                {/* Date Input with CalendarDropdown */}
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
                          e.stopPropagation();
                          if (isCalendarOpen) {
                            setIsCalendarOpen(false);
                          } else if (sortedConsents.length > 0) {
                            handleCancelAdd();
                          }
                        }
                      }}
                      style={{
                        padding: '3px 26px 3px 6px',
                        fontSize: '0.825rem',
                        border: '1px solid var(--input-border, var(--border))',
                        borderRadius: '4px',
                        background: 'var(--input-bg, var(--bg-surface))',
                        color: 'var(--text)',
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
                      title={t('date') || 'Datum'}
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

                {/* Channel Input */}
                <td style={{ padding: '6px 8px' }}>
                  <input
                    type="text"
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value)}
                    placeholder="email"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveNewRow();
                      if (e.key === 'Escape' && sortedConsents.length > 0) handleCancelAdd();
                    }}
                    style={{
                      padding: '3px 6px',
                      fontSize: '0.825rem',
                      border: '1px solid var(--input-border, var(--border))',
                      borderRadius: '4px',
                      background: 'var(--input-bg, var(--bg-surface))',
                      color: 'var(--text)',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </td>

                {/* Notes Input */}
                <td style={{ padding: '6px 8px' }}>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder={t('consentNotes') || 'Notizen'}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveNewRow();
                      if (e.key === 'Escape' && sortedConsents.length > 0) handleCancelAdd();
                    }}
                    style={{
                      padding: '3px 6px',
                      fontSize: '0.825rem',
                      border: '1px solid var(--input-border, var(--border))',
                      borderRadius: '4px',
                      background: 'var(--input-bg, var(--bg-surface))',
                      color: 'var(--text)',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  />
                </td>

                {/* Save / Cancel Action Buttons */}
                <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={handleSaveNewRow}
                      disabled={isSaving}
                      className="primary-button"
                      style={{
                        padding: '3px 8px',
                        fontSize: '0.8rem',
                        height: '26px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                      title={t('save') || 'Speichern'}
                    >
                      <Check size={14} />
                      <span>{isSaving ? '...' : (t('save') || 'Speichern')}</span>
                    </button>
                    {sortedConsents.length > 0 && (
                      <button
                        type="button"
                        onClick={handleCancelAdd}
                        disabled={isSaving}
                        className="secondary-button"
                        style={{
                          padding: '3px 6px',
                          fontSize: '0.8rem',
                          height: '26px',
                        }}
                        title={t('cancel') || 'Abbrechen'}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer / Add Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
        {!readOnly && !isAddingRow && (
          <button
            type="button"
            onClick={handleStartAdd}
            className="secondary-button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              fontSize: '0.825rem',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            <span>{t('addConsent') || 'Einwilligung hinzufügen'}</span>
          </button>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={onClose}
            className="secondary-button"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
          >
            {t('close') || 'Schließen'}
          </button>
        </div>
      </div>
    </CellPopover>
  );
};
