import { CURRENT_LOCALE, formatDisplayDate, type Locale } from './i18n';
import { formatDateKey, getMondayOfWeek, parseDateKey } from './mealPlan';

export type MealAllergenStatus = 'unspecified' | 'not_relevant' | 'not_finalized' | 'finalized';

export interface MealAllergenComponent {
  name: string;
  allergens: string[];
}

export interface MealAllergenDocumentation {
  pdf_url?: string;
}

export interface MealAllergenDay {
  date: string; // YYYY-MM-DD
  has_allergen_record: boolean;
  cook_parent_id?: string | null;
  cook_employee_id?: string | null;
  cook_custom_name: string;
  cook_display_name: string;
  meal_components: MealAllergenComponent[];
  status: MealAllergenStatus;
  documentation: MealAllergenDocumentation;
  plan_cook_name: string;
  plan_meal_components: string[];
  has_plan_meal: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CookOption {
  id: string;
  type: 'parent' | 'employee';
  first_name: string;
  last_name: string;
  display_name: string;
}

export interface MainAllergenDefinition {
  key: string;
  label: string;
  shortLabel: string;
  subtypes?: string;
}

export const MAIN_ALLERGENS: MainAllergenDefinition[] = [
  {
    key: 'gluten',
    label: 'Glutenhaltiges Getreide',
    shortLabel: 'Glutenhaltiges Getreide',
    subtypes: 'Weizen, Dinkel-Weizen, Khorasan-Weizen, Roggen, Gerste, Hafer',
  },
  {
    key: 'eier',
    label: 'Eier',
    shortLabel: 'Eier',
  },
  {
    key: 'laktose',
    label: 'Milch/Laktose',
    shortLabel: 'Milch/Laktose',
  },
  {
    key: 'sellerie',
    label: 'Sellerie',
    shortLabel: 'Sellerie',
  },
  {
    key: 'sesamsamen',
    label: 'Sesamsamen',
    shortLabel: 'Sesamsamen',
  },
  {
    key: 'lupine',
    label: 'Lupine',
    shortLabel: 'Lupine',
  },
  {
    key: 'krebstiere',
    label: 'Krebstiere',
    shortLabel: 'Krebstiere',
  },
  {
    key: 'fisch',
    label: 'Fisch',
    shortLabel: 'Fisch',
  },
  {
    key: 'sojabohnen',
    label: 'Sojabohnen',
    shortLabel: 'Sojabohnen',
  },
  {
    key: 'schalenfruechte',
    label: 'Schalenfrüchte',
    shortLabel: 'Schalenfrüchte',
    subtypes:
      'Mandeln, Haselnüsse, Walnüsse, Cashew-/Kaschunüsse, Pecannüsse, Paranüsse, Macadamianüsse, Pistazien',
  },
  {
    key: 'senf',
    label: 'Senf',
    shortLabel: 'Senf',
  },
  {
    key: 'sulfite',
    label: 'Sulphite/Schwefeldioxid',
    shortLabel: 'Sulphite/Schwefeldioxid',
  },
  {
    key: 'weichtiere',
    label: 'Weichtiere',
    shortLabel: 'Weichtiere',
  },
  {
    key: 'erdnuesse',
    label: 'Erdnüsse',
    shortLabel: 'Erdnüsse',
  },
  {
    key: 'kiwi',
    label: 'Kiwi',
    shortLabel: 'Kiwi',
  },
];

const MAIN_ALLERGEN_MAP = new Map<string, MainAllergenDefinition>(
  MAIN_ALLERGENS.map((a) => [a.key, a])
);

export function getAllergenDisplayLabel(key: string): string {
  const norm = key.toLowerCase().trim();
  if (norm === 'gluten' || norm.startsWith('glutenhaltiges getreide')) {
    return 'Glutenhaltiges Getreide';
  }
  if (
    norm === 'schalenfruechte' ||
    norm === 'schalenfrüchte' ||
    norm.startsWith('schalenfrüchte') ||
    norm.startsWith('schalenfruechte')
  ) {
    return 'Schalenfrüchte';
  }
  if (norm === 'erdnuesse' || norm === 'erdnüsse') {
    return 'Erdnüsse';
  }
  if (norm === 'laktose' || norm === 'milch/laktose') {
    return 'Milch/Laktose';
  }
  if (norm === 'sulfite' || norm === 'sulphite/schwefeldioxid') {
    return 'Sulphite/Schwefeldioxid';
  }
  const found = MAIN_ALLERGEN_MAP.get(norm);
  return found ? found.label : key;
}

export function getAllergenShortLabel(key: string): string {
  return getAllergenDisplayLabel(key);
}

export function getAllergenIconKey(name: string): string {
  const norm = (name || '').toLowerCase().trim();
  if (!norm) return 'default';
  if (
    norm === 'gluten' ||
    norm.includes('gluten') ||
    norm.includes('weizen') ||
    norm.includes('dinkel') ||
    norm.includes('roggen') ||
    norm.includes('gerste') ||
    norm.includes('hafer')
  ) {
    return 'gluten';
  }
  if (norm === 'eier' || norm === 'ei' || norm.includes('eier') || norm.includes('hühnerei')) {
    return 'eier';
  }
  if (norm === 'laktose' || norm === 'lactose' || norm.includes('milch') || norm.includes('laktose')) {
    return 'laktose';
  }
  if (norm.includes('sellerie')) {
    return 'sellerie';
  }
  if (norm.includes('sesam')) {
    return 'sesamsamen';
  }
  if (norm.includes('lupin')) {
    return 'lupine';
  }
  if (norm.includes('krebs') || norm.includes('krabbe') || norm.includes('garnele') || norm.includes('shrimp') || norm.includes('hummer')) {
    return 'krebstiere';
  }
  if (norm.includes('fisch')) {
    return 'fisch';
  }
  if (norm.includes('soja')) {
    return 'sojabohnen';
  }
  if (norm.includes('erdnuss') || norm.includes('erdnüss')) {
    return 'erdnuesse';
  }
  if (
    norm.includes('schalenfr') ||
    norm.includes('nüss') ||
    norm.includes('nuss') ||
    norm.includes('mandel') ||
    norm.includes('cashew') ||
    norm.includes('pistazie') ||
    norm.includes('walnuss') ||
    norm.includes('haselnuss') ||
    norm.includes('paranuss') ||
    norm.includes('pecan') ||
    norm.includes('macadamia')
  ) {
    return 'schalenfruechte';
  }
  if (norm.includes('senf')) {
    return 'senf';
  }
  if (norm.includes('sulfit') || norm.includes('sulphit') || norm.includes('schwefeldioxid')) {
    return 'sulfite';
  }
  if (norm.includes('weichtier') || norm.includes('muschel') || norm.includes('schnecke') || norm.includes('auster') || norm.includes('tintenfisch')) {
    return 'weichtiere';
  }
  if (norm.includes('kiwi')) {
    return 'kiwi';
  }
  return 'default';
}

export function isLebensmittelAllergen(name: string, knownFoodList?: string[]): boolean {
  if (!name) return false;
  if (knownFoodList && knownFoodList.some((f) => f.toLowerCase().trim() === name.toLowerCase().trim())) {
    return true;
  }
  const iconKey = getAllergenIconKey(name);
  if (iconKey !== 'default') {
    return true;
  }
  const norm = name.toLowerCase().trim();
  const foodKeywords = [
    'apfel', 'äpfel', 'erdbeer', 'tomate', 'zitrus', 'orange', 'banane',
    'kakao', 'schokolade', 'honig', 'karotte', 'zwiebel', 'knoblauch',
    'lebensmittel', 'nahrung'
  ];
  return foodKeywords.some((kw) => norm.includes(kw));
}

export interface AllergyEntryObject {
  value: string;
  name?: string;
  category?: 'lebensmittel' | 'andere' | string;
  [key: string]: any;
}

export type AllergyItemValue = string | AllergyEntryObject;

export function getAllergyText(item: AllergyItemValue): string {
  if (typeof item === 'string') return item;
  return item?.name || item?.value || '';
}

export function getAllergyCategory(item: AllergyItemValue): 'lebensmittel' | 'andere' | undefined {
  if (typeof item === 'object' && item !== null && item.category) {
    return item.category as 'lebensmittel' | 'andere';
  }
  const text = getAllergyText(item);
  return isLebensmittelAllergen(text) ? 'lebensmittel' : undefined;
}

export function isKnownFoodAllergy(item: AllergyItemValue): boolean {
  const category = getAllergyCategory(item);
  if (category === 'andere') return false;
  const text = getAllergyText(item);
  return getAllergenIconKey(text) !== 'default';
}

export function sortAllergiesList<T extends AllergyItemValue>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aKnown = isKnownFoodAllergy(a);
    const bKnown = isKnownFoodAllergy(b);
    if (aKnown && !bKnown) return -1;
    if (!aKnown && bKnown) return 1;
    return 0;
  });
}

