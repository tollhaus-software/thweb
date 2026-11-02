import { test, expect } from '@playwright/test';
import { formatDateKey } from '../src/utils/mealPlan';
import {
  MAIN_ALLERGENS,
  getMonth5WeeksFlatDays,
  getDayBgVariant,
  getSuggestedEntriesForCook,
  combineMealComponents,
  replaceMealComponents,
  doesDayMatchSearch,
  findMostRecentMatchingDay,
  createEmptyMealAllergenDay,
  formatCooksDisplayName,
  sortCookOptions,
  type MealAllergenDay,
  type CookOption,
} from '../src/utils/mealAllergens';

test.describe('Test Case 23: Essen/Allergene Tab, Calendar/Week View, Editor, and Copy Allergens', () => {
  test('unit tests: 5x5 calendar grid, day background colors, similarity suggestions, combine/replace, and search', () => {
    // 1. 5x5 = 25 boxes, Mon-Fri, Monday on top-left
    const oct2026Days = getMonth5WeeksFlatDays(2026, 9); // October 2026
    expect(oct2026Days).toHaveLength(25);
    expect(oct2026Days[0].getDay()).toBe(1); // Monday on top-left
    expect(oct2026Days[4].getDay()).toBe(5); // Friday on top-right
    expect(formatDateKey(oct2026Days[0])).toBe('2026-09-28');
    expect(formatDateKey(oct2026Days[24])).toBe('2026-10-30');

    // 2. Day background color rules
    const todayKey = '2026-10-22';
    const pastKey = '2026-10-19';
    const futureKey = '2026-10-23';

    // Finalized -> greenish
    expect(getDayBgVariant({ date: pastKey, status: 'finalized', has_plan_meal: true }, todayKey)).toBe('finalized');
    expect(getDayBgVariant({ date: futureKey, status: 'finalized', has_plan_meal: true }, todayKey)).toBe('finalized');

    // Not finalized -> light yellow if today or future, light red if in the past
    expect(getDayBgVariant({ date: todayKey, status: 'not_finalized', has_plan_meal: true }, todayKey)).toBe('not_finalized_upcoming');
    expect(getDayBgVariant({ date: futureKey, status: 'not_finalized', has_plan_meal: false }, todayKey)).toBe('not_finalized_upcoming');
    expect(getDayBgVariant({ date: pastKey, status: 'not_finalized', has_plan_meal: true }, todayKey)).toBe('overdue');

    // Unspecified / not_started ->
    // if mealplan has a meal: default if today/future, light red if in the past
    expect(getDayBgVariant({ date: todayKey, status: 'unspecified', has_plan_meal: true }, todayKey)).toBe('default');
    expect(getDayBgVariant({ date: futureKey, status: 'unspecified', has_plan_meal: true }, todayKey)).toBe('default');
    expect(getDayBgVariant({ date: pastKey, status: 'unspecified', has_plan_meal: true }, todayKey)).toBe('overdue');
    // if mealplan has no meal: default
    expect(getDayBgVariant({ date: pastKey, status: 'unspecified', has_plan_meal: false }, todayKey)).toBe('default');
    expect(getDayBgVariant({ date: futureKey, status: 'unspecified', has_plan_meal: false }, todayKey)).toBe('default');

    // 3. Verify 14 allergens include all required keys and labels
    const allergenMap = new Map(MAIN_ALLERGENS.map((a) => [a.key, a.label]));
    expect(allergenMap.get('gluten')).toBe('Glutenhaltiges Getreide');
    expect(allergenMap.get('eier')).toBe('Eier');
    expect(allergenMap.get('laktose')).toBe('Milch/Laktose');
    expect(allergenMap.get('sellerie')).toBe('Sellerie');
    expect(allergenMap.get('sesamsamen')).toBe('Sesamsamen');
    expect(allergenMap.get('lupine')).toBe('Lupine');
    expect(allergenMap.get('krebstiere')).toBe('Krebstiere');
    expect(allergenMap.get('fisch')).toBe('Fisch');
    expect(allergenMap.get('sojabohnen')).toBe('Sojabohnen');
    expect(allergenMap.get('schalenfruechte')).toBe('Schalenfrüchte');
    expect(allergenMap.get('senf')).toBe('Senf');
    expect(allergenMap.get('sulfite')).toBe('Sulphite/Schwefeldioxid');
    expect(allergenMap.get('weichtiere')).toBe('Weichtiere');
    expect(allergenMap.get('erdnuesse')).toBe('Erdnüsse');
    expect(allergenMap.get('kiwi')).toBe('Kiwi');

    // 4. Last 3 entries by same cook sorted by similarity with today's meal plan strings
    const targetDay: MealAllergenDay = {
      ...createEmptyMealAllergenDay('2026-10-22'),
      cook_display_name: 'Hans Koch',
      plan_cook_name: 'Hans Koch',
      plan_meal_components: ['Spaghetti Bolognese', 'Grüner Salat'],
    };

    const entry1: MealAllergenDay = {
      ...createEmptyMealAllergenDay('2026-10-15'),
      has_allergen_record: true,
      cook_display_name: 'Hans Koch',
      meal_components: [{ name: 'Kartoffelsuppe', allergens: ['sellerie'] }],
    };
    const entry2: MealAllergenDay = {
      ...createEmptyMealAllergenDay('2026-10-08'),
      has_allergen_record: true,
      cook_display_name: 'Hans Koch',
      meal_components: [
        { name: 'Spaghetti Bolognese', allergens: ['gluten', 'sellerie'] },
        { name: 'Tomatensalat', allergens: ['senf'] },
      ],
    };
    const entry3: MealAllergenDay = {
      ...createEmptyMealAllergenDay('2026-10-01'),
      has_allergen_record: true,
      cook_display_name: 'Hans Koch',
      meal_components: [
        { name: 'Pfannkuchen', allergens: ['gluten', 'eier', 'laktose'] },
      ],
    };
    const entry4Old: MealAllergenDay = {
      ...createEmptyMealAllergenDay('2026-09-01'),
      has_allergen_record: true,
      cook_display_name: 'Hans Koch',
      meal_components: [
        { name: 'Spaghetti Bolognese', allergens: ['gluten'] },
        { name: 'Grüner Salat', allergens: [] },
      ],
    };

    const suggestions = getSuggestedEntriesForCook(targetDay, [entry1, entry2, entry3, entry4Old]);
    expect(suggestions).toHaveLength(3);
    expect(suggestions.map((s) => s.date)).not.toContain('2026-09-01');
    expect(suggestions[0].date).toBe('2026-10-08');

    // 5. Combine vs Replace
    const combined = combineMealComponents(
      [
        { name: 'Spaghetti Bolognese', allergens: ['gluten'] },
        { name: 'Obst', allergens: [] },
      ],
      [
        { name: 'Spaghetti Bolognese', allergens: ['sellerie', 'gluten'] },
        { name: 'Salat', allergens: ['senf'] },
      ]
    );
    expect(combined).toEqual([
      { name: 'Spaghetti Bolognese', allergens: ['gluten', 'sellerie'] },
      { name: 'Obst', allergens: [] },
      { name: 'Salat', allergens: ['senf'] },
    ]);

    const replaced = replaceMealComponents([{ name: 'Salat', allergens: ['senf'] }]);
    expect(replaced).toEqual([{ name: 'Salat', allergens: ['senf'] }]);

    // 6. Fulltext search & most recent match
    expect(doesDayMatchSearch(entry2, 'Bolognese')).toBe(true);
    expect(doesDayMatchSearch(entry2, 'sellerie')).toBe(true);
    expect(doesDayMatchSearch(entry2, 'Pfannkuchen')).toBe(false);

    const mostRecent = findMostRecentMatchingDay([entry1, entry2, entry3, entry4Old], 'Spaghetti');
    expect(mostRecent?.date).toBe('2026-10-08');

    // 7. Multi-cook display formatting ("GivenNameA & GivenNameB CommonSurname") and cook options sorting
    expect(
      formatCooksDisplayName([
        { first_name: 'Anton', last_name: 'Becker', display_name: 'Anton Becker' },
        { first_name: 'Zoe', last_name: 'Becker', display_name: 'Zoe Becker' },
      ])
    ).toBe('Anton & Zoe Becker');
    expect(
      formatCooksDisplayName([
        { first_name: 'Sabine', last_name: 'Mitarbeiterin', display_name: 'Sabine Mitarbeiterin' },
        { first_name: 'Markus', last_name: 'Elternkoch', display_name: 'Markus Elternkoch' },
      ])
    ).toBe('Sabine Mitarbeiterin, Markus Elternkoch');

    const sampleOptions: CookOption[] = [
      { id: 'e2', type: 'employee', first_name: 'Vera', last_name: 'Erzieherin', display_name: 'Vera Erzieherin', employee_type: 'caregiver' },
      { id: 'p3', type: 'parent', first_name: 'Markus', last_name: 'Elternkoch', display_name: 'Markus Elternkoch', family_name: 'Elternkoch', family_id: 'f2' },
      { id: 'p2', type: 'parent', first_name: 'Zoe', last_name: 'Becker', display_name: 'Zoe Becker', family_name: 'Becker', family_id: 'f1' },
      { id: 'e1', type: 'employee', first_name: 'Sabine', last_name: 'Mitarbeiterin', display_name: 'Sabine Mitarbeiterin', employee_type: 'cook' },
      { id: 'p1', type: 'parent', first_name: 'Anton', last_name: 'Becker', display_name: 'Anton Becker', family_name: 'Becker', family_id: 'f1' },
    ];
    expect(sortCookOptions(sampleOptions).map((o) => o.display_name)).toEqual([
      'Sabine Mitarbeiterin',
      'Anton Becker',
      'Zoe Becker',
      'Markus Elternkoch',
      'Vera Erzieherin',
    ]);
    // With prioritizedKeys (already selected cooks shown first)
    expect(sortCookOptions(sampleOptions, new Set(['employee:e2'])).map((o) => o.display_name)).toEqual([
      'Vera Erzieherin',
      'Sabine Mitarbeiterin',
      'Anton Becker',
      'Zoe Becker',
      'Markus Elternkoch',
    ]);
  });

  test('desktop (5x5 month view) and mobile (5-day week view) layouts, multi-cook popover editor, component popover editor, and copy allergens', async ({
    request,
    page,
  }) => {
    // 1. Reset DB
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const authHeaders = { Authorization: 'Bearer developer@example.com' };

    // Create families and employees to test multi-cook popover ordering and same-surname display
    const famBeckerRes = await request.post('/api/families', {
      headers: authHeaders,
      data: {
        parents: [
          { first_name: 'Zoe', last_name: 'Becker', emails: [], phones: [] },
          { first_name: 'Anton', last_name: 'Becker', emails: [], phones: [] },
        ],
      },
    });
    expect(famBeckerRes.ok()).toBeTruthy();

    const famRes = await request.post('/api/families', {
      headers: authHeaders,
      data: {
        parents: [{ first_name: 'Markus', last_name: 'Elternkoch', emails: [], phones: [] }],
      },
    });
    expect(famRes.ok()).toBeTruthy();

    const empRes = await request.post('/api/employees', {
      headers: authHeaders,
      data: {
        first_name: 'Sabine',
        last_name: 'Mitarbeiterin',
        employee_type: 'cook',
        emails: [],
        phones: [],
      },
    });
    expect(empRes.ok()).toBeTruthy();

    const empPedRes = await request.post('/api/employees', {
      headers: authHeaders,
      data: {
        first_name: 'Vera',
        last_name: 'Erzieherin',
        employee_type: 'caregiver',
        emails: [],
        phones: [],
      },
    });
    expect(empPedRes.ok()).toBeTruthy();

    // Compute dates around current week
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMon = (dayOfWeek + 6) % 7;
    const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon);
    const prevMonday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - 7);
    const prevTuesday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - 6);
    const prevWednesday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - 5);
    const nextFriday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() + 11);

    const pastMealDate = formatDateKey(prevMonday);
    const past2Date = formatDateKey(prevTuesday);
    const past3Date = formatDateKey(prevWednesday);
    const prevThursday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - 4);
    const unseededDate = formatDateKey(prevThursday);
    const futureMealDate = formatDateKey(nextFriday);

    // 2. Seed meal_plan_from_sheets via test endpoint
    const seedRes = await request.post('/api/test/meal-plan', {
      data: [
        {
          date: pastMealDate,
          cook_name: 'Anna Köchin',
          meal_components: ['Linsensuppe', 'Brot'],
        },
        {
          date: past2Date,
          cook_name: 'Anna Köchin',
          meal_components: ['Gemüseauflauf', 'Salat'],
        },
        {
          date: past3Date,
          cook_name: 'Anna Köchin',
          meal_components: ['Spaghetti Napoli', 'Gurkensalat'],
        },
        {
          date: futureMealDate,
          cook_name: 'Anna Köchin',
          meal_components: ['Spaghetti Bolognese', 'Gurkensalat'],
        },
      ],
    });
    expect(seedRes.ok()).toBeTruthy();

    // Seed allergen entries for pastMealDate, past2Date, past3Date
    await request.put(`/api/meal-allergens/${pastMealDate}`, {
      headers: authHeaders,
      data: {
        cook_custom_name: 'Anna Köchin',
        meal_components: [
          { name: 'Linsensuppe', allergens: ['sellerie'] },
          { name: 'Brot', allergens: ['gluten'] },
        ],
        documentation: {},
      },
    });
    await request.put(`/api/meal-allergens/${past2Date}`, {
      headers: authHeaders,
      data: {
        cook_custom_name: 'Anna Köchin',
        meal_components: [
          { name: 'Gemüseauflauf', allergens: ['laktose', 'eier'] },
          { name: 'Salat', allergens: ['senf'] },
        ],
        documentation: {},
      },
    });
    await request.put(`/api/meal-allergens/${past3Date}`, {
      headers: authHeaders,
      data: {
        cook_custom_name: 'Anna Köchin',
        meal_components: [
          { name: 'Spaghetti Napoli', allergens: ['gluten'] },
          { name: 'Gurkensalat', allergens: ['senf'] },
        ],
        documentation: {},
      },
    });

    // 3. Authenticate and open desktop view (1200x800)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click on "Essen/Allergene" tab
    const kochenTab = page.getByRole('button', { name: 'Kochen', exact: true });
    if (await kochenTab.isVisible()) {
      await kochenTab.click();
    }
    const tabBtn = page.locator('.tabs').getByRole('button', { name: 'Essen/Allergene' });
    await expect(tabBtn).toBeVisible();
    await tabBtn.click();
    await expect(tabBtn).toHaveAttribute('data-active', 'true');
    expect(page.url()).toContain('#mealAllergens');

    // 4. Desktop view: verify month selector and 25 boxes (5x5)
    await expect(page.getByTestId('meal-allergens-month-selector')).toBeVisible();
    const desktopBoxes = page.locator('[data-testid^="meal-allergens-day-box-"]');
    await expect(desktopBoxes).toHaveCount(25);

    // Verify current day (today) is marked in the calendar
    const todayKey = formatDateKey(now);
    const todayBox = page.getByTestId(`meal-allergens-day-box-${todayKey}`);
    if (now.getDay() >= 1 && now.getDay() <= 5) {
      await expect(todayBox).toBeVisible();
      await expect(todayBox).toHaveClass(/is-today/);
      await expect(todayBox).toHaveAttribute('data-is-today', 'true');
      await expect(todayBox).toHaveAttribute('aria-current', 'date');
      await expect(todayBox.locator('[data-testid="meal-allergens-today-badge"]')).toBeVisible();
      await expect(todayBox.locator('[data-testid="meal-allergens-today-badge"]')).toHaveText('Heute');
    }

    // Verify dark theme styling for month selector and default day boxes
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const selectorControls = page.locator('.meal-allergens-controls');
    await expect(selectorControls).toHaveCSS('background-color', 'rgb(41, 42, 45)');
    const defaultDayBox = page.locator('.meal-allergen-day-box.bg-default:not(.outside-month)').first();
    if (await defaultDayBox.count() > 0) {
      await expect(defaultDayBox).toHaveCSS('background-color', 'rgb(41, 42, 45)');
    }
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

    // 5. Switch to Mobile viewport (390x844 <= 768px) -> verify week selector and 5 vertically stacked boxes
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('meal-allergens-week-selector')).toBeVisible();
    await expect(page.locator('[data-testid^="meal-allergens-day-box-"]')).toHaveCount(5);
    if (now.getDay() >= 1 && now.getDay() <= 5) {
      const mobileTodayBox = page.getByTestId(`meal-allergens-day-box-${todayKey}`);
      await expect(mobileTodayBox).toBeVisible();
      await expect(mobileTodayBox).toHaveClass(/is-today/);
      await expect(mobileTodayBox).toHaveAttribute('data-is-today', 'true');
      await expect(mobileTodayBox.locator('[data-testid="meal-allergens-today-badge"]')).toBeVisible();
    }

    // Switch back to Desktop viewport (1200x800)
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('[data-testid^="meal-allergens-day-box-"]')).toHaveCount(25);

    const futureBox = page.getByTestId(`meal-allergens-day-box-${futureMealDate}`);
    if ((await futureBox.count()) === 0) {
      await page.getByTestId('meal-allergens-next-month').click();
    }
    await expect(futureBox).toBeVisible();
    await expect(futureBox).toHaveAttribute('data-bg-variant', 'default');

    // 6. Click on futureMealDate box to open the Allergens Editor
    await futureBox.click();
    const editor = page.getByTestId('meal-allergens-editor');
    await expect(editor).toBeVisible();

    // Verify documentation field is NOT present in the editor
    await expect(page.getByTestId('documentation-pdf-input')).toHaveCount(0);

    // Verify header shows only the day (not the meal name)
    const headerTitle = page.getByTestId('allergens-editor-header-title');
    await expect(headerTitle).not.toContainText('Spaghetti Bolognese');
    await expect(headerTitle).not.toContainText('Gurkensalat');

    // Verify cook label is "Es kocht" and cook selector is visible
    const cookField = page.locator('.meal-allergens-field-group');
    await expect(cookField.locator('.meal-allergens-field-label')).toHaveText('Es kocht');
    await expect(page.getByTestId('cook-combobox')).toBeVisible();
    await expect(page.getByTestId('cooks-display-text')).toHaveText('Anna Köchin');
    await expect(page.getByTestId('edit-cooks-btn')).toBeVisible();

    // Verify read-only meal plan reference box is visible at the top, left-aligned (not indented), and inline comma-separated
    const planRefEl = page.getByTestId('meal-plan-reference-box');
    await expect(planRefEl).toBeVisible();
    await expect(planRefEl).toContainText('Laut Speiseplan: Anna Köchin — Spaghetti Bolognese, Gurkensalat');
    await expect(page.getByTestId('meal-plan-ref-cook')).toHaveText('Anna Köchin');
    await expect(page.getByTestId('plan-comp-chip-0')).toHaveText('Spaghetti Bolognese');
    await expect(page.getByTestId('plan-comp-chip-1')).toHaveText('Gurkensalat');

    // Verify layout alignment on large viewport (1280x800):
    // - Status text left edge aligns with Date title left edge
    // - History button is on the Status line and right-aligned with Copy button
    // - Laut Speiseplan box is not indented (aligns with Back button and Es kocht label left edge)
    // - Es kocht meta grid has no separate background color or border
    const backBtnBox = await page.getByTestId('allergens-editor-back-btn').boundingBox();
    const titleBox = await headerTitle.boundingBox();
    const copyBtnBox = await page.getByTestId('copy-allergens-from-btn').boundingBox();
    const statusBox = await page.getByTestId('allergens-editor-status').boundingBox();
    const historyBtnBox = await page.getByTestId('allergens-history-btn').boundingBox();
    const planRefBox = await planRefEl.boundingBox();
    const cookLabelBox = await cookField.locator('.meal-allergens-field-label').boundingBox();

    expect(backBtnBox && titleBox && copyBtnBox && statusBox && historyBtnBox && planRefBox && cookLabelBox).toBeTruthy();
    if (backBtnBox && titleBox && copyBtnBox && statusBox && historyBtnBox && planRefBox && cookLabelBox) {
      // Status text aligns with date title
      expect(Math.abs(statusBox.x - titleBox.x)).toBeLessThanOrEqual(2);
      // History button is on the same horizontal row as status text and right-aligned
      expect(Math.abs((statusBox.y + statusBox.height / 2) - (historyBtnBox.y + historyBtnBox.height / 2))).toBeLessThanOrEqual(6);
      expect(Math.abs((historyBtnBox.x + historyBtnBox.width) - (copyBtnBox.x + copyBtnBox.width))).toBeLessThanOrEqual(2);
      // Laut Speiseplan is placed on the left (not indented under date/status)
      expect(Math.abs(planRefBox.x - backBtnBox.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(cookLabelBox.x - backBtnBox.x)).toBeLessThanOrEqual(2);
    }

    const metaGridStyles = await page.locator('.meal-allergens-meta-grid').evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { bg: cs.backgroundColor, borderTopWidth: cs.borderTopWidth };
    });
    expect(metaGridStyles.bg).toBe('rgba(0, 0, 0, 0)');
    expect(metaGridStyles.borderTopWidth).toBe('0px');

    // Verify layout alignment on small viewport (375x667) as well
    await page.setViewportSize({ width: 375, height: 667 });
    const mobileBackBox = await page.getByTestId('allergens-editor-back-btn').boundingBox();
    const mobileTitleBox = await headerTitle.boundingBox();
    const mobileCopyBox = await page.getByTestId('copy-allergens-from-btn').boundingBox();
    const mobileStatusBox = await page.getByTestId('allergens-editor-status').boundingBox();
    const mobileHistoryBox = await page.getByTestId('allergens-history-btn').boundingBox();
    const mobilePlanRefBox = await planRefEl.boundingBox();
    if (mobileBackBox && mobileTitleBox && mobileCopyBox && mobileStatusBox && mobileHistoryBox && mobilePlanRefBox) {
      expect(Math.abs(mobileStatusBox.x - mobileTitleBox.x)).toBeLessThanOrEqual(2);
      expect(Math.abs((mobileStatusBox.y + mobileStatusBox.height / 2) - (mobileHistoryBox.y + mobileHistoryBox.height / 2))).toBeLessThanOrEqual(6);
      expect(Math.abs((mobileHistoryBox.x + mobileHistoryBox.width) - (mobileCopyBox.x + mobileCopyBox.width))).toBeLessThanOrEqual(2);
      expect(Math.abs(mobilePlanRefBox.x - mobileBackBox.x)).toBeLessThanOrEqual(2);
    }
    await page.setViewportSize({ width: 1280, height: 800 });

    // 7. Verify meal plan components are NOT transferred to allergens by default
    await expect(page.locator('[data-testid^="meal-component-card-"]')).toHaveCount(0);

    // Empty state dropzone is removed (not shown)
    await expect(page.getByTestId('components-empty-dropzone')).toHaveCount(0);

    // Verify completion checklist next to Finalisieren button:
    // Cook was matched from plan ("Anna Köchin"), so cook requirement is satisfied (disappears)
    await expect(page.getByTestId('checklist-item-cook')).toHaveCount(0);
    // Components requirement is NOT yet satisfied (shows pending chip)
    await expect(page.getByTestId('checklist-item-components')).toBeVisible();

    // Verify "Finalisieren" button exists under meal components and is initially disabled (no components yet)
    await expect(page.getByTestId('finalize-allergens-btn')).toBeVisible();
    await expect(page.getByTestId('finalize-allergens-btn')).toHaveText('Finalisieren');
    await expect(page.getByTestId('finalize-allergens-btn')).toBeDisabled();

    // Verify "Finalisieren" button has a gray background when disabled (not green)
    const disabledBgLight = await page.getByTestId('finalize-allergens-btn').evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(disabledBgLight).not.toBe('rgb(22, 163, 74)');
    expect(disabledBgLight).toBe('rgb(241, 245, 249)');

    // In dark mode, disabled background is dark gray
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const disabledBgDark = await page.getByTestId('finalize-allergens-btn').evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(disabledBgDark).not.toBe('rgb(22, 163, 74)');
    expect(disabledBgDark).toBe('rgb(53, 54, 58)');
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

    // Verify history icon next to Status at the top of the editor
    const historyBtn = page.getByTestId('allergens-history-btn');
    await expect(historyBtn).toBeVisible();
    await historyBtn.click();

    // History viewer modal opens and shows empty or initial history
    const historyModal = page.getByTestId('meal-allergens-history-modal');
    await expect(historyModal).toBeVisible();
    await expect(historyModal.getByTestId('history-modal-title')).toBeVisible();
    await historyModal.getByTestId('close-history-modal-btn').click();
    await expect(historyModal).toHaveCount(0);

    // 8. Verify "+ Komponente" button opens editing popover:
    const addCompBtn = page.getByTestId('add-meal-component-btn');
    await expect(addCompBtn).toContainText('Komponente hinzufügen...');
    await addCompBtn.click();

    // Component popover opens with name input
    await expect(page.getByTestId('meal-component-name-input-0')).toBeVisible();

    // Verify popover covers 80% of screen height on desktop (800 * 0.8 = 640)
    const popoverEl = page.locator('.meal-component-popover');
    await expect(popoverEl).toBeVisible();
    const popoverBox = await popoverEl.boundingBox();
    expect(popoverBox).not.toBeNull();
    if (popoverBox) {
      expect(Math.round(popoverBox.height)).toBe(640);
    }

    // Verify discarding empty component:
    // If the user clicks "+ Komponente" and exits without typing a name, no component is created
    await page.getByTestId('close-component-popover-btn').click();
    await expect(page.locator('[data-testid^="meal-component-card-"]')).toHaveCount(0);

    // Click "+ Komponente" again
    await addCompBtn.click();
    await expect(page.getByTestId('meal-component-name-input-0')).toBeVisible();

    // Verify allergens section is locked/disabled and shows hint until name is given
    await expect(page.getByTestId('name-required-hint')).toBeVisible();
    await expect(page.getByTestId('allergen-option-0-gluten')).toBeDisabled();
    await expect(page.getByTestId('custom-allergen-input-0')).toBeDisabled();
    await expect(page.getByTestId('custom-allergen-add-btn-0')).toBeDisabled();

    // Popover footer should NOT have a delete button, only "Fertig"
    await expect(page.locator('[data-testid^="remove-meal-component-btn-popover"]')).toHaveCount(0);
    await expect(page.getByTestId('popover-done-btn')).toBeVisible();

    // Verify taking component from meal plan fills into the name input, unlocks allergens, and closing saves
    await page.getByTestId('take-plan-component-btn-0-0').click();
    await expect(page.getByTestId('meal-component-name-input-0')).toHaveValue('Spaghetti Bolognese');
    await expect(page.getByTestId('name-required-hint')).toHaveCount(0);
    await expect(page.getByTestId('allergen-option-0-gluten')).toBeEnabled();
    await page.getByTestId('meal-component-name-input-0').press('Enter');
    await expect(page.getByTestId('meal-component-name-text-0')).toHaveText('Spaghetti Bolognese');
    // Empty state dropzone disappears once components exist
    await expect(page.getByTestId('components-empty-dropzone')).toHaveCount(0);
    // Components requirement in checklist is now satisfied (both cook and components satisfied, so no pending chips)
    await expect(page.getByTestId('checklist-item-components')).toHaveCount(0);
    await expect(page.getByTestId('checklist-item-cook')).toHaveCount(0);
    await expect(page.getByTestId('finalize-allergens-btn')).toBeEnabled();

    // When enabled, Finalisieren button has green background
    const enabledBg = await page.getByTestId('finalize-allergens-btn').evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(enabledBg).toBe('rgb(22, 163, 74)');

    // Open history viewer to verify change tracking for this day
    await page.getByTestId('allergens-history-btn').click();
    await expect(page.getByTestId('meal-allergens-history-modal')).toBeVisible();
    await expect(page.getByTestId('history-entries-list')).toBeVisible();
    await expect(page.getByTestId('history-entry-0')).toBeVisible();
    await expect(page.getByTestId('history-who-0')).toContainText('developer@example.com');
    await expect(page.getByTestId('history-what-0')).toContainText('Spaghetti Bolognese');
    await expect(page.getByTestId('history-when-0')).toBeVisible();
    await page.getByTestId('close-history-modal-btn').click();
    await expect(page.getByTestId('meal-allergens-history-modal')).toHaveCount(0);

    // Add second component (Gurkensalat) from meal plan suggestion
    await addCompBtn.click();
    await page.getByTestId('take-plan-component-btn-1-1').click();
    await expect(page.getByTestId('meal-component-name-input-1')).toHaveValue('Gurkensalat');
    await page.getByTestId('meal-component-name-input-1').press('Enter');
    await expect(page.getByTestId('meal-component-name-text-1')).toHaveText('Gurkensalat');

    // Clicking pencil icon opens component popover
    await page.getByTestId('edit-meal-component-name-btn-0').click();
    await expect(page.getByTestId('meal-component-name-input-0')).toBeVisible();

    // 9. Verify allergen list presentation:
    // - main name in bold
    // - subtypes in a line under the main allergen name
    // - icon in front of main allergen name
    const glutenOption = page.getByTestId('allergen-option-0-gluten');
    await expect(glutenOption.locator('.meal-allergen-main-name')).toHaveText('Glutenhaltiges Getreide');
    await expect(glutenOption.locator('.meal-allergen-subtypes')).toContainText('Weizen');
    await expect(glutenOption.locator('.meal-allergen-icon-wrap')).toBeVisible();

    // Verify Kiwi allergen option exists with icon
    const kiwiOption = page.getByTestId('allergen-option-0-kiwi');
    await expect(kiwiOption.locator('.meal-allergen-main-name')).toHaveText('Kiwi');
    await expect(kiwiOption.locator('.meal-allergen-icon-wrap')).toBeVisible();

    // Add a main allergen ("gluten") and a custom allergen ("Knoblauch") to component 0
    await glutenOption.click();

    await page.getByTestId('custom-allergen-input-0').fill('Knoblauch');
    await expect(page.getByTestId('custom-allergen-add-btn-0')).toHaveText('+');
    await page.getByTestId('custom-allergen-add-btn-0').click();

    // Close popover via Fertig button
    await page.getByTestId('popover-done-btn').click();
    await expect(page.getByTestId('allergen-picker-panel-0')).toHaveCount(0);

    // Verify allergen pills visible on the component card (only main label for gluten/schalenfruechte)
    await expect(page.getByTestId('allergen-pill-0-gluten')).toHaveText('Glutenhaltiges Getreide');
    await expect(page.getByTestId('allergen-pill-0-Knoblauch')).toHaveText('Knoblauch');

    // 10. Add third component with typed name, then test unnamed component display and delete it
    await addCompBtn.click();
    await expect(page.getByTestId('meal-component-name-input-2')).toBeVisible();
    await page.getByTestId('meal-component-name-input-2').fill('Vanillepudding');
    await page.getByTestId('meal-component-name-input-2').press('Enter');
    await expect(page.getByTestId('meal-component-name-text-2')).toHaveText('Vanillepudding');

    // Click pencil on component 2, clear name, and press Enter -> displays "Unbenannte Komponente"
    await page.getByTestId('edit-meal-component-name-btn-2').click();
    await page.getByTestId('meal-component-name-input-2').fill('');
    await page.getByTestId('meal-component-name-input-2').press('Enter');
    await expect(page.getByTestId('meal-component-name-text-2')).toHaveText('Unbenannte Komponente');

    // Delete component 2 using the RowActionsMenu (... menu) on the card
    await page.getByTestId('component-actions-btn-2').click();
    await page.getByTestId('remove-meal-component-btn-2').click();
    await expect(page.getByTestId('meal-component-card-2')).toHaveCount(0);
    await expect(page.getByTestId('meal-component-card-2')).toHaveCount(0);

    // 11. Test Multi-Select Cook Popover:
    // Clicking the edit icon next to "Es kocht" opens the popover with checkboxes, ordered as:
    // - employees with type cook first ("Sabine Mitarbeiterin")
    // - parents after that, ordered by canonical family name & given name ("Anton Becker", "Zoe Becker", "Markus Elternkoch")
    // - remaining employees after that ("Vera Erzieherin")
    // And without "Elternteil" / "Mitarbeitende(r)" badges.
    await page.getByTestId('edit-cooks-btn').click();
    const cooksPopover = page.getByTestId('cooks-popover');
    await expect(cooksPopover).toBeVisible();
    await expect(cooksPopover).not.toContainText('Elternteil');
    await expect(cooksPopover).not.toContainText('Mitarbeitende(r)');

    const optionNames = await cooksPopover.locator('.meal-allergens-cook-option-name').allTextContents();
    expect(optionNames).toEqual([
      'Sabine Mitarbeiterin',
      'Anton Becker',
      'Zoe Becker',
      'Markus Elternkoch',
      'Vera Erzieherin',
    ]);

    // Test quick filter inside cooks popover
    const filterInput = page.getByTestId('cooks-quick-filter-input');
    await filterInput.fill('Sabine');
    await expect(cooksPopover.locator('.meal-allergens-cook-option-name')).toHaveCount(1);
    await expect(cooksPopover.locator('.meal-allergens-cook-option-name').first()).toHaveText('Sabine Mitarbeiterin');
    await filterInput.fill('');
    await expect(cooksPopover.locator('.meal-allergens-cook-option-name')).toHaveCount(5);

    // Close cooks popover so "Anna Köchin" stays the cook for the "Kopieren von..." suggestions test below
    await page.getByTestId('cooks-popover-done-btn').click();
    await expect(cooksPopover).toHaveCount(0);

    // 11. Test "Copy allergens from" (renamed to "Kopieren von...")
    const copyBtn = page.getByTestId('copy-allergens-from-btn');
    await expect(copyBtn).toHaveText('Kopieren von...');
    await copyBtn.click();
    const copyModal = page.getByTestId('copy-allergens-modal');
    await expect(copyModal).toBeVisible();

    const suggestionItems = copyModal.locator('[data-testid^="copy-suggestion-item-"]');
    await expect(suggestionItems).toHaveCount(3);
    await expect(suggestionItems.first()).toHaveAttribute('data-date', past3Date);

    // Test fulltext search in Copy modal: type "Linsensuppe" and press Enter
    const searchInput = page.getByTestId('copy-picker-search-input');
    await searchInput.fill('Linsensuppe');
    await searchInput.press('Enter');

    const jumpedBox = page.getByTestId(`copy-picker-day-box-${pastMealDate}`);
    await expect(jumpedBox).toBeVisible();
    await expect(jumpedBox).toHaveAttribute('data-search-match', 'true');
    await expect(jumpedBox).toHaveAttribute('data-search-active-match', 'true');

    // Click the first suggestion (past3Date: Spaghetti Napoli [gluten], Gurkensalat [senf])
    await suggestionItems.first().click();

    // Combine vs Replace dialog appears
    const conflictDialog = page.getByTestId('copy-conflict-dialog');
    await expect(conflictDialog).toBeVisible();
    await page.getByTestId('copy-combine-btn').click();
    await expect(conflictDialog).toHaveCount(0);
    await expect(copyModal).toHaveCount(0);

    // Verify Gurkensalat now has "senf" combined, and Spaghetti Bolognese still has "gluten" and "Knoblauch"
    await expect(page.getByTestId('allergen-pill-0-gluten')).toBeVisible();
    await expect(page.getByTestId('allergen-pill-0-Knoblauch')).toBeVisible();
    await expect(page.getByTestId('allergen-pill-1-senf')).toBeVisible();

    // 12. Test finalization via the "Finalisieren" button under meal components
    const finalizeBtn = page.getByTestId('finalize-allergens-btn');
    await expect(finalizeBtn).toBeVisible();
    await expect(finalizeBtn).toHaveText('Finalisieren');
    await expect(finalizeBtn).toBeEnabled();

    // Clicking Finalisieren prompts confirmation dialog ("Allergene finalisieren?")
    let confirmPrompt = '';
    page.once('dialog', async (dialog) => {
      confirmPrompt = dialog.message();
      await dialog.accept();
    });
    await finalizeBtn.click();
    expect(confirmPrompt).toBe('Allergene finalisieren?');

    // Status moves forward to Abgeschlossen
    await expect(page.getByTestId('allergens-editor-status')).toHaveText('Status: Abgeschlossen');
    await expect(finalizeBtn).toBeDisabled();

    // Go back to overview and verify the box is greenish (finalized)
    await page.getByTestId('allergens-editor-back-btn').click();
    await expect(page.getByTestId(`meal-allergens-day-box-${futureMealDate}`)).toHaveAttribute(
      'data-bg-variant',
      'finalized'
    );

    // 13. Re-open finalized day -> verify status shows "Abgeschlossen" and NO warning banner is shown
    await page.getByTestId(`meal-allergens-day-box-${futureMealDate}`).click();
    await expect(page.getByTestId('allergens-editor-status')).toContainText('Abgeschlossen');
    await expect(page.getByTestId('finalized-warning-banner')).toHaveCount(0);

    // Verify exiting edit popover without making changes does NOT reset status to draft
    await page.getByTestId('edit-meal-component-name-btn-0').click();
    await expect(page.getByTestId('meal-component-name-input-0')).toBeVisible();
    await page.getByTestId('popover-done-btn').click();
    await expect(page.getByTestId('allergens-editor-status')).toHaveText('Status: Abgeschlossen');
    await expect(finalizeBtn).toBeDisabled();

    // 14. Edit allergens -> verify editing resets status to "Entwurf", and Finalisieren is re-enabled
    await page.getByTestId('edit-meal-component-name-btn-0').click();
    await expect(page.getByTestId('meal-component-name-input-0')).toBeVisible();
    await page.getByTestId('remove-allergen-btn-0-Knoblauch').click();
    await page.getByTestId('popover-done-btn').click();
    await expect(page.getByTestId('allergens-editor-status')).toHaveText('Status: Entwurf');
    await expect(page.getByTestId('finalized-warning-banner')).toHaveCount(0);
    await expect(page.getByTestId('finalize-allergens-btn')).toBeEnabled();

    await page.getByTestId('allergens-editor-back-btn').click();
    await expect(page.getByTestId(`meal-allergens-day-box-${futureMealDate}`)).toHaveAttribute(
      'data-bg-variant',
      'not_finalized_upcoming'
    );

    // 15. Open unseeded day without cook or components -> verify reference box displays "Nichts eingetragen" once, and finalize button is disabled
    let unseededBox = page.getByTestId(`meal-allergens-day-box-${unseededDate}`);
    if ((await unseededBox.count()) === 0) {
      await page.getByTestId('meal-allergens-prev-month').click();
      unseededBox = page.getByTestId(`meal-allergens-day-box-${unseededDate}`);
    }
    await unseededBox.click();
    await expect(page.getByTestId('meal-plan-reference-box')).toBeVisible();
    await expect(page.getByTestId('meal-plan-reference-box')).toContainText('Laut Speiseplan:');
    await expect(page.getByTestId('meal-plan-empty-text')).toHaveText('Nichts eingetragen');
    await expect(page.getByTestId('meal-plan-ref-cook')).toHaveCount(0);

    // Empty dropzone card is removed (not shown)
    await expect(page.getByTestId('components-empty-dropzone')).toHaveCount(0);

    // Both cook and components requirements are pending in the checklist
    await expect(page.getByTestId('checklist-item-cook')).toBeVisible();
    await expect(page.getByTestId('checklist-item-components')).toBeVisible();
    await expect(page.getByTestId('finalize-allergens-btn')).toBeDisabled();

    // Add a component via button inside the empty dropzone
    const unseededAddCompBtn = page.getByTestId('add-meal-component-btn');
    await unseededAddCompBtn.click();
    const unseededCompInput = page.getByTestId('meal-component-name-input-0');
    await unseededCompInput.fill('Suppe');
    await unseededCompInput.press('Enter');

    // Dropzone disappears, component checklist item satisfied (disappears), but cook is still pending -> Finalize remains disabled
    await expect(page.getByTestId('components-empty-dropzone')).toHaveCount(0);
    await expect(page.getByTestId('checklist-item-components')).toHaveCount(0);
    await expect(page.getByTestId('checklist-item-cook')).toBeVisible();
    await expect(page.getByTestId('finalize-allergens-btn')).toBeDisabled();

    // Clicking cook checklist item opens the cooks popover
    await page.getByTestId('checklist-item-cook').click();
    const unseededPopover = page.getByTestId('cooks-popover');
    await expect(unseededPopover).toBeVisible();

    // Select two people with the same surname ("Anton Becker" and "Zoe Becker")
    await unseededPopover.locator('.meal-allergens-cook-checkbox-item', { hasText: 'Anton Becker' }).click();
    await unseededPopover.locator('.meal-allergens-cook-checkbox-item', { hasText: 'Zoe Becker' }).click();
    await page.getByTestId('cooks-popover-done-btn').click();

    // Cook requirement is now satisfied (disappears), Finalize button is ENABLED, and display shows "Anton & Zoe Becker"
    await expect(page.getByTestId('checklist-item-cook')).toHaveCount(0);
    await expect(page.getByTestId('finalize-allergens-btn')).toBeEnabled();
    await expect(page.getByTestId('cooks-display-text')).toHaveText('Anton & Zoe Becker');

    // Re-open the cooks popover -> already selected cooks ("Anton Becker", "Zoe Becker") are shown FIRST at the top!
    await page.getByTestId('edit-cooks-btn').click();
    await expect(unseededPopover).toBeVisible();
    const reopenedNames = await unseededPopover.locator('.meal-allergens-cook-option-name').allTextContents();
    expect(reopenedNames.slice(0, 2)).toEqual(['Anton Becker', 'Zoe Becker']);
    await page.getByTestId('cooks-popover-done-btn').click();

    // Go back to overview and verify the day box displays "Anton & Zoe Becker"
    await page.getByTestId('allergens-editor-back-btn').click();
    await expect(page.getByTestId(`meal-allergens-day-box-${unseededDate}`)).toContainText('Anton & Zoe Becker');

    // Re-open unseededDate and deselect both cooks from the top of the popover -> cook requirement becomes pending again!
    await page.getByTestId(`meal-allergens-day-box-${unseededDate}`).click();
    await page.getByTestId('edit-cooks-btn').click();
    await unseededPopover.locator('.meal-allergens-cook-checkbox-item', { hasText: 'Anton Becker' }).click();
    await unseededPopover.locator('.meal-allergens-cook-checkbox-item', { hasText: 'Zoe Becker' }).click();
    await page.getByTestId('cooks-popover-done-btn').click();
    await expect(page.getByTestId('checklist-item-cook')).toBeVisible();
    await expect(page.getByTestId('finalize-allergens-btn')).toBeDisabled();
  });
});
