import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { t, CURRENT_LOCALE } from '../../utils/i18n';
import {
  type CalendarEvent,
  type CalendarEventType,
  EVENT_TYPE_LIST,
  doesEventExpectSpecificTime,
} from '../../utils/calendarEvents';

export interface EventFormModalProps {
  isOpen: boolean;
  initialDate?: string;
  editingEvent?: CalendarEvent | null;
  onClose: () => void;
  onSaved: (saved: CalendarEvent) => void;
}

export const EventFormModal: React.FC<EventFormModalProps> = ({
  isOpen,
  initialDate,
  editingEvent,
  onClose,
  onSaved,
}) => {
  const { token } = useAuth();

  const [eventType, setEventType] = useState<CalendarEventType>('ea_gesamt');
  const [isAllDay, setIsAllDay] = useState<boolean>(true);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('19:30');
  const [endTime, setEndTime] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingEvent) {
      setEventType(editingEvent.event_type);
      const hasStartTime = Boolean(editingEvent.start_time && editingEvent.start_time.trim() !== '');
      setIsAllDay(!hasStartTime);
      setStartDate(editingEvent.start_date);
      setEndDate(editingEvent.end_date || editingEvent.start_date);
      setStartTime(editingEvent.start_time || '19:30');
      setEndTime(editingEvent.end_time || '');
      setTitle(editingEvent.title || '');
      setDescription(editingEvent.description || '');
    } else {
      const todayIso = new Date().toISOString().slice(0, 10);
      const baseDate = initialDate || todayIso;
      setEventType('ea_gesamt');
      setIsAllDay(true);
      setStartDate(baseDate);
      setEndDate(baseDate);
      setStartTime('19:30');
      setEndTime('');
      setTitle('');
      setDescription('');
    }
  }, [isOpen, initialDate, editingEvent]);

  if (!isOpen) return null;

  const closingTypes = EVENT_TYPE_LIST.filter((m) => m.group === 'closing');
  const eaTypes = EVENT_TYPE_LIST.filter((m) => m.group === 'ea');
  const communityTypes = EVENT_TYPE_LIST.filter((m) => m.group === 'community');
  const customTypes = EVENT_TYPE_LIST.filter((m) => m.group === 'custom');

  const getOptionLabel = (m: (typeof EVENT_TYPE_LIST)[number]) =>
    CURRENT_LOCALE === 'en' ? m.labelEn : m.labelDe;

  const handleStartDateChange = (nextStart: string) => {
    setStartDate(nextStart);
    if (!endDate || endDate < nextStart || !isAllDay) {
      setEndDate(nextStart);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (eventType === 'custom' && !trimmedTitle) {
      setError(t('eventsTitleRequiredHint'));
      return;
    }
    if (!startDate) {
      setError(t('eventsImportErrStartDate'));
      return;
    }
    const effectiveEndDate = isAllDay ? endDate || startDate : startDate;
    if (effectiveEndDate < startDate) {
      setError(t('eventsImportErrDateOrder'));
      return;
    }
    if (!isAllDay && !startTime.trim()) {
      setError(t('eventsImportErrStartTime'));
      return;
    }
    if (!isAllDay && endTime.trim() && effectiveEndDate === startDate && endTime.trim() < startTime.trim()) {
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
        start_date: startDate,
        end_date: effectiveEndDate,
        start_time: isAllDay ? null : startTime.trim(),
        end_time: isAllDay || !endTime.trim() ? null : endTime.trim(),
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

  return (
    <div
      className="events-modal-overlay"
      onClick={onClose}
      data-testid="event-form-modal-overlay"
    >
      <div
        className="events-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-form-modal-title"
        data-testid="event-form-modal"
      >
        <div className="events-modal-header">
          <h3 id="event-form-modal-title">
            {editingEvent ? t('eventsModalEditTitle') : t('eventsModalCreateTitle')}
          </h3>
          <button
            type="button"
            className="events-icon-btn"
            onClick={onClose}
            aria-label={t('cancel')}
            data-testid="event-form-close-btn"
          >
            <X size={16} />
          </button>
        </div>

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
                onChange={(e) => setEventType(e.target.value as CalendarEventType)}
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
                    setEndDate(startDate);
                  }}
                  data-testid="event-form-mode-timed"
                >
                  {t('eventsTimed')}
                </button>
              </div>
            </div>

            {isAllDay ? (
              <div className="events-form-row">
                <div className="events-form-group">
                  <label htmlFor="event-form-start-date" className="events-form-label">
                    {t('eventsStartDateLabel')}
                  </label>
                  <input
                    id="event-form-start-date"
                    type="date"
                    className="events-input"
                    value={startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    required
                    data-testid="event-form-start-date"
                  />
                </div>
                <div className="events-form-group">
                  <label htmlFor="event-form-end-date" className="events-form-label">
                    {t('eventsEndDateLabel')}
                  </label>
                  <input
                    id="event-form-end-date"
                    type="date"
                    className="events-input"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    data-testid="event-form-end-date"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="events-form-group">
                  <label htmlFor="event-form-start-date" className="events-form-label">
                    {t('eventsDateLabel')}
                  </label>
                  <input
                    id="event-form-start-date"
                    type="date"
                    className="events-input"
                    value={startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    required
                    data-testid="event-form-start-date"
                  />
                </div>
                <div className="events-form-row">
                  <div className="events-form-group">
                    <label htmlFor="event-form-start-time" className="events-form-label">
                      {t('eventsStartTimeLabel')}
                    </label>
                    <input
                      id="event-form-start-time"
                      type="time"
                      className="events-input"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
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
                      type="time"
                      className="events-input"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
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
          </div>

          <div className="events-modal-footer">
            <button
              type="button"
              className="events-secondary-btn"
              onClick={onClose}
              disabled={saving}
              data-testid="event-form-cancel-btn"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="events-primary-btn"
              disabled={saving}
              data-testid="event-form-save-btn"
            >
              {saving ? '...' : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