export const ALLERGEN_COLORS: Record<string, string> = {
  gluten: '#d97706', // Golden amber (wheat)
  krebstiere: '#ea580c', // Coral red (crustaceans/shrimp)
  eier: '#eab308', // Egg yolk golden yellow
  fisch: '#0284c7', // Ocean blue (fish)
  erdnuesse: '#c2410c', // Peanut warm roasted brown
  sojabohnen: '#65a30d', // Edamame soy green
  laktose: '#0ea5e9', // Milk sky blue
  schalenfruechte: '#92400e', // Walnut / tree nut brown
  sellerie: '#16a34a', // Celery crisp green
  senf: '#ca8a04', // Mustard seed yellow
  sesamsamen: '#b45309', // Toasted sesame amber
  sulfite: '#e11d48', // Wine ruby red
  lupine: '#9333ea', // Lupine flower purple
  weichtiere: '#4f46e5', // Mollusc deep sea indigo
  kiwi: '#059669', // Fresh kiwi emerald green
};

export function getAllergenColor(allergenKey: string): string {
  const norm = allergenKey.toLowerCase().trim();
  return ALLERGEN_COLORS[norm] || '#64748b';
}

export function getAllergenBgColor(allergenKey: string): string {
  const color = getAllergenColor(allergenKey);
  return `${color}18`;
}

