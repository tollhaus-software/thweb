import { CURRENT_LOCALE, formatDisplayDate, t, type Locale } from './i18n';
import { formatDateKey, getMondayOfWeek, parseDateKey } from './mealPlan';

export type CalendarEventType =
  | 'schliesszeit'
  | 'schliesszeit_halbtags'
  | 'feiertag'
  | 'ferien'
  | 'paedagogischer_tag'
  | 'teamausflug'
  | 'ea_kleine_gruppe'
  | 'ea_grosse_gruppe'
  | 'ea_hort'
  | 'ea_gesamt'
  | 'ea_gesamt_and_mgv'
  | 'putz_we'
  | 'bau_we'
  | 'garten_we'
  | 'laternenfest'
  | 'weihnachtsfeier'
  | 'sommerfest'
  | 'cooking_duty'
  | 'custom';

export interface CalendarEvent {
  id: string;
  event_type: CalendarEventType;
  title: string;
  description: string;
  location?: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  start_time?: string | null; // HH:MM or null/undefined
  end_time?: string | null;   // HH:MM or null/undefined
  editable?: boolean;
  created_by_email?: string;
  updated_by_email?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EventTypeMeta {
  type: CalendarEventType;
  group: 'closing' | 'ea' | 'community' | 'custom';
  expectsSpecificTime: boolean;
  editable?: boolean;
  labelDe: string;
  labelEn: string;
  shortDe: string;
  shortEn: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const EVENT_TYPE_LIST: EventTypeMeta[] = [
  {
    type: 'schliesszeit',
    group: 'closing',
    expectsSpecificTime: false,
    labelDe: 'Schließzeit Tollhaus',
    labelEn: 'Tollhaus Closed',
    shortDe: 'Schließzeit',
    shortEn: 'Closed',
    color: '#0f172a',
    bgColor: '#92cddc',
    borderColor: '#5baec4',
  },
  {
    type: 'schliesszeit_halbtags',
    group: 'closing',
    expectsSpecificTime: false,
    labelDe: 'Schließzeit Tollhaus (halbtags)',
    labelEn: 'Half-Day Closing',
    shortDe: 'Schließzeit (½)',
    shortEn: 'Half-Day Closed',
    color: '#0f172a',
    bgColor: '#b8dfe9',
    borderColor: '#7bc0d2',
  },
  {
    type: 'ferien',
    group: 'closing',
    expectsSpecificTime: false,
    labelDe: 'Ferien / unterrichtsfreie Tage',
    labelEn: 'School Holidays',
    shortDe: 'Ferien',
    shortEn: 'Holidays',
    color: '#3f1d1d',
    bgColor: '#e5b8b7',
    borderColor: '#c98e8d',
  },
  {
    type: 'paedagogischer_tag',
    group: 'closing',
    expectsSpecificTime: false,
    labelDe: 'Pädagogischer Tag',
    labelEn: 'Pedagogical Day',
    shortDe: 'Päd. Tag',
    shortEn: 'Ped. Day',
    color: '#0f172a',
    bgColor: '#92cddc',
    borderColor: '#5baec4',
  },
  {
    type: 'teamausflug',
    group: 'closing',
    expectsSpecificTime: false,
    labelDe: 'Teamausflug',
    labelEn: 'Team Outing',
    shortDe: 'Teamausflug',
    shortEn: 'Team Outing',
    color: '#1e293b',
    bgColor: '#dce6f1',
    borderColor: '#a6bfd9',
  },
  {
    type: 'ea_kleine_gruppe',
    group: 'ea',
    expectsSpecificTime: true,
    labelDe: 'Elternabend Kleine Gruppe',
    labelEn: "Parents' Evening (Small Group)",
    shortDe: 'EA Kleine Gr.',
    shortEn: 'PE Small Gr.',
    color: '#1e2e10',
    bgColor: '#d6e3bc',
    borderColor: '#a8c07a',
  },
  {
    type: 'ea_grosse_gruppe',
    group: 'ea',
    expectsSpecificTime: true,
    labelDe: 'Elternabend Große Gruppe',
    labelEn: "Parents' Evening (Large Group)",
    shortDe: 'EA Große Gr.',
    shortEn: 'PE Large Gr.',
    color: '#251b33',
    bgColor: '#ccc0d9',
    borderColor: '#a693bd',
  },
  {
    type: 'ea_hort',
    group: 'ea',
    expectsSpecificTime: true,
    labelDe: 'Elternabend Hort',
    labelEn: "Parents' Evening (Hort)",
    shortDe: 'EA Hort',
    shortEn: 'PE Hort',
    color: '#ffffff',
    bgColor: '#748c42',
    borderColor: '#5c7033',
  },
  {
    type: 'ea_gesamt',
    group: 'ea',
    expectsSpecificTime: true,
    labelDe: 'Elternabend Gesamt',
    labelEn: "General Parents' Evening",
    shortDe: 'EA Gesamt',
    shortEn: 'PE All',
    color: '#ffffff',
    bgColor: '#c0504d',
    borderColor: '#9e3c39',
  },
  {
    type: 'ea_gesamt_and_mgv',
    group: 'ea',
    expectsSpecificTime: true,
    labelDe: 'Elternabend Gesamt & MGV',
    labelEn: "General Parents' Evening & AGM",
    shortDe: 'EA Gesamt & MGV',
    shortEn: 'PE All & AGM',
    color: '#ffffff',
    bgColor: '#c0504d',
    borderColor: '#9e3c39',
  },
  {
    type: 'putz_we',
    group: 'community',
    expectsSpecificTime: true,
    labelDe: 'Putz-Wochenende',
    labelEn: 'Cleaning Weekend',
    shortDe: 'Putz-WE',
    shortEn: 'Clean WE',
    color: '#1f2937',
    bgColor: '#ffff00',
    borderColor: '#d4b106',
  },
  {
    type: 'bau_we',
    group: 'community',
    expectsSpecificTime: true,
    labelDe: 'Bau-Wochenende',
    labelEn: 'Construction Weekend',
    shortDe: 'Bau-WE',
    shortEn: 'Build WE',
    color: '#1f2937',
    bgColor: '#ffff00',
    borderColor: '#d4b106',
  },
  {
    type: 'garten_we',
    group: 'community',
    expectsSpecificTime: true,
    labelDe: 'Garten-Wochenende',
    labelEn: 'Garden Weekend',
    shortDe: 'Garten-WE',
    shortEn: 'Garden WE',
    color: '#1f2937',
    bgColor: '#ffff00',
    borderColor: '#d4b106',
  },
  {
    type: 'laternenfest',
    group: 'community',
    expectsSpecificTime: true,
    labelDe: 'Laternenfest',
    labelEn: 'Lantern Festival',
    shortDe: 'Laternenfest',
    shortEn: 'Lantern Fest',
    color: '#1f2937',
    bgColor: '#ffff00',
    borderColor: '#d4b106',
  },
  {
    type: 'weihnachtsfeier',
    group: 'community',
    expectsSpecificTime: true,
    labelDe: 'Weihnachtsfeier',
    labelEn: 'Christmas Party',
    shortDe: 'Weihnachtsfeier',
    shortEn: 'Xmas Party',
    color: '#1f2937',
    bgColor: '#ffff00',
    borderColor: '#d4b106',
  },
  {
    type: 'sommerfest',
    group: 'community',
    expectsSpecificTime: true,
    labelDe: 'Sommerfest',
    labelEn: 'Summer Festival',
    shortDe: 'Sommerfest',
    shortEn: 'Summer Fest',
    color: '#1f2937',
    bgColor: '#ffff00',
    borderColor: '#d4b106',
  },
  {
    type: 'custom',
    group: 'custom',
    expectsSpecificTime: false,
    labelDe: 'Sonstiges (eigener Titel)',
    labelEn: 'Custom (own title)',
    shortDe: 'Sonstiges',
    shortEn: 'Custom',
    color: '#1f2937',
    bgColor: '#ffff00',
    borderColor: '#d4b106',
  },
];

const COOKING_DUTY_META: EventTypeMeta = {
  type: 'cooking_duty',
  group: 'custom',
  expectsSpecificTime: false,
  editable: false,
  labelDe: 'Kochdienst',
  labelEn: 'Cooking duty',
  shortDe: 'Kochdienst',
  shortEn: 'Cooking duty',
  color: '#7c2d12',
  bgColor: '#ffcc99',
  borderColor: '#f59e0b',
};

const FEIERTAG_META: EventTypeMeta = {
  type: 'feiertag',
  group: 'closing',
  expectsSpecificTime: false,
  editable: false,
  labelDe: 'Feiertag',
  labelEn: 'Public Holiday',
  shortDe: 'Feiertag',
  shortEn: 'Holiday',
  color: '#0f172a',
  bgColor: '#92cddc',
  borderColor: '#5baec4',
};

export const EVENT_TYPE_MAP: Record<string, EventTypeMeta> = {
  ...Object.fromEntries(EVENT_TYPE_LIST.map((m) => [m.type, m])),
  cooking_duty: COOKING_DUTY_META,
  feiertag: FEIERTAG_META,
};

export function isValidCalendarEventType(val: string): val is CalendarEventType {
  const meta = EVENT_TYPE_MAP[val];
  return Boolean(meta && meta.editable !== false);
}

export function getEventTypeMeta(eventType: string): EventTypeMeta {
  return EVENT_TYPE_MAP[eventType] || EVENT_TYPE_MAP.custom;
}

export function isCalendarEventEditable(ev?: Pick<CalendarEvent, 'event_type' | 'editable'> | null): boolean {
  if (!ev) return true;
  if (typeof ev.editable === 'boolean') return ev.editable;
  return getEventTypeMeta(ev.event_type).editable !== false;
}

export function doesEventExpectSpecificTime(eventType: string): boolean {
  return getEventTypeMeta(eventType).expectsSpecificTime;
}

export function getEventTypeLabel(eventType: string, locale: Locale = CURRENT_LOCALE): string {
  const meta = getEventTypeMeta(eventType);
  return locale === 'en' ? meta.labelEn : meta.labelDe;
}

export function getCalendarEventDisplayTitle(
  ev: Pick<CalendarEvent, 'event_type' | 'title'>,
  locale: Locale = CURRENT_LOCALE
): string {
  const trimmedTitle = (ev.title || '').trim();
  if (ev.event_type === 'custom') {
    return trimmedTitle || (locale === 'en' ? 'Event' : 'Termin');
  }
  const base = getEventTypeLabel(ev.event_type, locale);
  if (trimmedTitle && trimmedTitle.toLowerCase() !== base.toLowerCase()) {
    return `${base} (${trimmedTitle})`;
  }
  return base;
}

export function getCalendarEventShortLabel(
  ev: Pick<CalendarEvent, 'event_type' | 'title'>,
  locale: Locale = CURRENT_LOCALE
): string {
  const trimmedTitle = (ev.title || '').trim();
  if (ev.event_type === 'custom') {
    return trimmedTitle || (locale === 'en' ? 'Event' : 'Termin');
  }
  const meta = getEventTypeMeta(ev.event_type);
  const short = locale === 'en' ? meta.shortEn : meta.shortDe;
  if (trimmedTitle && trimmedTitle.toLowerCase() !== short.toLowerCase() && trimmedTitle.toLowerCase() !== getEventTypeLabel(ev.event_type, locale).toLowerCase()) {
    return `${short} (${trimmedTitle})`;
  }
  return short;
}

export function formatEventTimeRange(
  startTime?: string | null,
  endTime?: string | null,
  locale: Locale = CURRENT_LOCALE
): string {
  const st = (startTime || '').trim();
  if (!st) return '';
  const et = (endTime || '').trim();
  const suffix = locale === 'en' ? '' : ' Uhr';
  if (et) {
    return `${st}–${et}${suffix}`;
  }
  return `${st}${suffix}`;
}

export function formatEventDateRange(
  startDate: string,
  endDate: string
): string {
  if (!endDate || endDate === startDate) {
    return formatDisplayDate(startDate);
  }
  return `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`;
}

/**
 * Returns full 7-day weeks (Mon..Sun) covering the specified year and 0-indexed month.
 */
export function getMonth7ColDays(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const startMonday = getMondayOfWeek(firstOfMonth);
  const endMonday = getMondayOfWeek(lastOfMonth);
  const endSunday = new Date(endMonday.getFullYear(), endMonday.getMonth(), endMonday.getDate() + 6);

  const days: Date[] = [];
  const cur = new Date(startMonday);
  while (cur <= endSunday) {
    days.push(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/**
 * Returns the 7 days (Mon..Sun) starting at the given Monday.
 */
export function getWeek7Days(monday: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  }
  return days;
}

export function format7DayWeekRange(monday: Date): string {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export function doesCalendarEventMatchSearch(ev: CalendarEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    getCalendarEventDisplayTitle(ev, 'de').toLowerCase().includes(q) ||
    getCalendarEventDisplayTitle(ev, 'en').toLowerCase().includes(q) ||
    getCalendarEventShortLabel(ev, 'de').toLowerCase().includes(q) ||
    (ev.title || '').toLowerCase().includes(q) ||
    (ev.description || '').toLowerCase().includes(q) ||
    ev.event_type.toLowerCase().includes(q)
  );
}

export function getDayEventsBgClass(dayEvents: CalendarEvent[]): string {
  const hasClosing = dayEvents.some(
    (e) =>
      e.event_type === 'schliesszeit' ||
      e.event_type === 'schliesszeit_halbtags' ||
      e.event_type === 'paedagogischer_tag' ||
      e.event_type === 'feiertag'
  );
  if (hasClosing) return 'bg-closing';
  const hasTeamausflug = dayEvents.some((e) => e.event_type === 'teamausflug');
  if (hasTeamausflug) return 'bg-teamausflug';
  const hasFerien = dayEvents.some((e) => e.event_type === 'ferien');
  if (hasFerien) return 'bg-ferien';
  return 'bg-default';
}

// ============================================================================
// TSV Import Specification, Prompt & Parser
// ============================================================================

export interface ImportPreviewRow {
  rowId: string;
  lineNumber: number;
  included: boolean;
  start_date: string;
  end_date: string;
  event_type: string;
  start_time: string;
  end_time: string;
  title: string;
  description: string;
  errors: string[];
  isDuplicate: boolean;
}

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidIsoDate(s: string): boolean {
  if (!DATE_ISO_RE.test(s)) return false;
  const d = parseDateKey(s);
  return !isNaN(d.getTime()) && formatDateKey(d) === s;
}

export function calendarEventDedupSignature(ev: {
  event_type: string;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  title?: string | null;
}): string {
  return [
    (ev.event_type || '').trim(),
    (ev.start_date || '').trim(),
    (ev.end_date || ev.start_date || '').trim(),
    (ev.start_time || '').trim(),
    (ev.title || '').trim().toLowerCase(),
  ].join('|');
}

export function validateImportPreviewRow(
  row: Omit<ImportPreviewRow, 'errors' | 'isDuplicate' | 'included'>,
  existingSignatures: Set<string>,
  seenBatchSignatures: Set<string>
): { errors: string[]; isDuplicate: boolean } {
  const errors: string[] = [];
  const sd = row.start_date.trim();
  const ed = (row.end_date || row.start_date).trim();
  const et = row.event_type.trim();
  const st = row.start_time.trim();
  const endT = row.end_time.trim();
  const title = row.title.trim();

  if (!isValidIsoDate(sd)) {
    errors.push(t('eventsImportErrStartDate') || 'Ungültiges Startdatum (YYYY-MM-DD)');
  }
  if (!isValidIsoDate(ed)) {
    errors.push(t('eventsImportErrEndDate') || 'Ungültiges Enddatum (YYYY-MM-DD)');
  } else if (isValidIsoDate(sd) && ed < sd) {
    errors.push(t('eventsImportErrDateOrder') || 'Enddatum liegt vor Startdatum');
  }

  if (!isValidCalendarEventType(et)) {
    errors.push(`${t('eventsImportErrType') || 'Unbekannter Typ'}: "${et || '–'}"`);
  } else {
    if (et === 'custom' && !title) {
      errors.push(t('eventsImportErrCustomTitle') || 'Titel ist bei Typ "custom" erforderlich');
    }
    if (doesEventExpectSpecificTime(et) && isValidIsoDate(sd) && isValidIsoDate(ed) && ed !== sd) {
      errors.push(t('eventsImportErrMultiDayNotAllowed') || 'Dieser Termintyp darf nicht mehrtägig sein');
    }
  }

  if (st && !TIME_HHMM_RE.test(st)) {
    errors.push(t('eventsImportErrStartTime') || 'Ungültige Startzeit (HH:MM)');
  }
  if (endT && !TIME_HHMM_RE.test(endT)) {
    errors.push(t('eventsImportErrEndTime') || 'Ungültige Endzeit (HH:MM)');
  }
  if (!st && endT) {
    errors.push(t('eventsImportErrEndWithoutStart') || 'Endzeit ohne Startzeit nicht erlaubt');
  }
  if (st && endT && TIME_HHMM_RE.test(st) && TIME_HHMM_RE.test(endT) && sd === ed && endT < st) {
    errors.push(t('eventsImportErrTimeOrder') || 'Endzeit liegt vor Startzeit');
  }

  const sig = calendarEventDedupSignature({
    event_type: et,
    start_date: sd,
    end_date: ed,
    start_time: st,
    title,
  });
  const isDuplicate = existingSignatures.has(sig) || seenBatchSignatures.has(sig);
  if (errors.length === 0) {
    seenBatchSignatures.add(sig);
  }

  return { errors, isDuplicate };
}

export function revalidatePreviewRows(
  rows: ImportPreviewRow[],
  existingEvents: CalendarEvent[],
  mode: 'skip_duplicates' | 'replace_range'
): ImportPreviewRow[] {
  const existingSigs = new Set<string>();
  if (mode === 'skip_duplicates') {
    for (const ev of existingEvents) {
      existingSigs.add(calendarEventDedupSignature(ev));
    }
  }
  const seenBatch = new Set<string>();
  return rows.map((r) => {
    const { errors, isDuplicate } = validateImportPreviewRow(r, existingSigs, seenBatch);
    return {
      ...r,
      errors,
      isDuplicate,
    };
  });
}

export function parseEventsTsv(
  rawInput: string,
  existingEvents: CalendarEvent[] = [],
  mode: 'skip_duplicates' | 'replace_range' = 'skip_duplicates'
): ImportPreviewRow[] {
  let cleaned = rawInput.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!cleaned) return [];

  // Strip optional markdown code fences (e.g. ```tsv ... ```)
  const fenceMatch = cleaned.match(/^```(?:tsv|csv|text|plaintext)?\s*\n([\s\S]*?)\n?```$/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const lines = cleaned.split('\n');
  const existingSigs = new Set<string>();
  if (mode === 'skip_duplicates') {
    for (const ev of existingEvents) {
      existingSigs.add(calendarEventDedupSignature(ev));
    }
  }
  const seenBatch = new Set<string>();
  const result: ImportPreviewRow[] = [];

  lines.forEach((rawLine, idx) => {
    if (!rawLine.trim()) return;
    const cols = rawLine.split('\t');

    // Skip header row if first column is "start_date"
    if (idx === 0 && cols[0].trim().toLowerCase() === 'start_date') {
      return;
    }

    const start_date = (cols[0] || '').trim();
    const end_date = (cols[1] || start_date).trim() || start_date;
    const event_type = (cols[2] || '').trim();
    const start_time = (cols[3] || '').trim();
    const end_time = (cols[4] || '').trim();
    const title = (cols[5] || '').trim();
    const description = (cols[6] || '').replace(/\\n/g, '\n').trim();

    const baseRow = {
      rowId: `row-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      lineNumber: idx + 1,
      start_date,
      end_date,
      event_type,
      start_time,
      end_time,
      title,
      description,
    };

    const { errors, isDuplicate } = validateImportPreviewRow(baseRow, existingSigs, seenBatch);
    result.push({
      ...baseRow,
      errors,
      isDuplicate,
      included: errors.length === 0 && !isDuplicate,
    });
  });

  return result;
}

export function buildCalendarLlmPromptSpec(locale: Locale = CURRENT_LOCALE): string {
  if (locale === 'en') {
    return `Extract all Tollhaus events, closing days, and Stuttgart school holidays from the attached PDF calendar into a strict TSV (tab-separated values) table.

OUTPUT FORMAT:
- Output ONLY a single \`\`\`tsv code block with a header row and TAB-separated columns (7 columns per line):
start_date\tend_date\tevent_type\tstart_time\tend_time\ttitle\tdescription

COLUMN RULES:
1. start_date: YYYY-MM-DD (first day of the event).
2. end_date: YYYY-MM-DD (inclusive last day; equal to start_date for single-day events). Merge consecutive days of the same multi-day block (e.g. Ferien, Schließzeit, TH WE, Hortfreizeit) into ONE row!
3. event_type: MUST be one of these exact values:
   - schliesszeit           (Tollhaus full-day closing — often shown ONLY via blue-grey cell background color without text!)
   - schliesszeit_halbtags  (Tollhaus half-day closing — often shown as a diagonal half-filled cell without text!)
   - ferien                 (Stuttgart school holidays / unterrichtsfreie Tage — shown via mauve/rose background on the left side of the day cells)
   - paedagogischer_tag     (Päd. Tag / Pädagogischer Tag)
   - teamausflug            (Team Ausflug / Teamausflug)
   - ea_kleine_gruppe       (EA kl. Gruppe / Elternabend kleine Gruppe)
   - ea_grosse_gruppe       (EA gr. Gruppe / Elternabend große Gruppe)
   - ea_hort                (EA Hort / Elternabend Hort)
   - ea_gesamt              (EA Gesamt / Elternabend Gesamt, when NOT combined with MGV)
   - ea_gesamt_and_mgv      (MGV EA Gesamt)
   - putz_we                (PUTZ WE)
   - bau_we                 (BAU WE)
   - garten_we              (Garten WE)
   - laternenfest           (Laternenfest)
   - weihnachtsfeier        (Weihnachtsfeier)
   - sommerfest             (Sommerfest)
   - custom                 (Any other Tollhaus event, e.g. Weihnachtsmarkt, TH WE, Hortfreizeit — requires title!)
4. start_time: HH:MM (24h) if a clock time is stated, otherwise leave empty.
5. end_time: HH:MM (24h) if an end clock time is stated, otherwise leave empty.
6. title: Required when event_type is "custom" (e.g. "Weihnachtsmarkt", "TH-Wochenende", "Hortfreizeit"). Leave empty for standard types unless there is an extra short label. Note: words split across consecutive day rows like "Hort-" / "frei-" / "zeit" mean one multi-day custom event titled "Hortfreizeit"!
7. description: Optional extra notes (leave empty if none; escape line breaks as \\n).

IMPORTANT CALENDAR RULES:
- SKIP Baden-Württemberg statutory public holidays (Feiertage in BW, red text/pink fill: Neujahr, Hl. 3 Könige, Karfreitag, Ostersonntag, Ostermontag, Tag der Arbeit, Chr. Himmelfahrt, Pfingstsonntag, Pfingstmontag, Fronleichnam, Tag d. dt. Einheit, Reformationstag, Allerheiligen, Heilig Abend, Weihnachten, Silvester). However, if a continuous schliesszeit or ferien block spans across public holidays or weekends, keep it as one unbroken start_date..end_date block!
- Ignore Monday ISO week numbers (1–53).
- Multiple events CAN overlap on the same dates (e.g. ferien + schliesszeit, or ferien + Hortfreizeit) — emit a separate TSV row for each.`;
  }

  return `Bitte extrahiere alle Tollhaus-Termine, Schließzeiten und Stuttgarter Schulferien aus dem angehängten PDF-Kalender in eine strikte TSV-Tabelle (Tab-getrennte Werte).

AUSGABEFORMAT:
- Gib AUSSCHLIESSLICH einen einzelnen \`\`\`tsv Code-Block mit Kopfzeile und TAB-getrennten Spalten aus (genau 7 Spalten pro Zeile):
start_date\tend_date\tevent_type\tstart_time\tend_time\ttitle\tdescription

SPALTEN-REGELN:
1. start_date: YYYY-MM-DD (erster Tag des Termins).
2. end_date: YYYY-MM-DD (einschließlich letzter Tag; bei eintägigen Terminen identisch mit start_date). Aufeinanderfolgende Tage desselben mehrtägigen Zeitraums (z. B. Ferien, Schließzeit, TH WE, Hortfreizeit) zu EINER Zeile zusammenfassen!
3. event_type: MUSS exakt einer dieser Werte sein:
   - schliesszeit           (Ganztägige Schließzeit Tollhaus – im PDF oft NUR über die blaugraue Hintergrundfarbe der Zelle ohne Text markiert!)
   - schliesszeit_halbtags  (Halbtägige Schließzeit Tollhaus – im PDF oft durch eine diagonal halb gefüllte Zelle ohne Text markiert!)
   - ferien                 (Ferien / unterrichtsfreie Tage in Stuttgart – im PDF durch altrosa/violette Hintergrundfarbe in der linken Zellhälfte markiert)
   - paedagogischer_tag     (Päd. Tag / Pädagogischer Tag)
   - teamausflug            (Team Ausflug / Teamausflug)
   - ea_kleine_gruppe       (EA kl. Gruppe / Elternabend kleine Gruppe)
   - ea_grosse_gruppe       (EA gr. Gruppe / Elternabend große Gruppe)
   - ea_hort                (EA Hort / Elternabend Hort)
   - ea_gesamt              (EA Gesamt / Elternabend Gesamt, sofern NICHT mit MGV kombiniert)
   - ea_gesamt_and_mgv      (MGV EA Gesamt)
   - putz_we                (PUTZ WE)
   - bau_we                 (BAU WE)
   - garten_we              (Garten WE)
   - laternenfest           (Laternenfest)
   - weihnachtsfeier        (Weihnachtsfeier)
   - sommerfest             (Sommerfest)
   - custom                 (Alle sonstigen Tollhaus-Termine wie z. B. Weihnachtsmarkt, TH WE, Hortfreizeit – benötigt zwingend title!)
4. start_time: HH:MM (24h), falls eine Uhrzeit angegeben ist, sonst leer lassen.
5. end_time: HH:MM (24h), falls eine Enduhrzeit angegeben ist, sonst leer lassen.
6. title: Pflichtfeld wenn event_type = "custom" (z. B. "Weihnachtsmarkt", "TH-Wochenende", "Hortfreizeit"). Bei bekannten Typen leer lassen, außer es gibt einen wichtigen Kurzzusatz. Achtung: Über mehrere Tageszeilen getrennte Wörter wie "Hort-" / "frei-" / "zeit" bilden EINEN mehrtägigen Termin vom Typ custom mit title "Hortfreizeit"!
7. description: Optionale Zusatzinfos (sonst leer lassen; Zeilenumbrüche als \\n schreiben).

WICHTIGE KALENDER-REGELN:
- Gesetzliche Feiertage in BW (rote Schrift / rosa Hintergrund: Neujahr, hl. 3 Könige, Karfreitag, Ostersonntag, Ostermontag, Tag der Arbeit, Chr. Himmelf., Pfingstsonntag, Pfingstmontag, Fronleichnam, Tag d. dt. Einheit, Reformationstag, Allerheiligen, Heilig Abend, Weihnachten, Silvester) NICHT als eigene Zeilen exportieren! Wenn aber ein durchgehender schliesszeit- oder ferien-Block über Wochenenden oder Feiertage hinweg läuft, den Zeitraum NICHT unterbrechen, sondern als durchgehende Zeile (start_date bis end_date) ausgeben.
- Kalenderwochen-Zahlen an Montagen (1–53) ignorieren.
- Termine können sich am selben Tag überlappen (z. B. ferien + schliesszeit oder ferien + Hortfreizeit) – gib für jeden davon eine eigene TSV-Zeile aus.`;
}
