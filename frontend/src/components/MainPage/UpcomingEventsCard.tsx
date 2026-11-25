import React, { useState } from 'react';
import { CalendarDays, ChefHat, Calendar, ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';
import { t } from '../../utils/i18n';
import { daysUntil } from '../../utils/hygieneMessage';
import { formatUpcomingEventText, type UpcomingEvent } from '../../utils/upcomingEvents';

export interface UpcomingEventsCardProps {
  events: UpcomingEvent[];
  today: Date;
}

const INITIAL_VISIBLE_COUNT = 4;

const EVENT_TYPE_ICONS: Record<string, LucideIcon> = {
  cooking_duty: ChefHat,
};

export const UpcomingEventsCard: React.FC<UpcomingEventsCardProps> = ({ events, today }) => {
  const [expanded, setExpanded] = useState<boolean>(false);

  if (!events || events.length === 0) {
    return null;
  }

  const hasOverflow = events.length > INITIAL_VISIBLE_COUNT;
  const visibleEvents = hasOverflow && !expanded ? events.slice(0, INITIAL_VISIBLE_COUNT) : events;

  const expandLabel = (t('upcomingEventsShowMore') || 'Alle {count} Termine anzeigen').replace(
    '{count}',
    String(events.length)
  );
  const collapseLabel = t('upcomingEventsShowLess') || 'Weniger anzeigen';

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
            const Icon = EVENT_TYPE_ICONS[event.type] || Calendar;
            const diff = daysUntil(event.date, today);
            const isTodayOrOngoing = diff <= 0;
            const text = formatUpcomingEventText(event, today);
            const itemTestId =
              event.type === 'calendar_event' && event.event_type
                ? `main-page-event-item-${event.event_type}`
                : `main-page-event-item-${event.type}`;

            return (
              <li
                key={event.id || `${event.type}-${event.date}-${idx}`}
                className={`main-page-event-item${isTodayOrOngoing ? ' is-today' : ''}`}
                data-testid={itemTestId}
                data-event-type={event.event_type || event.type}
                data-event-date={event.date}
              >
                <span className="main-page-event-icon-wrapper" aria-hidden="true">
                  <Icon size={18} className="main-page-event-item-icon" />
                </span>
                <span className="main-page-event-text">{text}</span>
              </li>
            );
          })}
        </ul>

        {hasOverflow && (
          <button
            type="button"
            className="main-page-events-expand-btn"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            data-testid="main-page-upcoming-events-expand-btn"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>{expanded ? collapseLabel : expandLabel}</span>
          </button>
        )}
      </div>
    </section>
  );
};