/**
 * Generates the 5x5 (5 weeks, Mon-Fri) calendar grid for a given year and month (0-indexed).
 * Anchored at the Monday of the week containing the 1st of the month.
 */
export function getMonth5WeeksDays(year: number, month: number): Date[][] {
  const firstOfMonth = new Date(year, month, 1);
  const firstMonday = getMondayOfWeek(firstOfMonth);

  const weeks: Date[][] = [];
  for (let w = 0; w < 5; w++) {
    const weekDays: Date[] = [];
    for (let d = 0; d < 5; d++) {
      const date = new Date(
        firstMonday.getFullYear(),
        firstMonday.getMonth(),
        firstMonday.getDate() + w * 7 + d
      );
      weekDays.push(date);
    }
    weeks.push(weekDays);
  }
  return weeks;
}

export function getMonth5WeeksFlatDays(year: number, month: number): Date[] {
  return getMonth5WeeksDays(year, month).flat();
}

export function formatMonthYearLabel(
  year: number,
  month: number,
  locale: Locale = CURRENT_LOCALE
): string {
  const monthNamesDe = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];
  const monthNamesEn = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const names = locale === 'en' ? monthNamesEn : monthNamesDe;
  const normalized = new Date(year, month, 1);
  return `${names[normalized.getMonth()]} ${normalized.getFullYear()}`;
}

/**
 * Given a Date, returns the { year, month } whose 5-week (25 Mon-Fri boxes) grid contains that date.
 */
export function getMonthForDateIn5WeekGrid(date: Date): { year: number; month: number } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const flatDays = getMonth5WeeksFlatDays(y, m);
  const lastFriday = flatDays[flatDays.length - 1];
  if (formatDateKey(date) > formatDateKey(lastFriday)) {
    const nextMonth = new Date(y, m + 1, 1);
    return { year: nextMonth.getFullYear(), month: nextMonth.getMonth() };
  }
  return { year: y, month: m };
}

export type DayBgVariant = 'finalized' | 'not_finalized_upcoming' | 'overdue' | 'default';

/**
 * Determines the background color variant for a day box in the month/week overview:
 * - finalized -> 'finalized' (greenish background)
 * - not_finalized -> 'not_finalized_upcoming' (light yellowish if today or future), 'overdue' (light red if in the past)
 * - unspecified / not_started ->
 *   - if mealplan has a meal for that day: 'default' if today or future, 'overdue' (light red) if in the past
 *   - if mealplan has no meal for that day: 'default'
 */
export function getDayBgVariant(
  day: { date: string; status?: MealAllergenStatus | string; has_plan_meal?: boolean },
  todayKey: string = formatDateKey(new Date())
): DayBgVariant {
  const isPast = day.date < todayKey;
  const status = day.status || 'unspecified';

  if (status === 'finalized') {
    return 'finalized';
  }
  if (status === 'not_finalized') {
    return isPast ? 'overdue' : 'not_finalized_upcoming';
  }
  if (status === 'not_relevant') {
    return 'default';
  }
  // unspecified or not_started
  if (day.has_plan_meal) {
    return isPast ? 'overdue' : 'default';
  }
  return 'default';
}

