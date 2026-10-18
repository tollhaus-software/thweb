import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash, Check, X, Calendar, Pencil } from 'lucide-react';
import { t, CURRENT_LOCALE, formatDisplayDate, parseInputDate } from '../../utils/i18n';
import { CellPopover } from './CellPopover';
import { CalendarDropdown } from '../CalendarDropdown';
import EasyEdit, { Types } from '../InlineEdit';

const EasyEditComponent = EasyEdit;
const EasyEditTypes = Types;

export interface HygieneEvent {
  id: string;
  parent_id: string;
  event_date: string;
  event_type: 'initial' | 'recertify';
  documentation: string;
  created_at?: string;
  updated_at?: string;
}

export interface ParentWithHygiene {
  id: string;
  first_name: string;
  last_name: string;
  family_id?: string;
  events?: HygieneEvent[];
}

export interface HygieneEventsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | React.RefObject<HTMLElement | null> | string | (() => HTMLElement | null) | null;
  parent: ParentWithHygiene | null;
  onAddEvent: (parentId: string, eventDate: string, eventType: 'initial' | 'recertify', documentation: string) => Promise<void>;
  onUpdateEvent?: (eventId: string, updates: { event_date?: string; event_type?: 'initial' | 'recertify'; documentation?: string }) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
  readOnly?: boolean;
}

export interface HygieneCellProps {
  id?: string;
  parent: ParentWithHygiene;
  eventType: 'initial' | 'recertify';
  isActive: boolean;
  onOpenManage: (parent: ParentWithHygiene, anchor: HTMLElement | string) => void;
  readOnly?: boolean;
}

