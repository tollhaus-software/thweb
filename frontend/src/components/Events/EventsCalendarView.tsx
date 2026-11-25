import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Upload, Search, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { t, CURRENT_LOCALE } from '../../utils/i18n';
import {
  formatDateKey,
  getMondayOfWeek,
  getISOWeekNumber,
  formatDayHeader,
} from '../../utils/mealPlan';
import { formatMonthYearLabel } from '../../utils/mealAllergens';
import {
  type CalendarEvent,
  getMonth7ColDays,
  getWeek7Days,
  format7DayWeekRange,
  getEventTypeMeta,
  getCalendarEventShortLabel,
  doesCalendarEventMatchSearch,
  getDayEventsBgClass,
} from '../../utils/calendarEvents';

export interface EventsCalendarViewProps {
  initialDate?: Date;
  todayDate?: Date;
  refreshTrigger?: number;
  canWrite: boolean;
  onSelectDate: (dateKey: string) => void;
  onOpenCreateModal: (defaultDate?: string) => void;
  onOpenImportModal: () => void;
}

export const EventsCalendarView: React.FC<EventsCalendarViewProps> = ({
  initialDate,
  todayDate,
  refreshTrigger = 0,
  canWrite,
  onSelectDate,
  onOpenCreateModal,
  onOpenImportModal,
}) => {
  const { token } = useAuth();
  const isMobile = useIsMobile();

  const [selectedYearMonth, setSelectedYearMonth] = useState<{ year: number; month: number }>(() => {
    const base = initialDate || new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const [selectedMonday, setSelectedMonday] = useState<Date>(() => {
    const base = initialDate || new Date();
    return getMondayOfWeek(base);
  });

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const visibleDates = useMemo(() => {
    if (isMobile) {
      return getWeek7Days(selectedMonday);
    }
    return getMonth7ColDays(selectedYearMonth.year, selectedYearMonth.month);
  }, [isMobile, selectedMonday, selectedYearMonth]);

  const startDateKey = formatDateKey(visibleDates[0]);
  const endDateKey = formatDateKey(visibleDates[visibleDates.length - 1]);

  useEffect(() => {
    let ignore = false;
    const fetchRange = async () => {
      setLoading(true);
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(
          `/api/events?start_date=${encodeURIComponent(startDateKey)}&end_date=${encodeURIComponent(endDateKey)}`,
          { headers }
        );
        if (!res.ok) {
          throw new Error(`Failed to load events (${res.status})`);
        }
        const data: CalendarEvent[] = await res.json();
        if (!ignore) {
          setEvents(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          console.error('Error loading calendar events:', err);
          setLoading(false);
        }
      }
    };
    void fetchRange();
    return () => {
      ignore = true;
    };
  }, [startDateKey, endDateKey, token, refreshTrigger]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const dateObj of visibleDates) {
      const dk = formatDateKey(dateObj);
      map[dk] = events.filter((ev) => ev.start_date <= dk && ev.end_date >= dk);
    }
    return map;
  }, [visibleDates, events]);

  const handlePrevMonth = useCallback(() => {
    setSelectedYearMonth((prev) => {
      const d = new Date(prev.year, prev.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setSelectedYearMonth((prev) => {
      const d = new Date(prev.year, prev.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const handlePrevWeek = useCallback(() => {
    setSelectedMonday((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7));
  }, []);

  const handleNextWeek = useCallback(() => {
    setSelectedMonday((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7));
  }, []);

  const handleJumpToday = useCallback(() => {
    const now = todayDate || new Date();
    setSelectedYearMonth({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedMonday(getMondayOfWeek(now));
  }, [todayDate]);

  const todayKey = formatDateKey(todayDate || new Date());
  const { week: weekNo } = getISOWeekNumber(selectedMonday);
  const weekRangeStr = format7DayWeekRange(selectedMonday);
  const monthYearLabel = formatMonthYearLabel(selectedYearMonth.year, selectedYearMonth.month);

  const weekdayHeaders =
    CURRENT_LOCALE === 'en'
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

  return (
    <div className="events-calendar-wrapper" data-testid="events-calendar">
      <div className="events-controls">
        <div className="events-controls-left">
          {!isMobile ? (
            <div className="events-selector" data-testid="events-month-selector">
              <button
                type="button"
                className="events-nav-arrow"
                onClick={handlePrevMonth}
                aria-label={t('previousMonth')}
                title={t('previousMonth')}
                data-testid="events-prev-month"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="events-period-label" data-testid="events-month-label">
                {monthYearLabel}
              </div>
              <button
                type="button"
                className="events-nav-arrow"
                onClick={handleNextMonth}
                aria-label={t('nextMonth')}
                title={t('nextMonth')}
                data-testid="events-next-month"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : (
            <div className="events-selector" data-testid="events-week-selector">
              <button
                type="button"
                className="events-nav-arrow"
                onClick={handlePrevWeek}
                aria-label={t('previousWeek')}
                title={t('previousWeek')}
                data-testid="events-prev-week"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="events-period-label" data-testid="events-week-label">
                {t('calendarWeek')} {weekNo} ({weekRangeStr})
              </div>
              <button
                type="button"
                className="events-nav-arrow"
                onClick={handleNextWeek}
                aria-label={t('nextWeek')}
                title={t('nextWeek')}
                data-testid="events-next-week"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          <button
            type="button"
            className="events-today-btn"
            onClick={handleJumpToday}
            data-testid="events-today-btn"
          >
            {t('today')}
          </button>
        </div>

        <div className="events-controls-right">
          <div className="events-search-wrap">
            <Search size={14} className="events-search-icon" />
            <input
              type="text"
              className="events-search-input"
              placeholder={t('eventsSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="events-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="events-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {canWrite && (
            <>
              <button
                type="button"
                className="events-secondary-btn"
                onClick={onOpenImportModal}
                data-testid="events-open-import-btn"
              >
                <Upload size={15} />
                <span>{t('eventsImportBtn')}</span>
              </button>
              <button
                type="button"
                className="events-primary-btn"
                onClick={() => onOpenCreateModal()}
                data-testid="events-add-btn"
              >
                <Plus size={16} />
                <span>{t('eventsAddBtn')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="events-calendar-sheet" data-testid="events-calendar-sheet">
        {!isMobile && (
          <div className="events-weekday-headers" data-testid="events-weekday-headers">
            {weekdayHeaders.map((dayLabel) => (
              <div key={dayLabel} className="events-weekday-header">
                {dayLabel}
              </div>
            ))}
          </div>
        )}

        <div
          className={`events-calendar-grid ${isMobile ? 'mobile-week-stack' : ''}`}
          data-testid="events-grid"
          data-loading={loading}
        >
          {visibleDates.map((dateObj) => {
            const dateKey = formatDateKey(dateObj);
            const dayEvents = eventsByDate[dateKey] || [];
            const bgClass = getDayEventsBgClass(dayEvents);
            const { dayName, dateStr } = formatDayHeader(dateObj);
            const dayOfWeek = dateObj.getDay(); // 0 = Sun, 1 = Mon
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isOutsideMonth = !isMobile && dateObj.getMonth() !== selectedYearMonth.month;
            const isToday = dateKey === todayKey;
            const isMatched =
              Boolean(searchQuery.trim()) &&
              dayEvents.some((ev) => doesCalendarEventMatchSearch(ev, searchQuery));

            return (
              <button
                key={dateKey}
                type="button"
                className={[
                  'events-day-box',
                  bgClass,
                  isWeekend && bgClass === 'bg-default' ? 'is-weekend' : '',
                  isToday ? 'is-today' : '',
                  isMatched ? 'search-match' : '',
                  isOutsideMonth ? 'outside-month' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-testid={`events-day-box-${dateKey}`}
                data-date={dateKey}
                data-is-today={isToday ? 'true' : 'false'}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => onSelectDate(dateKey)}
              >
                <div className="events-day-header">
                  <span className="events-day-date">
                    <span className={`events-day-date-num ${isToday ? 'is-today-num' : ''}`}>
                      {isMobile ? `${dayName}, ${dateStr}` : dateStr}
                    </span>
                    {isToday && (
                      <span className="events-today-badge" data-testid="events-today-badge">
                        {t('today')}
                      </span>
                    )}
                  </span>
                </div>

                {dayEvents.length > 0 && (
                  <div className="events-day-pills" data-testid={`events-day-pills-${dateKey}`}>
                    {dayEvents.map((ev) => {
                      const meta = getEventTypeMeta(ev.event_type);
                      const label = getCalendarEventShortLabel(ev);
                      const continuesLeft = !isMobile && ev.start_date < dateKey && dayOfWeek !== 1;
                      const continuesRight = !isMobile && ev.end_date > dateKey && dayOfWeek !== 0;

                      return (
                        <span
                          key={ev.id}
                          className={[
                            'events-pill',
                            continuesLeft ? 'continues-left' : '',
                            continuesRight ? 'continues-right' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{
                            color: meta.color,
                            backgroundColor: meta.bgColor,
                            borderColor: meta.borderColor,
                          }}
                          title={label}
                          data-testid={`events-pill-${ev.id}`}
                          data-event-type={ev.event_type}
                        >
                          {ev.start_time && (
                            <span className="events-pill-time">{ev.start_time}</span>
                          )}
                          <span className="events-pill-label">{label}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