export function createEmptyMealAllergenDay(dateStr: string): MealAllergenDay {
  return {
    date: dateStr,
    has_allergen_record: false,
    cook_parent_id: null,
    cook_employee_id: null,
    cook_custom_name: '',
    cook_display_name: '',
    meal_components: [],
    status: 'unspecified',
    documentation: {},
    plan_cook_name: '',
    plan_meal_components: [],
    has_plan_meal: false,
  };
}

/**
 * Matches a cook name from the meal plan against available parent/employee cook options.
 */
export function matchCookFromPlan(
  planCookName: string,
  cookOptions: CookOption[]
): {
  cook_parent_id: string | null;
  cook_employee_id: string | null;
  cook_custom_name: string;
} {
  const trimmed = (planCookName || '').trim();
  if (!trimmed) {
    return { cook_parent_id: null, cook_employee_id: null, cook_custom_name: '' };
  }
  const lower = trimmed.toLowerCase();

  // 1. Exact full display name match
  const exactFull = cookOptions.find((o) => o.display_name.toLowerCase() === lower);
  if (exactFull) {
    return {
      cook_parent_id: exactFull.type === 'parent' ? exactFull.id : null,
      cook_employee_id: exactFull.type === 'employee' ? exactFull.id : null,
      cook_custom_name: '',
    };
  }

  // 2. Unique first name match
  const firstNameMatches = cookOptions.filter((o) => o.first_name.trim().toLowerCase() === lower);
  if (firstNameMatches.length === 1) {
    const match = firstNameMatches[0];
    return {
      cook_parent_id: match.type === 'parent' ? match.id : null,
      cook_employee_id: match.type === 'employee' ? match.id : null,
      cook_custom_name: '',
    };
  }

  return {
    cook_parent_id: null,
    cook_employee_id: null,
    cook_custom_name: trimmed,
  };
}

function getNormalizedCookNames(day: MealAllergenDay): string[] {
  const names = new Set<string>();
  for (const raw of [day.cook_display_name, day.cook_custom_name, day.plan_cook_name]) {
    const norm = (raw || '').trim().toLowerCase();
    if (norm) {
      names.add(norm);
    }
  }
  return Array.from(names);
}

export function isSameCook(a: MealAllergenDay, b: MealAllergenDay): boolean {
  if (a.cook_parent_id && b.cook_parent_id && a.cook_parent_id === b.cook_parent_id) {
    return true;
  }
  if (a.cook_employee_id && b.cook_employee_id && a.cook_employee_id === b.cook_employee_id) {
    return true;
  }
  const namesA = getNormalizedCookNames(a);
  const namesB = getNormalizedCookNames(b);
  if (namesA.length === 0 || namesB.length === 0) {
    return false;
  }
  for (const na of namesA) {
    for (const nb of namesB) {
      if (na === nb) {
        return true;
      }
    }
  }
  return false;
}

function getBigrams(str: string): string[] {
  const s = str.toLowerCase().replace(/\s+/g, ' ').trim();
  if (s.length === 0) return [];
  if (s.length === 1) return [s];
  const bigrams: string[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    bigrams.push(s.slice(i, i + 2));
  }
  return bigrams;
}

/**
 * Computes similarity [0..1] between two lists of meal component strings.
 */
