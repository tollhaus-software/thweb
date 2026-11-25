import React, { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, Calendar, Trash2, Clock, CalendarRange } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { t, CURRENT_LOCALE, formatDisplayDate, parseInputDate } from '../../utils/i18n';
import { formatDateKey, parseDateKey } from '../../utils/mealPlan';
import {
  type CalendarEvent,
  type CalendarEventType,
  EVENT_TYPE_LIST,
  doesEventExpectSpecificTime,
  isCalendarEventEditable,
  getEventTypeMeta,
  getEventTypeLabel,
  getCalendarEventDisplayTitle,
  formatEventTimeRange,
  formatEventDateRange,
} from '../../utils/calendarEvents';

export interface EventFormModalProps {
  isOpen: boolean;
  initialDate?: string;
  editingEvent?: CalendarEvent | null;
  canWrite?: boolean;
  anchorEl?: HTMLElement | null;
  onClose: () => void;
  onSaved: (saved: CalendarEvent) => void;
  onDeleted?: (deletedId: string) => void;
}

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidIsoDateStr(s: string): boolean {
  if (!DATE_ISO_RE.test(s)) return false;
  const d = parseDateKey(s);
  return !isNaN(d.getTime()) && formatDateKey(d) === s;
}

function toDisplayDateInput(isoOrInput: string): string {
  const trimmed = isoOrInput.trim();
  if (!trimmed) return '';
  if (DATE_ISO_RE.test(trimmed)) {
    return formatDisplayDate(trimmed);
  }
  return trimmed;
}

function toIsoDateStr(inputVal: string): string {
  const trimmed = inputVal.trim();
  if (!trimmed) return '';
  if (DATE_ISO_RE.test(trimmed)) return trimmed;
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    const day = parts[0].trim().padStart(2, '0');
    const month = parts[1].trim().padStart(2, '0');
    const year = parts[2].trim();
    if (year.length === 4) {
      return `${year}-${month}-${day}`;
    }
  }
  return parseInputDate(trimmed);
}

interface InitialFormSnapshot {
  eventType: CalendarEventType;
  isAllDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  title: string;
  description: string;
}

