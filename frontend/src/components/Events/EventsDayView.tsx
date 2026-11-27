import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Clock, CalendarRange, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { t } from '../../utils/i18n';
import { formatDateKey, parseDateKey } from '../../utils/mealPlan';
import { formatWeekdayWithDate } from '../../utils/upcomingEvents';
import {
  type CalendarEvent,
  getEventTypeMeta,
  getEventTypeLabel,
  getCalendarEventDisplayTitle,
  isCalendarEventEditable,
  formatEventTimeRange,
  formatEventDateRange,
} from '../../utils/calendarEvents';

export interface EventsDayViewProps {
  dateKey: string;
  canWrite: boolean;
  refreshTrigger: number;
  onBack: () => void;
  onChangeDate: (nextDateKey: string) => void;
  onOpenCreateForDate: (dateKey: string) => void;
  onOpenEditEvent: (ev: CalendarEvent) => void;
  onEventDeleted: () => void;
}

export const EventsDayView: React.FC<EventsDayViewProps> = ({
  dateKey,
  canWrite,
  refreshTrigger,
  onBack,
  onChangeDate,
  onOpenCreateForDate,
  onOpenEditEvent,
  onEventDeleted,
}) => {
  const { token } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deletingEvent, setDeletingEvent] = useState<CalendarEvent | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const loadDayEvents = useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(
        `/api/events?start_date=${encodeURIComponent(dateKey)}&end_date=${encodeURIComponent(dateKey)}`,
        { headers }
      );
      if (res.ok) {
        const data: CalendarEvent[] = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error loading day events:', err);
    } finally {
      setLoading(false);
    }
  }, [dateKey, token]);

  useEffect(() => {
    void loadDayEvents();
  }, [loadDayEvents, refreshTrigger]);

  const handleStepDay = (delta: number) => {
    const d = parseDateKey(dateKey);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
    onChangeDate(formatDateKey(next));
  };

  const handleConfirmDelete = async () => {
    if (!deletingEvent) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/events/${deletingEvent.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      setDeletingEvent(null);
      onEventDeleted();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Fehler beim Löschen');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="events-day-view" data-testid="events-day-view">
      <div className="events-day-view-header">
        <div className="events-day-view-nav">
          <button
            type="button"
            className="events-secondary-btn events-day-back-btn"
            onClick={onBack}
            data-testid="events-day-back-btn"
          >
            <ArrowLeft size={16} />
            <span>{t('back') || 'Zurück'}</span>
          </button>

          <div className="events-selector events-day-selector">
            <button
              type="button"
              className="events-nav-arrow"
              onClick={() => handleStepDay(-1)}
              aria-label="Vorheriger Tag"
              data-testid="events-day-prev-btn"
            >
              <ChevronLeft size={18} />
            </button>

            <h2 className="events-day-view-title" data-testid="events-day-heading">
              {formatWeekdayWithDate(dateKey)}
            </h2>

            <button
              type="button"
              className="events-nav-arrow"
              onClick={() => handleStepDay(1)}
              aria-label="Nächster Tag"
              data-testid="events-day-next-btn"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="events-empty-day-state">...</div>
      ) : events.length === 0 ? (
        <div className="events-empty-day-state" data-testid="events-day-empty">
          {t('eventsNoEventsOnDay')}
        </div>
      ) : (
        <div className="events-day-cards" data-testid="events-day-cards">
          {events.map((ev) => {
            const meta = getEventTypeMeta(ev.event_type);
            const displayHeading = getCalendarEventDisplayTitle(ev);
            const isMultiDay = ev.end_date > ev.start_date;
            const timeLabel = formatEventTimeRange(ev.start_time, ev.end_time);

            return (
              <div
                key={ev.id}
                className="events-detail-card"
                data-testid={`events-detail-card-${ev.id}`}
              >
                <div className="events-detail-main">
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

                    {isMultiDay && (
                      <span className="events-detail-meta" data-testid={`events-detail-range-${ev.id}`}>
                        <CalendarRange size={14} />
                        <span>{formatEventDateRange(ev.start_date, ev.end_date)}</span>
                      </span>
                    )}

                    {timeLabel ? (
                      <span className="events-detail-meta" data-testid={`events-detail-time-${ev.id}`}>
                        <Clock size={14} />
                        <span>{timeLabel}</span>
                      </span>
                    ) : meta.expectsSpecificTime ? (
                      <span
                        className="events-detail-meta is-missing-time"
                        data-testid={`events-detail-time-${ev.id}`}
                      >
                        <Clock size={14} />
                        <span>{t('eventsNoSpecificTimeYet')}</span>
                      </span>
                    ) : !isMultiDay ? (
                      <span className="events-detail-meta" data-testid={`events-detail-time-${ev.id}`}>
                        <CalendarRange size={14} />
                        <span>{t('eventsAllDay')}</span>
                      </span>
                    ) : null}
                  </div>

                  <div className="events-detail-heading" data-testid={`events-detail-title-${ev.id}`}>
                    {displayHeading}
                  </div>

                  {ev.description && (
                    <p className="events-detail-desc" data-testid={`events-detail-desc-${ev.id}`}>
                      {ev.description}
                    </p>
                  )}
                </div>

                {canWrite && isCalendarEventEditable(ev) && (
                  <div className="events-detail-actions">
                    <button
                      type="button"
                      className="events-icon-btn"
                      onClick={() => onOpenEditEvent(ev)}
                      aria-label={t('eventsModalEditTitle')}
                      title={t('eventsModalEditTitle')}
                      data-testid={`events-edit-btn-${ev.id}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="events-icon-btn danger"
                      onClick={() => {
                        setDeleteError(null);
                        setDeletingEvent(ev);
                      }}
                      aria-label={t('eventsDeleteConfirmTitle')}
                      title={t('eventsDeleteConfirmTitle')}
                      data-testid={`events-delete-btn-${ev.id}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canWrite && (
        <div className="events-day-footer">
          <button
            type="button"
            className="events-primary-btn"
            onClick={() => onOpenCreateForDate(dateKey)}
            data-testid="events-day-add-btn"
          >
            <Plus size={16} />
            <span>{t('eventsAddForDayBtn')}</span>
          </button>
        </div>
      )}

      {deletingEvent && (
        <div
          className="events-modal-overlay"
          onClick={() => !isDeleting && setDeletingEvent(null)}
          data-testid="events-delete-modal-overlay"
        >
          <div
            className="events-modal"
            style={{ maxWidth: '420px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            data-testid="events-delete-modal"
          >
            <div className="events-modal-header">
              <h3>{t('eventsDeleteConfirmTitle')}</h3>
            </div>
            <div className="events-modal-body">
              {deleteError && (
                <div className="events-error-banner" role="alert">
                  <AlertCircle size={16} />
                  <span>{deleteError}</span>
                </div>
              )}
              <p style={{ margin: 0 }}>
                {t('eventsDeleteConfirmMessage')}
              </p>
              <strong>{getCalendarEventDisplayTitle(deletingEvent)}</strong>
            </div>
            <div className="events-modal-footer">
              <button
                type="button"
                className="events-secondary-btn"
                onClick={() => setDeletingEvent(null)}
                disabled={isDeleting}
                data-testid="events-delete-cancel-btn"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="events-primary-btn"
                style={{ background: '#dc2626', borderColor: '#dc2626' }}
                onClick={() => void handleConfirmDelete()}
                disabled={isDeleting}
                data-testid="events-delete-confirm-btn"
              >
                {isDeleting ? '...' : (t('delete') || 'Löschen')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
