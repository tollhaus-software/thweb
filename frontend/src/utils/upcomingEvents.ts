import { CURRENT_LOCALE, formatDisplayDate, type Locale } from './i18n';
import { daysUntil } from './hygieneMessage';
import { parseDateKey } from './mealPlan';
import {
  type CalendarEventType,
  formatEventTimeRange,
  getCalendarEventDisplayTitle,
} from './calendarEvents';

export type UpcomingEventType = 'cooking_duty' | 'calendar_event' | (string & {});

export interface UpcomingEvent {
  type: UpcomingEventType;
  date: string; // YYYY-MM-DD
  id?: string;
  event_type?: string;
  end_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  title?: string;
  description?: string;
}

const WEEKDAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MAX_VISIBLE_COUNT = 3;
const COOKING_DUTY_BONUS_WINDOW_DAYS = 30;

function isCookingDutyEvent(event: UpcomingEvent): boolean {
  return event.type === 'cooking_duty' || event.event_type === 'cooking_duty';
}

export function getVisibleUpcomingEvents(events: UpcomingEvent[], today: Date): UpcomingEvent[] {
  const nonFerienEvents = events.filter(
    (event) => event.type !== 'ferien' && event.event_type !== 'ferien'
  );
  const topEvents = nonFerienEvents.slice(0, MAX_VISIBLE_COUNT);
  const hasCookingDutyInTop = topEvents.some(isCookingDutyEvent);

  if (!hasCookingDutyInTop && nonFerienEvents.length > MAX_VISIBLE_COUNT) {
    const nextCookingDuty = nonFerienEvents.slice(MAX_VISIBLE_COUNT).find((event) => {
      if (!isCookingDutyEvent(event)) return false;
      const diff = daysUntil(event.date, today);
      return diff >= 0 && diff <= COOKING_DUTY_BONUS_WINDOW_DAYS;
    });
    if (nextCookingDuty) {
      return [...topEvents, nextCookingDuty];
    }
  }

  return topEvents;
}

/**
 * Formats a YYYY-MM-DD date string as "<weekday>, <dd.mm.yyyy>" in German
 * (e.g. "Donnerstag, 26.11.2026").
 */
export function formatWeekdayWithDate(dateStr: string, locale: Locale = CURRENT_LOCALE): string {
  const d = parseDateKey(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const weekday = locale === 'en' ? WEEKDAYS_EN[d.getDay()] : WEEKDAYS_DE[d.getDay()];
  const formattedDate = formatDisplayDate(d);
  return `${weekday}, ${formattedDate}`;
}

/**
 * Formats an upcoming event into a two-line display structure for the Start Page:
 * - header: "Heute", "Morgen (<weekday>, <dd.mm.yyyy>)", or "<weekday>, <dd.mm.yyyy>" (with optional time or multi-day range)
 * - title: The event name (e.g. "Kochdienst" or "Elternabend Kleine Gruppe")
 */
export function formatUpcomingEventParts(
  event: UpcomingEvent,
  today: Date = new Date(),
  locale: Locale = CURRENT_LOCALE
): { header: string; title: string } {
  const diff = daysUntil(event.date, today);
  const shortDate = formatDisplayDate(event.date);
  const weekdayDate = formatWeekdayWithDate(event.date, locale);
  const todayWord = locale === 'en' ? 'Today' : 'Heute';
  const tomorrowWord = locale === 'en' ? 'Tomorrow' : 'Morgen';

  if (event.type === 'cooking_duty') {
    const title = locale === 'en' ? 'Cooking duty' : 'Kochdienst';
    if (diff <= 0) {
      return { header: todayWord, title };
    }
    if (diff === 1) {
      return { header: `${tomorrowWord} (${weekdayDate})`, title };
    }
    return { header: weekdayDate, title };
  }

  if (event.type === 'calendar_event') {
    const label = getCalendarEventDisplayTitle(
      {
        event_type: (event.event_type || 'custom') as CalendarEventType,
        title: event.title || '',
      },
      locale
    );
    const timeStr = formatEventTimeRange(event.start_time, event.end_time, locale);
    const isMultiDay = Boolean(event.end_date && event.end_date > event.date);

    if (isMultiDay && event.end_date) {
      const endShort = formatDisplayDate(event.end_date);
      if (diff <= 0) {
        return { header: `${todayWord} (${shortDate} – ${endShort})`, title: label };
      }
      if (diff === 1) {
        return { header: `${tomorrowWord} (${weekdayDate} – ${endShort})`, title: label };
      }
      return { header: `${weekdayDate} – ${endShort}`, title: label };
    }

    const timeSuffix = timeStr ? `, ${timeStr}` : '';
    if (diff <= 0) {
      return { header: `${todayWord}${timeSuffix}`, title: label };
    }
    if (diff === 1) {
      return { header: `${tomorrowWord} (${weekdayDate})${timeSuffix}`, title: label };
    }
    return { header: `${weekdayDate}${timeSuffix}`, title: label };
  }

  const label = event.title || event.type;
  if (diff <= 0) {
    return { header: todayWord, title: label };
  }
  if (diff === 1) {
    return { header: `${tomorrowWord} (${weekdayDate})`, title: label };
  }
  return { header: weekdayDate, title: label };
}

export function formatUpcomingEventText(
  event: UpcomingEvent,
  today: Date = new Date(),
  locale: Locale = CURRENT_LOCALE
): string {
  const { header, title } = formatUpcomingEventParts(event, today, locale);
  return `${header}: ${title}`;
}
