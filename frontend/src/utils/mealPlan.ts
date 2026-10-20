import { CURRENT_LOCALE, type Locale } from './i18n';

export interface DayMealData {
  date: string; // YYYY-MM-DD
  who_is_cooking: string;
  meal_components: string[];
}

/**
 * Returns the Monday for the week of the given date.
 * European/ISO week starts on Monday.
 */
export function getMondayOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

/**
 * Requirement:
 * "start on the current week, unless it's Thursday or Friday, then it should start on next week."
 */
export function getDefaultMealPlanMonday(now = new Date()): Date {
  const day = now.getDay();
  const currentMonday = getMondayOfWeek(now);
  if (day === 4 || day === 5) {
    // Thursday or Friday -> start on next week
    const nextMonday = new Date(currentMonday);
    nextMonday.setDate(nextMonday.getDate() + 7);
    return nextMonday;
  }
  return currentMonday;
}

/**
 * Formats a Date object as YYYY-MM-DD using local year, month, date.
 */
export function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parses a YYYY-MM-DD string into a Date at local midnight.
 */
export function parseDateKey(s: string): Date {
  const parts = s.split('T')[0].split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(s);
}

/**
 * Returns the 5 dates for Monday through Friday.
 */
export function getWeekDays(monday: Date): Date[] {
  return [0, 1, 2, 3, 4].map((offset) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
    d.setDate(d.getDate() + offset);
    return d;
  });
}

/**
 * Computes ISO 8601 week number and year.
 */
export function getISOWeekNumber(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}

export type WeekAnnotationType = 'current' | 'next';

/**
 * Returns whether selectedMonday is current week or next week, relative to today.
 */
export function getWeekAnnotationType(selectedMonday: Date, today = new Date()): WeekAnnotationType | null {
  const currentMonday = getMondayOfWeek(today);
  const nextMonday = new Date(currentMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);

  const selKey = formatDateKey(selectedMonday);
  const curKey = formatDateKey(currentMonday);
  const nextKey = formatDateKey(nextMonday);

  if (selKey === curKey) {
    return 'current';
  }
  if (selKey === nextKey) {
    return 'next';
  }
  return null;
}

/**
 * Requirement:
 * "the texts '(current week)' and '(next week)' should also be translated ('diese Woche') / ('nächste Woche')"
 */
export function getWeekAnnotation(
  selectedMonday: Date,
  today = new Date(),
  locale: Locale = CURRENT_LOCALE
): string | null {
  const type = getWeekAnnotationType(selectedMonday, today);
  if (type === 'current') {
    return locale === 'en' ? '(this week)' : '(diese Woche)';
  }
  if (type === 'next') {
    return locale === 'en' ? '(next week)' : '(nächste Woche)';
  }
  return null;
}

/**
 * Formats a Monday-Friday date range, e.g. "19.10. – 23.10.2026".
 */
export function formatWeekRange(monday: Date, locale: Locale = CURRENT_LOCALE): string {
  const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);
  const mDay = String(monday.getDate()).padStart(2, '0');
  const mMonth = String(monday.getMonth() + 1).padStart(2, '0');
  const fDay = String(friday.getDate()).padStart(2, '0');
  const fMonth = String(friday.getMonth() + 1).padStart(2, '0');
  const fYear = friday.getFullYear();

  if (locale === 'en') {
    return `${mMonth}/${mDay} – ${fMonth}/${fDay}/${fYear}`;
  }
  return `${mDay}.${mMonth}. – ${fDay}.${fMonth}.${fYear}`;
}

/**
 * Returns day name and short date for a day, e.g. { dayName: 'Montag', dateStr: '19.10.' }.
 */
export function formatDayHeader(date: Date, locale: Locale = CURRENT_LOCALE): { dayName: string; dateStr: string } {
  const dayNamesDe = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const dayNamesEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const dayIndex = date.getDay();
  const dayName = locale === 'en' ? dayNamesEn[dayIndex] : dayNamesDe[dayIndex];

  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const dateStr = locale === 'en' ? `${m}/${d}` : `${d}.${m}.`;

  return { dayName, dateStr };
}