export const HygieneCell: React.FC<HygieneCellProps> = ({
  id,
  parent,
  eventType,
  isActive,
  onOpenManage,
  readOnly = false,
}) => {
  const cellId = id || `cell-hygiene-${eventType}-${parent.id}`;

  const event = React.useMemo(() => {
    const events = parent.events || [];
    if (eventType === 'initial') {
      return events.find((e) => e.event_type === 'initial');
    }
    const recertifyEvents = events.filter((e) => e.event_type === 'recertify');
    if (recertifyEvents.length === 0) return null;
    return recertifyEvents.reduce((latest, cur) => {
      if (!latest) return cur;
      return (cur.event_date || '') > (latest.event_date || '') ? cur : latest;
    }, recertifyEvents[0]);
  }, [parent.events, eventType]);

  const displayDate = event ? formatDisplayDate(event.event_date) : '';

  return (
    <div
      id={cellId}
      className="hygiene-cell-wrapper"
      onDoubleClick={(e) => {
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        const el = document.getElementById(cellId) || e.currentTarget;
        onOpenManage(parent, el);
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
      title={readOnly ? t('hygieneBelehrung') : t('manageEvents')}
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
        {displayDate ? (
          <span style={{ fontWeight: 500, color: 'var(--text-h)' }}>
            {displayDate}
          </span>
        ) : (
          <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
            -
          </span>
        )}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const el = document.getElementById(cellId) || e.currentTarget;
            onOpenManage(parent, el);
          }}
          className="cell-edit-pencil-btn"
          title={t('manageEvents')}
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
};

export const HygieneEventsPopover: React.FC<HygieneEventsPopoverProps> = ({
  isOpen,
  onClose,
  anchorEl,
  parent,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  readOnly = false,
}) => {
  const sortedEvents = React.useMemo(() => {
    return [...(parent?.events || [])].sort((a, b) =>
      (b.event_date || '').localeCompare(a.event_date || '')
    );
  }, [parent?.events]);

  const getInitialNewDate = (): string => {
    const today = new Date();
    return CURRENT_LOCALE === 'de' ? formatDisplayDate(today) : today.toISOString().split('T')[0];
  };

  const hasInitial = Boolean((parent?.events || []).some((e) => e.event_type === 'initial'));

  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newDate, setNewDate] = useState<string>(getInitialNewDate);
  const [newType, setNewType] = useState<'initial' | 'recertify'>(hasInitial ? 'recertify' : 'initial');
  const [newDocumentation, setNewDocumentation] = useState('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

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
    const parentHasInitial = Boolean((parent?.events || []).some((e) => e.event_type === 'initial'));
    setNewDate(getInitialNewDate());
    setNewType(parentHasInitial ? 'recertify' : 'initial');
    setNewDocumentation('');
    setIsAddingRow(true);
    setIsCalendarOpen(false);
  };

  const handleCancelAdd = () => {
    setIsAddingRow(false);
    setIsCalendarOpen(false);
  };

  const handleSaveNewRow = async () => {
    if (!parent || !newDate) return;
    const parsedDate = parseInputDate(newDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
      alert(t('invalidDateFormat'));
      return;
    }

    try {
      await onAddEvent(parent.id, `${parsedDate}T00:00:00Z`, newType, newDocumentation.trim());
      setIsAddingRow(false);
      setIsCalendarOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save event';
      alert(message);
    }
  };

  const handleSaveDate = async (ev: HygieneEvent, isoDate: string) => {
    try {
      if (onUpdateEvent) {
        await onUpdateEvent(ev.id, { event_date: isoDate });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update date';
      alert(message);
    }
  };

  const handleSaveType = async (ev: HygieneEvent, newTypeVal: 'initial' | 'recertify') => {
    try {
      if (onUpdateEvent) {
        await onUpdateEvent(ev.id, { event_type: newTypeVal });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update event type';
      alert(message);
    }
  };

  const handleSaveDocumentation = async (ev: HygieneEvent, newDoc: string) => {
    try {
      if (onUpdateEvent) {
        await onUpdateEvent(ev.id, { documentation: newDoc });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update documentation';
      alert(message);
    }
  };

  const handleDelete = async (eventId: string) => {
    try {
      await onDeleteEvent(eventId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete event';
      alert(message);
    }
  };

  if (!isOpen) return null;

  return (
    <CellPopover
      isOpen={isOpen}
      onClose={onClose}
      anchorEl={anchorEl}
      width={readOnly ? 620 : 690}
      minWidth={readOnly ? 580 : 650}
      style={{
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Hygiene Events Table */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: '6px',
          overflowX: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '180px' }} />
            <col style={{ width: '160px' }} />
            <col style={{ width: '250px' }} />
            {!readOnly && <col style={{ width: '70px' }} />}
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('date')}</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('eventType')}</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>{t('documentation')}</th>
              {!readOnly && <th style={{ padding: '6px 8px', textAlign: 'center' }}></th>}
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map((ev) => {
              const initialDate = ev.event_date ? ev.event_date.split('T')[0] : '';
              const dateDisplayValue = CURRENT_LOCALE === 'de' ? formatDisplayDate(initialDate) : initialDate;

              return (
                <tr key={ev.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Date */}
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {readOnly || !onUpdateEvent ? (
                      <span>{formatDisplayDate(ev.event_date)}</span>
                    ) : (
                      <EasyEditComponent
                        type={EasyEditTypes.DATE}
                        value={dateDisplayValue}
                        onSave={(val: string) => {
                          const isoDate = parseInputDate(val);
                          if (isoDate) {
                            handleSaveDate(ev, isoDate);
                          }
                        }}
                        editButtonLabel={<Pencil size={13} />}
                        instructions={t('date')}
                        displayComponent={<span>{formatDisplayDate(ev.event_date)}</span>}
                        viewAttributes={{}}
                        inputAttributes={{}}
                        onCancel={() => {}}
                        onValidate={(val: string) => {
                          const parsed = parseInputDate(val);
                          return /^\d{4}-\d{2}-\d{2}$/.test(parsed);
                        }}
                      />
                    )}
                  </td>

                  {/* Event Type */}
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {readOnly || !onUpdateEvent ? (
                      <span style={{ fontWeight: 600 }}>
                        {ev.event_type === 'initial' ? t('initialType') : t('recertifyType')}
                      </span>
                    ) : (
                      <EasyEditComponent
                        type={EasyEditTypes.SELECT}
                        value={ev.event_type}
                        options={[
                          { label: t('initialType'), value: 'initial' },
                          { label: t('recertifyType'), value: 'recertify' },
                        ]}
                        onSave={(val: string) => {
                          handleSaveType(ev, val as 'initial' | 'recertify');
                        }}
                        editButtonLabel={<Pencil size={13} />}
                        instructions={t('eventType')}
                        displayComponent={
                          <span style={{ fontWeight: 600 }}>
                            {ev.event_type === 'initial' ? t('initialType') : t('recertifyType')}
                          </span>
                        }
                        viewAttributes={{}}
                        inputAttributes={{}}
                        onCancel={() => {}}
                        onValidate={() => true}
                      />
                    )}
                  </td>

                  {/* Documentation */}
                  <td
                    style={{
                      padding: '6px 8px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={ev.documentation || undefined}
                  >
                    {readOnly || !onUpdateEvent ? (
                      <span>{ev.documentation || '-'}</span>
                    ) : (
                      <EasyEditComponent
                        type={EasyEditTypes.TEXT}
                        value={ev.documentation || ''}
                        placeholder="-"
                        onSave={(val: string) => {
                          handleSaveDocumentation(ev, val);
                        }}
                        editButtonLabel={<Pencil size={13} />}
                        instructions={t('documentation')}
                        displayComponent={<span>{ev.documentation || '-'}</span>}
                        viewAttributes={{}}
                        inputAttributes={{}}
                        onCancel={() => {}}
                        onValidate={() => true}
                      />
                    )}
                  </td>

                  {/* Actions */}
                  {!readOnly && (
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleDelete(ev.id)}
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

            {/* Editable row when adding */}
            {isAddingRow && (
              <tr
                style={{
                  background: 'var(--accent-bg, rgba(2, 132, 199, 0.06))',
                  borderTop: sortedEvents.length > 0 ? '1px dashed var(--primary)' : 'none',
                }}
              >
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

                {/* Event Type Select */}
                <td style={{ padding: '6px 8px' }}>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as 'initial' | 'recertify')}
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
                    <option value="initial">{t('initialType')}</option>
                    <option value="recertify">{t('recertifyType')}</option>
                  </select>
                </td>

                {/* Documentation (single line string) */}
                <td style={{ padding: '6px 8px' }}>
                  <input
                    type="text"
                    value={newDocumentation}
                    onChange={(e) => setNewDocumentation(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveNewRow();
                      if (e.key === 'Escape') handleCancelAdd();
                    }}
                    placeholder={t('documentation')}
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

            {/* Empty state */}
            {!isAddingRow && sortedEvents.length === 0 && (
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
                  {t('noEventsRecorded')}
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
            title={t('addEvent')}
          >
            <Plus size={16} />
          </button>
        </div>
      )}
    </CellPopover>
  );
};
