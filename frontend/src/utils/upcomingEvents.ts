import { CURRENT_LOCALE, formatDisplayDate, t, type Locale } from './i18n';
import { daysUntil } from './hygieneMessage';
import { parseDateKey } from './mealPlan';

export type UpcomingEventType = 'cooking_duty' | (string & {});

export interface UpcomingEvent {
  type: UpcomingEventType;
  date: string; // YYYY-MM-DD
  title?: string;
}

const WEEKDAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
 * Formats an upcoming personal event for display in the Start Page events box:
 * - Today (diff === 0): "Heute (<dd.mm.yyyy>) Kochdienst."
 * - Tomorrow (diff === 1): "Kochdienst: <weekday, dd.mm.yyyy> (morgen)"
 * - Day after tomorrow (diff === 2): "Kochdienst: <weekday, dd.mm.yyyy> (übermorgen)"
 * - 3+ days out: "Kochdienst: <weekday, dd.mm.yyyy>"
 */
export function formatUpcomingEventText(
  event: UpcomingEvent,
  today: Date = new Date(),
  locale: Locale = CURRENT_LOCALE
): string {
  const diff = daysUntil(event.date, today);
  const shortDate = formatDisplayDate(event.date);
  const weekdayDate = formatWeekdayWithDate(event.date, locale);

  if (event.type === 'cooking_duty') {
    if (diff === 0) {
      return (t('upcomingCookingDutyToday') || 'Heute ({date}) Kochdienst.').replace('{date}', shortDate);
    }
    let suffix = '';
    if (diff === 1) {
      suffix = ` (${t('tomorrowLower') || 'morgen'})`;
    } else if (diff === 2) {
      suffix = ` (${t('dayAfterTomorrowLower') || 'übermorgen'})`;
    }
    const prefix = t('nextCookingDutyPrefix') || 'Kochdienst:';
    return `${prefix} ${weekdayDate}${suffix}`;
  }

  // Extensible fallback for future event types
  const label = event.title || event.type;
  if (diff === 0) {
    return locale === 'en' ? `Today (${shortDate}) ${label}.` : `Heute (${shortDate}) ${label}.`;
  }
  let suffix = '';
  if (diff === 1) {
    suffix = ` (${t('tomorrowLower') || 'morgen'})`;
  } else if (diff === 2) {
    suffix = ` (${t('dayAfterTomorrowLower') || 'übermorgen'})`;
  }
  return `${label}: ${weekdayDate}${suffix}`;
}
