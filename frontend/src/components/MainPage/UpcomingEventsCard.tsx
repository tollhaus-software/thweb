import React from 'react';
import { CalendarDays, ChefHat, Calendar, type LucideIcon } from 'lucide-react';
import { t } from '../../utils/i18n';
import { daysUntil } from '../../utils/hygieneMessage';
import { formatUpcomingEventText, type UpcomingEvent } from '../../utils/upcomingEvents';

export interface UpcomingEventsCardProps {
  events: UpcomingEvent[];
  today: Date;
}

const EVENT_TYPE_ICONS: Record<string, LucideIcon> = {
  cooking_duty: ChefHat,
};

export const UpcomingEventsCard: React.FC<UpcomingEventsCardProps> = ({ events, today }) => {
  if (!events || events.length === 0) {
    return null;
  }

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
          {events.map((event, idx) => {
            const Icon = EVENT_TYPE_ICONS[event.type] || Calendar;
            const diff = daysUntil(event.date, today);
            const isToday = diff === 0;
            const text = formatUpcomingEventText(event, today);

            return (
              <li
                key={`${event.type}-${event.date}-${idx}`}
                className={`main-page-event-item${isToday ? ' is-today' : ''}`}
                data-testid={`main-page-event-item-${event.type}`}
                data-event-type={event.type}
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
      </div>
    </section>
  );
};
