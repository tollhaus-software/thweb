import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { t, CURRENT_LOCALE, formatDisplayDate } from '../../utils/i18n';
import {
  formatDateKey,
  getMondayOfWeek,
  getISOWeekNumber,
  formatDayHeader,
} from '../../utils/mealPlan';
import { formatMonthYearLabel } from '../../utils/mealAllergens';
import { CellPopover } from '../Table/CellPopover';
import {
  type CalendarEvent,
  getMonth7ColDays,
  getWeek7Days,
  getEventTypeMeta,
  getCalendarEventShortLabel,
  getCalendarEventDisplayTitle,
  getDayEventsBgClass,
  formatEventTimeRange,
} from '../../utils/calendarEvents';

export interface EventsCalendarViewProps {
  initialDate?: Date;
  todayDate?: Date;
  highlightedEventId?: string | null;
  refreshTrigger?: number;
  canWrite: boolean;
  onOpenCreateModal: (defaultDate?: string, anchorEl?: HTMLElement | null) => void;
  onOpenEvent: (ev: CalendarEvent, anchorEl?: HTMLElement | null) => void;
}

export const EventsCalendarView: React.FC<EventsCalendarViewProps> = ({
  initialDate,
  todayDate,
  highlightedEventId,
  refreshTrigger = 0,
  canWrite,
  onOpenCreateModal,
  onOpenEvent,
}) => {
  const { token } = useAuth();
  const isMobile = useIsMobile();
  const gridRef = useRef<HTMLDivElement>(null);
  const dayBoxRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [selectedYearMonth, setSelectedYearMonth] = useState<{ year: number; month: number }>(() => {
    const base = initialDate || new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const [selectedMonday, setSelectedMonday] = useState<Date>(() => {
    const base = initialDate || new Date();
    return getMondayOfWeek(base);
  });

  useEffect(() => {
    if (!initialDate || isNaN(initialDate.getTime())) return;
    setSelectedYearMonth({ year: initialDate.getFullYear(), month: initialDate.getMonth() });
    setSelectedMonday(getMondayOfWeek(initialDate));
  }, [initialDate]);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [maxFittingByDate, setMaxFittingByDate] = useState<Record<string, number>>({});
  const [morePopover, setMorePopover] = useState<{ dateKey: string; anchorEl: HTMLElement } | null>(null);

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

  // Measure each day box to compute how many event pills fit without overflowing
  const recomputeFittingPills = useCallback(() => {
    const next: Record<string, number> = {};
    for (const dateObj of visibleDates) {
      const dk = formatDateKey(dateObj);
      const box = dayBoxRefs.current[dk];
      if (!box) continue;
      const boxHeight = box.clientHeight;
      if (boxHeight <= 0) continue;

      const style = window.getComputedStyle(box);
      const padTop = parseFloat(style.paddingTop) || 8;
      const padBottom = parseFloat(style.paddingBottom) || 8;
      const boxGap = parseFloat(style.rowGap || style.gap) || 5;
      const headerEl = box.querySelector('.events-day-header') as HTMLElement | null;
      const headerHeight = headerEl ? headerEl.offsetHeight : 18;

      const availableForPills = boxHeight - padTop - padBottom - headerHeight - boxGap;
      // Each pill is ~22px high with ~3.5px gap (~25.5px per slot)
      const PILL_HEIGHT = 22;
      const PILL_GAP = 3.5;
      const slots = Math.max(
        1,
        Math.floor((availableForPills + PILL_GAP) / (PILL_HEIGHT + PILL_GAP))
      );
      next[dk] = slots;
    }

    setMaxFittingByDate((prev) => {
      const keys = Object.keys(next);
      if (
        keys.length === Object.keys(prev).length &&
        keys.every((k) => prev[k] === next[k])
      ) {
        return prev;
      }
      return next;
    });
  }, [visibleDates]);

  useLayoutEffect(() => {
    recomputeFittingPills();
    const gridEl = gridRef.current;
    if (!gridEl || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', recomputeFittingPills);
      return () => window.removeEventListener('resize', recomputeFittingPills);
    }
    const ro = new ResizeObserver(() => {
      recomputeFittingPills();
    });
    ro.observe(gridEl);
    window.addEventListener('resize', recomputeFittingPills);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recomputeFittingPills);
    };
  }, [recomputeFittingPills, events, isMobile]);

  const handlePrevMonth = useCallback(() => {
    setMorePopover(null);
    setSelectedYearMonth((prev) => {
      const d = new Date(prev.year, prev.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setMorePopover(null);
    setSelectedYearMonth((prev) => {
      const d = new Date(prev.year, prev.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const handlePrevWeek = useCallback(() => {
    setMorePopover(null);
    setSelectedMonday((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7));
  }, []);

  const handleNextWeek = useCallback(() => {
    setMorePopover(null);
    setSelectedMonday((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7));
  }, []);

  const handleJumpToday = useCallback(() => {
    setMorePopover(null);
    const now = todayDate || new Date();
    setSelectedYearMonth({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedMonday(getMondayOfWeek(now));
  }, [todayDate]);

  const todayObj = todayDate || new Date();
  const todayKey = formatDateKey(todayObj);
  const { week: weekNo, year: weekYear } = getISOWeekNumber(selectedMonday);
  const monthYearLabel = formatMonthYearLabel(selectedYearMonth.year, selectedYearMonth.month);

  const weekdayHeaders =
    CURRENT_LOCALE === 'en'
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

  const morePopoverEvents = morePopover ? eventsByDate[morePopover.dateKey] || [] : [];

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
                {t('calendarWeek')} {weekNo}, {weekYear}
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

          {canWrite && (
            <button
              type="button"
              className="events-primary-btn events-add-top-btn"
              onClick={(e) => onOpenCreateModal(undefined, e.currentTarget)}
              aria-label={t('eventsAddBtn')}
              title={t('eventsAddBtn')}
              data-testid="events-add-btn"
            >
              <Plus size={16} />
              <span className="events-add-btn-text">{t('eventsAddBtn')}</span>
            </button>
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
          ref={gridRef}
          className={`events-calendar-grid ${isMobile ? 'mobile-week-stack' : ''}`}
          data-testid="events-grid"
          data-loading={loading}
        >
          {visibleDates.map((dateObj) => {
            const dateKey = formatDateKey(dateObj);
            const dayEvents = eventsByDate[dateKey] || [];
            const bgClass = getDayEventsBgClass(dayEvents);
            const { dayName } = formatDayHeader(dateObj);
            const fullDateStr = formatDisplayDate(dateObj);
            const dayOfWeek = dateObj.getDay(); // 0 = Sun, 1 = Mon
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isOutsideMonth = !isMobile && dateObj.getMonth() !== selectedYearMonth.month;
            const isToday = dateKey === todayKey;

            // Default capacity is 3 on desktop (112px min-height -> ~76px for pills) and 2 on mobile (75px min-height)
            const maxFitting = maxFittingByDate[dateKey] ?? (isMobile ? 2 : 3);
            const hasOverflow = dayEvents.length > maxFitting;
            const visibleCount = hasOverflow ? Math.max(0, maxFitting - 1) : dayEvents.length;
            let visibleEvents = dayEvents.slice(0, visibleCount);
            if (
              hasOverflow &&
              highlightedEventId &&
              visibleCount > 0 &&
              !visibleEvents.some((ev) => ev.id === highlightedEventId)
            ) {
              const highlightedInDay = dayEvents.find((ev) => ev.id === highlightedEventId);
              if (highlightedInDay) {
                visibleEvents = [...visibleEvents.slice(0, visibleCount - 1), highlightedInDay];
              }
            }
            const hiddenCount = dayEvents.length - visibleCount;

            return (
              <div
                key={dateKey}
                ref={(el) => {
                  dayBoxRefs.current[dateKey] = el;
                }}
                className={[
                  'events-day-box',
                  bgClass,
                  canWrite || isMobile ? 'can-create' : '',
                  isWeekend && bgClass === 'bg-default' ? 'is-weekend' : '',
                  isToday ? 'is-today' : '',
                  isOutsideMonth ? 'outside-month' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-testid={`events-day-box-${dateKey}`}
                data-date={dateKey}
                data-is-today={isToday ? 'true' : 'false'}
                aria-current={isToday ? 'date' : undefined}
                onClick={(e) => {
                  if (isMobile) {
                    setMorePopover({ dateKey, anchorEl: e.currentTarget });
                    return;
                  }
                  if (!canWrite) return;
                  onOpenCreateModal(dateKey, e.currentTarget);
                }}
              >
                <div className="events-day-header">
                  <span className="events-day-date">
                    <span className={`events-day-date-num ${isToday ? 'is-today-num' : ''}`}>
                      {isMobile ? `${dayName}, ${fullDateStr}` : fullDateStr}
                    </span>
                  </span>
                </div>

                {dayEvents.length > 0 && (
                  <div className="events-day-pills" data-testid={`events-day-pills-${dateKey}`}>
                    {visibleEvents.map((ev) => {
                      const meta = getEventTypeMeta(ev.event_type);
                      const label = getCalendarEventShortLabel(ev);
                      const continuesLeft = !isMobile && ev.start_date < dateKey && dayOfWeek !== 1;
                      const continuesRight = !isMobile && ev.end_date > dateKey && dayOfWeek !== 0;
                      const isHighlighted = Boolean(highlightedEventId && ev.id === highlightedEventId);

                      return (
                        <button
                          key={ev.id}
                          type="button"
                          className={[
                            'events-pill',
                            continuesLeft ? 'continues-left' : '',
                            continuesRight ? 'continues-right' : '',
                            isHighlighted ? 'is-highlighted' : '',
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
                          data-highlighted={isHighlighted ? 'true' : 'false'}
                          onClick={(e) => {
                            if (isMobile) {
                              // Let click bubble to day box on mobile so it always expands the day popover
                              return;
                            }
                            e.stopPropagation();
                            onOpenEvent(ev, e.currentTarget);
                          }}
                        >
                          {ev.start_time && (
                            <span className="events-pill-time">{ev.start_time}</span>
                          )}
                          <span className="events-pill-label">{label}</span>
                        </button>
                      );
                    })}

                    {hasOverflow && (
                      <button
                        type="button"
                        className="events-pill events-more-pill"
                        data-testid={`events-more-pill-${dateKey}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const dayEl = dayBoxRefs.current[dateKey] || e.currentTarget;
                          setMorePopover({ dateKey, anchorEl: dayEl });
                        }}
                      >
                        <span className="events-pill-label">
                          {(t('eventsMoreCount') || '{count} weitere').replace(
                            '{count}',
                            String(hiddenCount)
                          )}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <CellPopover
        isOpen={Boolean(morePopover)}
        onClose={() => setMorePopover(null)}
        anchorEl={morePopover?.anchorEl || null}
        width={340}
        minWidth={260}
        closeOnScrollOutOfView={false}
      >
        {morePopover && (
          <div className="events-more-popover" data-testid={`events-more-popover-${morePopover.dateKey}`}>
            <div className="events-more-popover-header">
              <strong>
                {(t('eventsMorePopoverTitle') || 'Termine am {date}').replace(
                  '{date}',
                  formatDisplayDate(morePopover.dateKey)
                )}
              </strong>
              <button
                type="button"
                className="events-icon-btn"
                style={{ width: '26px', height: '26px' }}
                onClick={() => setMorePopover(null)}
                aria-label={t('close') || 'Schließen'}
                data-testid="events-more-popover-close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="events-more-popover-list" data-testid="events-more-popover-list">
              {morePopoverEvents.length === 0 ? (
                <div className="events-more-popover-empty" data-testid="events-more-popover-empty">
                  {t('eventsNoEventsOnDay')}
                </div>
              ) : (
                morePopoverEvents.map((ev) => {
                  const meta = getEventTypeMeta(ev.event_type);
                  const fullTitle = getCalendarEventDisplayTitle(ev);
                  const timeStr = formatEventTimeRange(ev.start_time, ev.end_time);

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      className="events-pill events-more-popover-item"
                      style={{
                        color: meta.color,
                        backgroundColor: meta.bgColor,
                        borderColor: meta.borderColor,
                      }}
                      data-testid={`events-more-item-${ev.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEvent(ev, e.currentTarget);
                      }}
                    >
                      {timeStr && <span className="events-pill-time">{timeStr}</span>}
                      <span className="events-pill-label">{fullTitle}</span>
                    </button>
                  );
                })
              )}

              {canWrite && (
                <button
                  type="button"
                  className="events-primary-btn events-more-popover-add-btn"
                  data-testid={`events-more-add-btn-${morePopover.dateKey}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenCreateModal(morePopover.dateKey, e.currentTarget);
                  }}
                >
                  <Plus size={16} />
                  <span>{t('eventsAddForDayBtn')}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </CellPopover>
    </div>
  );
};
