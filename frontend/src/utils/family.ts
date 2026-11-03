/**
 * Utility for formatting standardized family names from parent surnames.
 * Deduplicates non-empty surnames, sorts them alphabetically, and joins with " / ".
 */
export function formatFamilyName(
  parents?: { last_name?: string }[] | null,
  fallback = 'Familie'
): string {
  if (!parents || parents.length === 0) {
    return fallback;
  }

  const surnames = Array.from(
    new Set(
      parents
        .map((p) => (p.last_name || '').trim())
        .filter(Boolean)
    )
  );

  if (surnames.length === 0) {
    return fallback;
  }

  surnames.sort(
    (a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }) ||
      a.localeCompare(b)
  );

  return surnames.join(' / ');
}

export function getFamilyName(
  family: { family_name?: string; parents?: { last_name?: string }[] } | null | undefined,
  fallback = 'Familie'
): string {
  if (!family) return fallback;
  if (family.family_name) return family.family_name;
  return formatFamilyName(family.parents, fallback);
}

export interface FamilyChildGroupChange {
  change_date: string;
  target_group: number;
}

export interface FamilyChildLike {
  group_changes?: FamilyChildGroupChange[];
  start_date?: string;
}

export interface FamilyParentLike {
  id?: string;
  first_name?: string;
  last_name?: string;
}

export interface FamilyLike {
  id: string;
  family_name?: string;
  parents?: FamilyParentLike[];
  children?: FamilyChildLike[];
  mentor_family_id?: string | null;
  mentor_parent_ids?: string[] | null;
}

export function getEarliestGroupStartDate(family: FamilyLike | null | undefined): string | null {
  if (!family || !family.children || family.children.length === 0) {
    return null;
  }
  const dates: string[] = [];
  for (const child of family.children) {
    let childStart: string | null = null;
    if (child.group_changes && child.group_changes.length > 0) {
      const sorted = [...child.group_changes].sort((a, b) => (a.change_date || '').localeCompare(b.change_date || ''));
      const firstEnroll = sorted.find((c) => c.target_group > 0);
      if (firstEnroll && firstEnroll.change_date) {
        childStart = firstEnroll.change_date.split('T')[0];
      }
    }
    if (!childStart && child.start_date) {
      childStart = String(child.start_date).split('T')[0];
    }
    if (childStart && /^\d{4}-\d{2}-\d{2}$/.test(childStart)) {
      dates.push(childStart);
    }
  }
  if (dates.length === 0) return null;
  dates.sort();
  return dates[0];
}

export function formatMentorDatePrefix(dateStr: string | null): string {
  if (!dateStr) return 'geplant';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[1]}/${parts[0]}`;
  }
  return 'geplant';
}

export interface MentorsDisplayResult {
  text: string;
  isFamily: boolean;
  mentorFamily: FamilyLike | null;
  parentNames?: string;
}

export function getMentorsDisplay(
  targetFamily: FamilyLike | null | undefined,
  allFamilies: FamilyLike[]
): MentorsDisplayResult {
  if (!targetFamily || !targetFamily.mentor_family_id) {
    return { text: '-', isFamily: false, mentorFamily: null };
  }
  const mentorFamily = allFamilies.find((f) => f.id === targetFamily.mentor_family_id);
  if (!mentorFamily) {
    return { text: '-', isFamily: false, mentorFamily: null };
  }

  // If specific individual parents are persisted
  if (targetFamily.mentor_parent_ids && targetFamily.mentor_parent_ids.length > 0) {
    const parentIdSet = new Set(targetFamily.mentor_parent_ids);
    const matchingParents = (mentorFamily.parents || []).filter((p) => p.id && parentIdSet.has(p.id));
    const names = matchingParents
      .map((p) => `${p.first_name || ''} ${p.last_name || ''}`.trim())
      .filter(Boolean);
    if (names.length > 0) {
      return {
        text: names.join(', '),
        isFamily: false,
        mentorFamily,
        parentNames: names.join(', '),
      };
    }
  }

  // Whole family
  const canonicalName = getFamilyName(mentorFamily);
  const text = canonicalName.startsWith('Familie') ? canonicalName : `Familie ${canonicalName}`;
  return {
    text,
    isFamily: true,
    mentorFamily,
  };
}

export interface MentoredFamilyItem {
  family: FamilyLike;
  datePrefix: string;
  rawDate: string | null;
  canonicalName: string;
  parentGivenNames?: string;
  displayName: string;
}

export function getMentoredFamiliesForParent(
  parent: { id: string; family_id: string },
  allFamilies: FamilyLike[]
): MentoredFamilyItem[] {
  if (!parent || !parent.family_id) return [];
  const results: MentoredFamilyItem[] = [];

  for (const mtarget of allFamilies) {
    if (mtarget.mentor_family_id !== parent.family_id) continue;

    // Check if only individual parents were persisted
    if (mtarget.mentor_parent_ids && mtarget.mentor_parent_ids.length > 0) {
      if (!mtarget.mentor_parent_ids.includes(parent.id)) {
        continue;
      }
    }

    const rawDate = getEarliestGroupStartDate(mtarget);
    const datePrefix = formatMentorDatePrefix(rawDate);
    const canonicalName = getFamilyName(mtarget);
    const displayName = `${datePrefix} - Familie ${canonicalName}`;

    results.push({
      family: mtarget,
      datePrefix,
      rawDate,
      canonicalName,
      displayName,
    });
  }

  results.sort((a, b) => {
    if (!a.rawDate && !b.rawDate) return a.canonicalName.localeCompare(b.canonicalName);
    if (!a.rawDate) return 1;
    if (!b.rawDate) return -1;
    const cmp = a.rawDate.localeCompare(b.rawDate);
    if (cmp !== 0) return cmp;
    return a.canonicalName.localeCompare(b.canonicalName);
  });

  return results;
}

export function getMentoredFamiliesForFamily(
  family: FamilyLike,
  allFamilies: FamilyLike[]
): MentoredFamilyItem[] {
  if (!family || !family.id) return [];
  const results: MentoredFamilyItem[] = [];

  for (const mtarget of allFamilies) {
    if (mtarget.mentor_family_id !== family.id) continue;

    const rawDate = getEarliestGroupStartDate(mtarget);
    const datePrefix = formatMentorDatePrefix(rawDate);
    const canonicalName = getFamilyName(mtarget);

    let parentGivenNames: string | undefined;
    if (mtarget.mentor_parent_ids && mtarget.mentor_parent_ids.length > 0) {
      const parentIdSet = new Set(mtarget.mentor_parent_ids);
      const matchingParents = (family.parents || []).filter((p) => p.id && parentIdSet.has(p.id));
      const givenNames = matchingParents
        .map((p) => (p.first_name || '').trim())
        .filter(Boolean);
      if (givenNames.length > 0) {
        parentGivenNames = givenNames.join(', ');
      }
    }

    const displayName = `${datePrefix} - Familie ${canonicalName}${parentGivenNames ? ` (${parentGivenNames})` : ''}`;

    results.push({
      family: mtarget,
      datePrefix,
      rawDate,
      canonicalName,
      parentGivenNames,
      displayName,
    });
  }

  results.sort((a, b) => {
    if (!a.rawDate && !b.rawDate) return a.canonicalName.localeCompare(b.canonicalName);
    if (!a.rawDate) return 1;
    if (!b.rawDate) return -1;
    const cmp = a.rawDate.localeCompare(b.rawDate);
    if (cmp !== 0) return cmp;
    return a.canonicalName.localeCompare(b.canonicalName);
  });

  return results;
}
