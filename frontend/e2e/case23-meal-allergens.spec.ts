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
  type MealAllergenDay,
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
  });

  test('desktop (5x5 month view) and mobile (5-day week view) layouts, searchable cook dropdown, component popover editor, and copy allergens', async ({
    request,
    page,
  }) => {
    // 1. Reset DB
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const authHeaders = { Authorization: 'Bearer developer@example.com' };

    // Create a parent and an employee to test the searchable cook dropdown
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
    const tabBtn = page.locator('.tabs').getByRole('button', { name: 'Essen/Allergene' });
    await expect(tabBtn).toBeVisible();
    await tabBtn.click();
    await expect(tabBtn).toHaveAttribute('data-active', 'true');
    expect(page.url()).toContain('#mealAllergens');

    // 4. Desktop view: verify month selector and 25 boxes (5x5)
    await expect(page.getByTestId('meal-allergens-month-selector')).toBeVisible();
    const desktopBoxes = page.locator('[data-testid^="meal-allergens-day-box-"]');
    await expect(desktopBoxes).toHaveCount(25);

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

    // Verify cook label is "Koch/Köchin" and cook selector is visible
    const cookField = page.locator('.meal-allergens-field-group');
    await expect(cookField.locator('.meal-allergens-field-label')).toHaveText('Koch/Köchin');
    await expect(page.getByTestId('cook-combobox')).toBeVisible();

    // Verify read-only meal plan reference box is visible at the top and not editable
    await expect(page.getByTestId('meal-plan-reference-box')).toBeVisible();
    await expect(page.getByTestId('meal-plan-reference-box')).toContainText('Laut Speiseplan:');
    await expect(page.getByTestId('meal-plan-ref-cook')).toHaveText('Anna Köchin');
    await expect(page.getByTestId('plan-comp-chip-0')).toHaveText('Spaghetti Bolognese');
    await expect(page.getByTestId('plan-comp-chip-1')).toHaveText('Gurkensalat');

    // 7. Verify meal plan components are NOT transferred to allergens by default
    await expect(page.locator('[data-testid^="meal-component-card-"]')).toHaveCount(0);

    // Verify "Finalisieren" button exists under meal components and is initially disabled (no components yet)
    await expect(page.getByTestId('finalize-allergens-btn')).toBeVisible();
    await expect(page.getByTestId('finalize-allergens-btn')).toHaveText('Finalisieren');
    await expect(page.getByTestId('finalize-allergens-btn')).toBeDisabled();

    // 8. Verify "+ Komponente" button opens editing popover:
    const addCompBtn = page.getByTestId('add-meal-component-btn');
    await expect(addCompBtn).toContainText('Komponente');
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

    // 11. Test Searchable Cook Combobox:
    // Typing filters the list of options; selecting an option selects it; typing unlisted text implicitly persists as custom cook
    const cookInput = page.getByTestId('cook-combobox-input');
    await cookInput.click();
    await cookInput.fill('Sabine');
    const dropdown = page.getByTestId('cook-combobox-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toContainText('Sabine Mitarbeiterin');
    await expect(dropdown).not.toContainText('Markus Elternkoch');

    // Type a custom cook name not in options ("Anna Köchin") and press Enter -> implicitly persisted as custom text
    await cookInput.fill('Anna Köchin');
    await cookInput.press('Enter');
    await expect(cookInput).toHaveValue('Anna Köchin');

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
    await page.getByTestId('remove-allergen-btn-0-Knoblauch').click();
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
    await expect(page.getByTestId('finalize-allergens-btn')).toBeDisabled();
  });
});