export function computeMealComponentsSimilarity(
  componentsA: string[],
  componentsB: string[]
): number {
  const textA = componentsA
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  const textB = componentsB
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  if (!textA && !textB) return 1;
  if (!textA || !textB) return 0;
  if (textA === textB) return 1;

  const bigramsA = getBigrams(textA);
  const bigramsB = getBigrams(textB);
  if (bigramsA.length === 0 || bigramsB.length === 0) return 0;

  const countsB = new Map<string, number>();
  for (const bg of bigramsB) {
    countsB.set(bg, (countsB.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (const bg of bigramsA) {
    const count = countsB.get(bg) || 0;
    if (count > 0) {
      intersection++;
      countsB.set(bg, count - 1);
    }
  }

  return (2 * intersection) / (bigramsA.length + bigramsB.length);
}

export function getDayComponentStrings(day: MealAllergenDay): string[] {
  if (day.meal_components && day.meal_components.length > 0) {
    return day.meal_components.map((c) => c.name).filter((n) => n.trim() !== '');
  }
  return (day.plan_meal_components || []).filter((n) => n.trim() !== '');
}

/**
 * Suggests the last 3 entries where the same cook cooked,
 * sorted by similarity of the meal component strings with today's meal component strings (from the meal plan).
 */
export function getSuggestedEntriesForCook(
  targetDay: MealAllergenDay,
  allEntries: MealAllergenDay[]
): MealAllergenDay[] {
  const candidates = allEntries.filter((entry) => {
    if (entry.date === targetDay.date) return false;
    if (!isSameCook(targetDay, entry)) return false;
    const comps = getDayComponentStrings(entry);
    return comps.length > 0 || entry.has_allergen_record;
  });

  // Sort by date descending to get the last 3 entries where the same cook cooked
  const sortedByDateDesc = [...candidates].sort((a, b) => b.date.localeCompare(a.date));
  const lastThree = sortedByDateDesc.slice(0, 3);

  // Today's meal component strings from the meal plan (or fallback to current meal_components)
  const targetStrings =
    targetDay.plan_meal_components && targetDay.plan_meal_components.length > 0
      ? targetDay.plan_meal_components
      : getDayComponentStrings(targetDay);

  // Sort the 3 entries by similarity with today's meal component strings (descending)
  return lastThree.sort((a, b) => {
    const simA = computeMealComponentsSimilarity(targetStrings, getDayComponentStrings(a));
    const simB = computeMealComponentsSimilarity(targetStrings, getDayComponentStrings(b));
    if (Math.abs(simB - simA) > 1e-6) {
      return simB - simA;
    }
    return b.date.localeCompare(a.date);
  });
}

/**
 * Combines source meal components and allergens into target meal components.
 */
export function combineMealComponents(
  targetComponents: MealAllergenComponent[],
  sourceComponents: MealAllergenComponent[]
): MealAllergenComponent[] {
  const result: MealAllergenComponent[] = targetComponents.map((c) => ({
    name: c.name,
    allergens: [...c.allergens],
  }));

  for (const src of sourceComponents) {
    const srcNameNorm = src.name.trim().toLowerCase();
    const existing = result.find((r) => r.name.trim().toLowerCase() === srcNameNorm);
    if (existing) {
      const set = new Set(existing.allergens);
      for (const a of src.allergens) {
        if (a.trim()) {
          set.add(a.trim());
        }
      }
      existing.allergens = Array.from(set);
    } else if (src.name.trim() !== '') {
      result.push({
        name: src.name.trim(),
        allergens: [...src.allergens],
      });
    }
  }

  return result;
}

/**
 * Replaces target meal components with a copy of source meal components.
 */
export function replaceMealComponents(
  sourceComponents: MealAllergenComponent[]
): MealAllergenComponent[] {
  return sourceComponents.map((c) => ({
    name: c.name.trim(),
    allergens: [...c.allergens],
  }));
}

/**
 * Checks whether a day matches a fulltext search query (cook name, meal components, allergens, or date).
 */
export function doesDayMatchSearch(day: MealAllergenDay, query: string): boolean {
  const trimmed = (query || '').trim().toLowerCase();
  if (!trimmed) return false;

  const searchableParts: string[] = [
    day.date,
    formatDisplayDate(parseDateKey(day.date)),
    day.cook_display_name || '',
    day.cook_custom_name || '',
    day.plan_cook_name || '',
    ...(day.plan_meal_components || []),
  ];

  for (const comp of day.meal_components || []) {
    searchableParts.push(comp.name);
    for (const allergen of comp.allergens || []) {
      searchableParts.push(allergen);
      searchableParts.push(getAllergenDisplayLabel(allergen));
      searchableParts.push(getAllergenShortLabel(allergen));
    }
  }

  const haystack = searchableParts.join(' ').toLowerCase();
  const terms = trimmed.split(/\s+/).filter(Boolean);
  return terms.every((term) => haystack.includes(term));
}

/**
 * Finds the most recent day matching the fulltext search query.
 */
export function findMostRecentMatchingDay(
  entries: MealAllergenDay[],
  query: string,
  excludeDate?: string
): MealAllergenDay | null {
  const matches = entries.filter(
    (d) => d.date !== excludeDate && doesDayMatchSearch(d, query)
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.date.localeCompare(a.date));
  return matches[0];
}