export const EventFormModal: React.FC<EventFormModalProps> = ({
  isOpen,
  initialDate,
  editingEvent,
  canWrite = true,
  onClose,
  onSaved,
  onDeleted,
}) => {
  const { token } = useAuth();
  const startPickerRef = useRef<HTMLInputElement>(null);
  const endPickerRef = useRef<HTMLInputElement>(null);

  const [eventType, setEventType] = useState<CalendarEventType>('ea_gesamt');
  const [isAllDay, setIsAllDay] = useState<boolean>(true);
  const [startDateInput, setStartDateInput] = useState<string>('');
  const [endDateInput, setEndDateInput] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('19:30');
  const [endTime, setEndTime] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [confirmingDelete, setConfirmingDelete] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [initialSnapshot, setInitialSnapshot] = useState<InitialFormSnapshot | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setConfirmingDelete(false);
    setDeleting(false);
    if (editingEvent) {
      const hasStartTime = Boolean(editingEvent.start_time && editingEvent.start_time.trim() !== '');
      const initAllDay = !hasStartTime;
      const initStart = editingEvent.start_date;
      const initEnd = editingEvent.end_date || editingEvent.start_date;
      const initStartTime = editingEvent.start_time || '19:30';
      const initEndTime = editingEvent.end_time || '';
      const initTitle = editingEvent.title || '';
      const initDesc = editingEvent.description || '';

      setEventType(editingEvent.event_type);
      setIsAllDay(initAllDay);
      setStartDateInput(toDisplayDateInput(initStart));
      setEndDateInput(toDisplayDateInput(initEnd));
      setStartTime(initStartTime);
      setEndTime(initEndTime);
      setTitle(initTitle);
      setDescription(initDesc);
      setInitialSnapshot({
        eventType: editingEvent.event_type,
        isAllDay: initAllDay,
        startDate: initStart,
        endDate: initEnd,
        startTime: initStartTime,
        endTime: initEndTime,
        title: initTitle,
        description: initDesc,
      });
    } else {
      const todayIso = new Date().toISOString().slice(0, 10);
      const baseDate = initialDate || todayIso;
      setEventType('ea_gesamt');
      setIsAllDay(true);
      setStartDateInput(toDisplayDateInput(baseDate));
      setEndDateInput(toDisplayDateInput(baseDate));
      setStartTime('19:30');
      setEndTime('');
      setTitle('');
      setDescription('');
      setInitialSnapshot({
        eventType: 'ea_gesamt',
        isAllDay: true,
        startDate: baseDate,
        endDate: baseDate,
        startTime: '19:30',
        endTime: '',
        title: '',
        description: '',
      });
    }
  }, [isOpen, initialDate, editingEvent]);

  if (!isOpen) return null;

  const isViewerOnly = !canWrite || !isCalendarEventEditable(editingEvent);
  const closingTypes = EVENT_TYPE_LIST.filter((m) => m.group === 'closing');
  const eaTypes = EVENT_TYPE_LIST.filter((m) => m.group === 'ea');
  const communityTypes = EVENT_TYPE_LIST.filter((m) => m.group === 'community');
  const customTypes = EVENT_TYPE_LIST.filter((m) => m.group === 'custom');

  const getOptionLabel = (m: (typeof EVENT_TYPE_LIST)[number]) =>
    CURRENT_LOCALE === 'en' ? m.labelEn : m.labelDe;

  const expectsSpecificTime = doesEventExpectSpecificTime(eventType);
  const startDateIso = toIsoDateStr(startDateInput);
  const endDateIso = toIsoDateStr(endDateInput);

  const isDirty = (() => {
    if (isViewerOnly || !initialSnapshot) return false;
    const curEndIso = isAllDay && !expectsSpecificTime ? endDateIso || startDateIso : startDateIso;
    const initEndIso =
      initialSnapshot.isAllDay && !doesEventExpectSpecificTime(initialSnapshot.eventType)
        ? initialSnapshot.endDate
        : initialSnapshot.startDate;
    return (
      eventType !== initialSnapshot.eventType ||
      isAllDay !== initialSnapshot.isAllDay ||
      startDateIso !== initialSnapshot.startDate ||
      curEndIso !== initEndIso ||
      (!isAllDay && startTime.trim() !== initialSnapshot.startTime.trim()) ||
      (!isAllDay && endTime.trim() !== initialSnapshot.endTime.trim()) ||
      title !== initialSnapshot.title ||
      description !== initialSnapshot.description
    );
  })();

  const handleRequestClose = () => {
    if (saving || deleting) return;
    if (isDirty) {
      const confirmMsg =
        t('eventsDiscardChangesConfirm') ||
        'Sie haben ungespeicherte Änderungen. Möchten Sie das Formular wirklich schließen?';
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }
    onClose();
  };

  const handleEventTypeChange = (nextType: CalendarEventType) => {
    setEventType(nextType);
    if (doesEventExpectSpecificTime(nextType)) {
      setEndDateInput(startDateInput);
    }
  };

  const handleStartDateInputChange = (rawVal: string) => {
    const nextDisplay = DATE_ISO_RE.test(rawVal.trim()) ? toDisplayDateInput(rawVal) : rawVal;
    setStartDateInput(nextDisplay);
    const nextIso = toIsoDateStr(nextDisplay);
    const curEndIso = toIsoDateStr(endDateInput);
    if (
      isValidIsoDateStr(nextIso) &&
      (!curEndIso || !isValidIsoDateStr(curEndIso) || curEndIso < nextIso || !isAllDay || expectsSpecificTime)
    ) {
      setEndDateInput(toDisplayDateInput(nextIso));
    }
  };

  const handleEndDateInputChange = (rawVal: string) => {
    const nextDisplay = DATE_ISO_RE.test(rawVal.trim()) ? toDisplayDateInput(rawVal) : rawVal;
    setEndDateInput(nextDisplay);
  };

  const formatTime24OnChange = (raw: string): string => {
    const cleaned = raw.replace(/[^0-9:]/g, '');
    if (/^\d{4}$/.test(cleaned)) {
      return `${cleaned.slice(0, 2)}:${cleaned.slice(2, 4)}`;
    }
    return cleaned.slice(0, 5);
  };

  const handleConfirmDelete = async () => {
    if (!editingEvent) return;
    setDeleting(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/events/${editingEvent.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      if (onDeleted) {
        onDeleted(editingEvent.id);
      } else {
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen');
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewerOnly) return;
    setError(null);

    const trimmedTitle = title.trim();
    if (eventType === 'custom' && !trimmedTitle) {
      setError(t('eventsTitleRequiredHint'));
      return;
    }
    if (!startDateIso || !isValidIsoDateStr(startDateIso)) {
      setError(t('eventsImportErrStartDate'));
      return;
    }
    const effectiveEndDate = isAllDay && !expectsSpecificTime ? endDateIso || startDateIso : startDateIso;
    if (!isValidIsoDateStr(effectiveEndDate)) {
      setError(t('eventsImportErrEndDate'));
      return;
    }
    if (effectiveEndDate < startDateIso) {
      setError(t('eventsImportErrDateOrder'));
      return;
    }
    const trimmedStartTime = startTime.trim();
    const trimmedEndTime = endTime.trim();
    if (!isAllDay && (!trimmedStartTime || !TIME_24H_RE.test(trimmedStartTime))) {
      setError(t('eventsImportErrStartTime'));
      return;
    }
    if (!isAllDay && trimmedEndTime && !TIME_24H_RE.test(trimmedEndTime)) {
      setError(t('eventsImportErrEndTime'));
      return;
    }
    if (!isAllDay && trimmedEndTime && effectiveEndDate === startDateIso && trimmedEndTime < trimmedStartTime) {
      setError(t('eventsImportErrTimeOrder'));
      return;
    }

    setSaving(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const payload = {
        event_type: eventType,
        title: trimmedTitle,
        description: description.trim(),
        start_date: startDateIso,
        end_date: effectiveEndDate,
        start_time: isAllDay ? null : trimmedStartTime,
        end_time: isAllDay || !trimmedEndTime ? null : trimmedEndTime,
      };

      const url = editingEvent ? `/api/events/${editingEvent.id}` : '/api/events';
      const method = editingEvent ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const saved: CalendarEvent = await res.json();
      onSaved(saved);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const renderDateField = (
    id: string,
    testId: string,
    label: string,
    displayValue: string,
    isoValue: string,
    onChangeVal: (val: string) => void,
    pickerRef: React.RefObject<HTMLInputElement | null>,
    minIso?: string
  ) => (
    <div className="events-form-group">
      <label htmlFor={id} className="events-form-label">
        {label}
      </label>
      <div className="events-date-input-wrap">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          className="events-input events-date-text-input"
          value={displayValue}
          onChange={(e) => onChangeVal(e.target.value)}
          placeholder="TT.MM.JJJJ"
          required
          data-testid={testId}
        />
        <button
          type="button"
          className="events-date-picker-btn"
          tabIndex={-1}
          aria-label={label}
          onClick={() => {
            const input = pickerRef.current;
            if (input) {
              try {
                input.showPicker();
              } catch {
                input.click();
              }
            }
          }}
        >
          <Calendar size={16} />
        </button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={isValidIsoDateStr(isoValue) ? isoValue : ''}
          min={minIso && isValidIsoDateStr(minIso) ? minIso : undefined}
          className="events-hidden-native-date"
          onChange={(e) => {
            if (e.target.value) {
              onChangeVal(toDisplayDateInput(e.target.value));
            }
          }}
        />
      </div>
    </div>
  );

  const renderViewerBody = () => {
    const ev = editingEvent || {
      id: 'preview',
      event_type: eventType,
      title,
      description,
      start_date: startDateIso,
      end_date: endDateIso || startDateIso,
      start_time: isAllDay ? null : startTime,
      end_time: isAllDay ? null : endTime,
    };
    const meta = getEventTypeMeta(ev.event_type);
    const displayHeading = getCalendarEventDisplayTitle(ev);
    const isMultiDay = ev.end_date > ev.start_date;
    const timeLabel = formatEventTimeRange(ev.start_time, ev.end_time);

    return (
      <>
        <div className="events-modal-body" data-testid="event-viewer-body">
          <div className="events-detail-top">
            <span
              className="events-detail-badge"
              style={{
                color: meta.color,
                backgroundColor: meta.bgColor,
                borderColor: meta.borderColor,
              }}
            >
              {getEventTypeLabel(ev.event_type)}
            </span>

            <span className="events-detail-meta" data-testid="event-viewer-date">
              <CalendarRange size={14} />
              <span>{formatEventDateRange(ev.start_date, ev.end_date)}</span>
            </span>

            {timeLabel ? (
              <span className="events-detail-meta" data-testid="event-viewer-time">
                <Clock size={14} />
                <span>{timeLabel}</span>
              </span>
            ) : meta.expectsSpecificTime ? (
              <span className="events-detail-meta is-missing-time" data-testid="event-viewer-time">
                <Clock size={14} />
                <span>{t('eventsNoSpecificTimeYet')}</span>
              </span>
            ) : !isMultiDay ? (
              <span className="events-detail-meta" data-testid="event-viewer-time">
                <CalendarRange size={14} />
                <span>{t('eventsAllDay')}</span>
              </span>
            ) : null}
          </div>

          <div className="events-detail-heading" data-testid="event-viewer-title">
            {displayHeading}
          </div>

          {ev.description && (
            <p className="events-detail-desc" data-testid="event-viewer-description">
              {ev.description}
            </p>
          )}
        </div>

        <div className="events-modal-footer">
          <button
            type="button"
            className="events-secondary-btn"
            onClick={handleRequestClose}
            data-testid="event-form-cancel-btn"
          >
            {t('close') || 'Schließen'}
          </button>
        </div>
      </>
    );
  };

  const headerTitle = isViewerOnly
    ? t('eventsModalViewTitle')
    : editingEvent
      ? t('eventsModalEditTitle')
      : t('eventsModalCreateTitle');

  const innerContent = (
    <div
      className="events-popover-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-form-modal-title"
      data-testid="event-form-modal"
    >
      <div className="events-modal-header">
        <h3 id="event-form-modal-title">{headerTitle}</h3>
        <button
          type="button"
          className="events-icon-btn"
          onClick={handleRequestClose}
          aria-label={t('cancel')}
          data-testid="event-form-close-btn"
        >
          <X size={16} />
        </button>
      </div>

      {isViewerOnly ? (
        renderViewerBody()
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="events-modal-body">
            {error && (
              <div className="events-error-banner" role="alert" data-testid="event-form-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="events-form-group">
              <label htmlFor="event-form-type" className="events-form-label">
                {t('eventsTypeLabel')}
              </label>
              <select
                id="event-form-type"
                className="events-select"
                value={eventType}
                onChange={(e) => handleEventTypeChange(e.target.value as CalendarEventType)}
                data-testid="event-form-type"
              >
                <optgroup label={CURRENT_LOCALE === 'en' ? 'Closings & Holidays' : 'Schließzeiten & Ferien'}>
                  {closingTypes.map((m) => (
                    <option key={m.type} value={m.type}>
                      {getOptionLabel(m)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={CURRENT_LOCALE === 'en' ? "Parents' Evenings" : 'Elternabende'}>
                  {eaTypes.map((m) => (
                    <option key={m.type} value={m.type}>
                      {getOptionLabel(m)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={CURRENT_LOCALE === 'en' ? 'Community & Celebrations' : 'Aktionen & Feste'}>
                  {communityTypes.map((m) => (
                    <option key={m.type} value={m.type}>
                      {getOptionLabel(m)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={CURRENT_LOCALE === 'en' ? 'Other' : 'Sonstiges'}>
                  {customTypes.map((m) => (
                    <option key={m.type} value={m.type}>
                      {getOptionLabel(m)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="events-form-group">
              <span className="events-form-label">{t('eventsTimeModeLabel')}</span>
              <div className="events-mode-toggle">
                <button
                  type="button"
                  className={isAllDay ? 'active' : ''}
                  onClick={() => setIsAllDay(true)}
                  data-testid="event-form-mode-allday"
                >
                  {doesEventExpectSpecificTime(eventType)
                    ? t('eventsNoTimeEnteredOption')
                    : t('eventsAllDay')}
                </button>
                <button
                  type="button"
                  className={!isAllDay ? 'active' : ''}
                  onClick={() => {
                    setIsAllDay(false);
                    setEndDateInput(startDateInput);
                  }}
                  data-testid="event-form-mode-timed"
                >
                  {t('eventsTimed')}
                </button>
              </div>
            </div>

            {isAllDay ? (
              expectsSpecificTime ? (
                renderDateField(
                  'event-form-start-date',
                  'event-form-start-date',
                  t('eventsDateLabel'),
                  startDateInput,
                  startDateIso,
                  handleStartDateInputChange,
                  startPickerRef
                )
              ) : (
                <div className="events-form-row">
                  {renderDateField(
                    'event-form-start-date',
                    'event-form-start-date',
                    t('eventsStartDateLabel'),
                    startDateInput,
                    startDateIso,
                    handleStartDateInputChange,
                    startPickerRef
                  )}
                  {renderDateField(
                    'event-form-end-date',
                    'event-form-end-date',
                    t('eventsEndDateLabel'),
                    endDateInput,
                    endDateIso,
                    handleEndDateInputChange,
                    endPickerRef,
                    startDateIso
                  )}
                </div>
              )
            ) : (
              <>
                {renderDateField(
                  'event-form-start-date',
                  'event-form-start-date',
                  t('eventsDateLabel'),
                  startDateInput,
                  startDateIso,
                  handleStartDateInputChange,
                  startPickerRef
                )}
                <div className="events-form-row">
                  <div className="events-form-group">
                    <label htmlFor="event-form-start-time" className="events-form-label">
                      {t('eventsStartTimeLabel')}
                    </label>
                    <input
                      id="event-form-start-time"
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:MM (24h)"
                      maxLength={5}
                      className="events-input"
                      value={startTime}
                      onChange={(e) => setStartTime(formatTime24OnChange(e.target.value))}
                      required
                      data-testid="event-form-start-time"
                    />
                  </div>
                  <div className="events-form-group">
                    <label htmlFor="event-form-end-time" className="events-form-label">
                      {t('eventsEndTimeLabel')}
                    </label>
                    <input
                      id="event-form-end-time"
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:MM (24h)"
                      maxLength={5}
                      className="events-input"
                      value={endTime}
                      onChange={(e) => setEndTime(formatTime24OnChange(e.target.value))}
                      data-testid="event-form-end-time"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="events-form-group">
              <label htmlFor="event-form-title" className="events-form-label">
                {t('eventsTitleLabel')}
                {eventType === 'custom' ? ' *' : ''}
              </label>
              <input
                id="event-form-title"
                type="text"
                className="events-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  eventType === 'custom'
                    ? t('eventsTitleRequiredHint')
                    : t('eventsTitleOptionalHint')
                }
                required={eventType === 'custom'}
                data-testid="event-form-title"
              />
            </div>

            <div className="events-form-group">
              <label htmlFor="event-form-description" className="events-form-label">
                {t('eventsDescriptionLabel')}
              </label>
              <textarea
                id="event-form-description"
                className="events-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-testid="event-form-description"
              />
            </div>

            {confirmingDelete && editingEvent && (
              <div className="events-delete-confirm-inline" data-testid="events-delete-modal">
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.86rem' }}>
                  {t('eventsDeleteConfirmMessage')}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="events-secondary-btn"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    data-testid="events-delete-cancel-btn"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    className="events-primary-btn"
                    style={{ background: '#dc2626', borderColor: '#dc2626' }}
                    onClick={() => void handleConfirmDelete()}
                    disabled={deleting}
                    data-testid="events-delete-confirm-btn"
                  >
                    {deleting ? '...' : (t('delete') || 'Löschen')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div
            className="events-modal-footer"
            style={{ justifyContent: editingEvent ? 'space-between' : 'flex-end' }}
          >
            {editingEvent && (
              <button
                type="button"
                className="events-icon-btn danger"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving || deleting}
                aria-label={t('eventsDeleteConfirmTitle')}
                title={t('eventsDeleteConfirmTitle')}
                data-testid={`events-delete-btn-${editingEvent.id}`}
              >
                <Trash2 size={15} />
              </button>
            )}
            <div style={{ display: 'flex', gap: '0.65rem', marginLeft: 'auto' }}>
              <button
                type="button"
                className="events-secondary-btn"
                onClick={handleRequestClose}
                disabled={saving || deleting}
                data-testid="event-form-cancel-btn"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="events-primary-btn"
                disabled={saving || deleting}
                data-testid="event-form-save-btn"
              >
                {saving ? '...' : t('save')}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );

  return (
    <div
      className="events-modal-overlay event-detail-popover"
      onClick={handleRequestClose}
      data-testid="event-form-modal-overlay"
    >
      <div className="events-modal" onClick={(e) => e.stopPropagation()}>
        {innerContent}
      </div>
    </div>
  );
};
