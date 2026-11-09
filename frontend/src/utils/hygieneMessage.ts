import { t, formatDisplayDate } from './i18n';

export interface HygieneMessageStatus {
  needs_instruction?: boolean;
  next_due_date?: string;
}

export type HygieneMessageKind = 'noHistory' | 'upcoming' | 'overdue';

export interface HygieneMessage {
  kind: HygieneMessageKind;
  text: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from today (local) until the given YYYY-MM-DD date (negative if in the past). */
export const daysUntil = (dateStr: string, now: Date = new Date()): number => {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const due = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / MS_PER_DAY);
};

const formatDays = (n: number): string =>
  n === 1 ? t('hygieneDaysOne') : t('hygieneDaysMany').replace('{n}', String(n));

/**
 * Builds the user-facing hint for a due hygiene follow-up instruction, shared by the
 * start page task card and the personal hygiene tab.
 */
export const getHygieneMessage = (status: HygieneMessageStatus | null | undefined, now: Date = new Date()): HygieneMessage | null => {
  if (!status?.needs_instruction) return null;

  if (!status.next_due_date) {
    return { kind: 'noHistory', text: t('hygieneMsgNoHistory') };
  }

  const days = daysUntil(status.next_due_date, now);
  if (days < 0) {
    return { kind: 'overdue', text: t('hygieneMsgOverdue').replace('{days}', formatDays(-days)) };
  }
  return {
    kind: 'upcoming',
    text: t('hygieneMsgUpcoming')
      .replace('{date}', formatDisplayDate(status.next_due_date))
      .replace('{days}', formatDays(days)),
  };
};
