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
