import React from 'react';
import { CalendarDays, ArrowRight } from 'lucide-react';
import { t } from '../../utils/i18n';
import { daysUntil } from '../../utils/hygieneMessage';
import {
  formatUpcomingEventParts,
  getVisibleUpcomingEvents,
  type UpcomingEvent,
} from '../../utils/upcomingEvents';

export interface UpcomingEventsCardProps {
  events: UpcomingEvent[];
  today: Date;
  onNavigateToCalendar?: () => void;
  onSelectEvent?: (event: UpcomingEvent) => void;
}

export const UpcomingEventsCard: React.FC<UpcomingEventsCardProps> = ({
  events,
  today,
  onNavigateToCalendar,
  onSelectEvent,
}) => {
  if (!events || events.length === 0) {
    return null;
  }

  const visibleEvents = getVisibleUpcomingEvents(events, today);
  if (visibleEvents.length === 0) {
    return null;
  }
  const toCalendarLabel = t('upcomingEventsToCalendar') || 'Zum Kalender';

  const handleEventClick = (event: UpcomingEvent) => {
    if (onSelectEvent) {
      onSelectEvent(event);
    } else if (onNavigateToCalendar) {
      onNavigateToCalendar();
    }
  };

  return (
    <section
      className="main-page-card main-page-upcoming-events-card"
      data-testid="main-page-upcoming-events-card"
    >
      <div className="main-page-card-header">
        <CalendarDays size={22} className="main-page-card-icon events-icon" />
        <h2 className="main-page-card-title" data-testid="main-page-upcoming-events-title">
          {t('upcomingEventsTitle') || 'Anstehende Termine'}
        </h2>
      </div>
      <div className="main-page-card-body">
        <ul className="main-page-events-list" data-testid="main-page-upcoming-events-list">
          {visibleEvents.map((event, idx) => {
            const diff = daysUntil(event.date, today);
            const isTodayOrOngoing = diff <= 0;
            const { header, title } = formatUpcomingEventParts(event, today);
            const itemTestId =
              event.type === 'calendar_event' && event.event_type
                ? `main-page-event-item-${event.event_type}`
                : `main-page-event-item-${event.type}`;

            return (
              <li
                key={event.id || `${event.type}-${event.date}-${idx}`}
                className={`main-page-event-item is-clickable${isTodayOrOngoing ? ' is-today' : ''}`}
                data-testid={itemTestId}
                data-event-type={event.event_type || event.type}
                data-event-date={event.date}
                data-event-id={event.id || ''}
                role="button"
                tabIndex={0}
                onClick={() => handleEventClick(event)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleEventClick(event);
                  }
                }}
              >
                <span className="main-page-event-date-header">{header}</span>
                <span className="main-page-event-text">{title}</span>
              </li>
            );
          })}
        </ul>

        {onNavigateToCalendar && (
          <button
            type="button"
            className="main-page-events-expand-btn"
            onClick={onNavigateToCalendar}
            data-testid="main-page-upcoming-events-calendar-btn"
          >
            <span>{toCalendarLabel}</span>
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </section>
  );
};
