import type { ChildGroupChange } from '../types/family';
import { CURRENT_LOCALE, formatDisplayDate } from './i18n';

export const getGroupShortLabel = (targetGroup: number): string => {
  switch (targetGroup) {
    case 1:
      return 'Kleine Gr.';
    case 2:
      return 'Grosse Gr.';
    case 3:
      return 'Hort';
    default:
      return String(targetGroup);
  }
};

export interface ChildGroupInfo {
  currentGroup: number | null;
  groupLabel: string;
  startDate: string | null;
  exitDate: string | null;
  isExited: boolean;
  isFuture: boolean;
  groupName?: string;
  sinceText?: string;
  futureDateText?: string;
  nextChangeText?: string;
}

export const getChildGroupInfo = (changes: ChildGroupChange[] | undefined): ChildGroupInfo => {
  if (!changes || changes.length === 0) {
    return {
      currentGroup: null,
      groupLabel: '-',
      startDate: null,
      exitDate: null,
      isExited: false,
      isFuture: false,
    };
  }

  const sorted = [...changes].sort((a, b) => a.change_date.localeCompare(b.change_date));
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const firstEnroll = sorted.find((c) => c.target_group > 0);
  const startDate = firstEnroll ? firstEnroll.change_date : null;

  // Case 1: If child has not started yet (the earliest group change with target group != 0 is in the future),
  // it formats as <group> and <clock symbol> ab <date>.
  if (firstEnroll && firstEnroll.change_date.split('T')[0] > todayStr) {
    const groupName = getGroupShortLabel(firstEnroll.target_group);
    const dateStr = formatDisplayDate(firstEnroll.change_date);
    const abWord = CURRENT_LOCALE === 'de' ? 'ab' : 'from';
    const futureDateText = `${abWord} ${dateStr}`;
    const groupLabel = `→ ${groupName} ${futureDateText}`;
    return {
      currentGroup: firstEnroll.target_group,
      groupLabel,
      groupName,
      futureDateText,
      startDate,
      exitDate: null,
      isExited: false,
      isFuture: true,
    };
  }

  const effectiveSoFar = sorted.filter((c) => c.change_date.split('T')[0] <= todayStr);
  if (effectiveSoFar.length === 0) {
    return {
      currentGroup: null,
      groupLabel: '-',
      startDate,
      exitDate: null,
      isExited: false,
      isFuture: false,
    };
  }

  const latest = effectiveSoFar[effectiveSoFar.length - 1];

  // Case 2: If the child has left the group (the most recent group change, as of today, has target group = 0),
  // it should say "left <last group name> on <end date>" (en) / "Betreuungsende <end date>, zuletzt <last group name>" (de).
  // If no previous group was recorded, it simply says "Betreuungsende <end date>" (de) / "left on <end date>" (en).
  if (latest.target_group === 0) {
    const prevEnroll = [...sorted].filter((c) => c.target_group > 0 && c.change_date.split('T')[0] <= latest.change_date.split('T')[0]).pop()
      || [...sorted].reverse().find((c) => c.target_group > 0);
    const lastGroupName = prevEnroll ? getGroupShortLabel(prevEnroll.target_group) : '';
    const endDateStr = formatDisplayDate(latest.change_date);
    const groupLabel = CURRENT_LOCALE === 'de'
      ? (lastGroupName ? `Betreuungsende ${endDateStr}, zuletzt ${lastGroupName}` : `Betreuungsende ${endDateStr}`)
      : (lastGroupName ? `left ${lastGroupName} on ${endDateStr}` : `left on ${endDateStr}`);
    return {
      currentGroup: 0,
      groupLabel,
      startDate,
      exitDate: latest.change_date,
      isExited: true,
      isFuture: false,
    };
  }

  // Case 3: Otherwise (the child is currently in a group), it should contain the group name,
  // suffixed with "since <date>" and next planned group change if any:
  // - if there is no next planned group change, leave it empty there
  // - if the next planned group change is a non-exit change, write there (-> <group name> ab <next group change date>)
  // - if the next planned group change is an exit, write (-> bis <exit group change date>)
  const groupName = getGroupShortLabel(latest.target_group);
  const changeDateStr = formatDisplayDate(latest.change_date);
  const sinceWord = CURRENT_LOCALE === 'de' ? 'seit' : 'since';
  const sinceText = `${sinceWord} ${changeDateStr}`;

  const futureChanges = sorted.filter((c) => c.change_date.split('T')[0] > todayStr);
  const nextChange = futureChanges.length > 0 ? futureChanges[0] : null;
  let nextChangeText = '';
  if (nextChange) {
    const nextDateStr = formatDisplayDate(nextChange.change_date);
    if (nextChange.target_group > 0) {
      const nextGroupName = getGroupShortLabel(nextChange.target_group);
      const abWord = CURRENT_LOCALE === 'de' ? 'ab' : 'from';
      nextChangeText = `(-> ${nextGroupName} ${abWord} ${nextDateStr})`;
    } else {
      const bisWord = CURRENT_LOCALE === 'de' ? 'bis' : 'until';
      nextChangeText = `(-> ${bisWord} ${nextDateStr})`;
    }
  }

  const groupLabel = nextChangeText
    ? `${groupName} ${sinceText} ${nextChangeText}`
    : `${groupName} ${sinceText}`;

  return {
    currentGroup: latest.target_group,
    groupLabel,
    groupName,
    sinceText,
    nextChangeText,
    startDate,
    exitDate: null,
    isExited: false,
    isFuture: false,
  };
};

export interface OverviewChildLike {
  id: string;
  first_name?: string;
  first_name_for_address_list?: string;
  last_name?: string;
  current_group?: number | null;
  planned_group?: number | null;
  is_former?: boolean;
  group_changes?: ChildGroupChange[];
}

export function getOverviewChildGroupStatus(
  child: OverviewChildLike
): { currentGroup: number | null; plannedGroup: number | null; isFormer: boolean; groupLabel: string } {
  let plannedGroup: number | null =
    typeof child.planned_group === 'number' && child.planned_group > 0
      ? child.planned_group
      : null;

  if (!plannedGroup && child.group_changes && child.group_changes.length > 0) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const sortedChanges = [...child.group_changes].sort((a, b) =>
      a.change_date.localeCompare(b.change_date)
    );
    const futureEnroll = sortedChanges.find(
      (ch) => ch.change_date > todayStr && ch.target_group > 0
    );
    if (futureEnroll) {
      plannedGroup = futureEnroll.target_group;
    }
  }

  if (typeof child.current_group === 'number' && child.current_group > 0) {
    return {
      currentGroup: child.current_group,
      plannedGroup,
      isFormer: false,
      groupLabel: getGroupShortLabel(child.current_group),
    };
  }
  if (child.is_former) {
    return {
      currentGroup: null,
      plannedGroup,
      isFormer: true,
      groupLabel: '-',
    };
  }
  if (child.group_changes && child.group_changes.length > 0) {
    const info = getChildGroupInfo(child.group_changes);
    const activeGrp =
      info.currentGroup && info.currentGroup > 0 && !info.isFuture && !info.isExited
        ? info.currentGroup
        : null;
    return {
      currentGroup: activeGrp,
      plannedGroup,
      isFormer: info.isExited,
      groupLabel: activeGrp ? info.groupName || getGroupShortLabel(activeGrp) : '-',
    };
  }
  return {
    currentGroup: null,
    plannedGroup,
    isFormer: false,
    groupLabel: '-',
  };
}

