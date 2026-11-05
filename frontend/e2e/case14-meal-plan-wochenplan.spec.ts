import { test, expect } from '@playwright/test';
import {
  getMondayOfWeek,
  getDefaultMealPlanMonday,
  getWeekAnnotation,
  getWeekDays,
  formatDateKey,
} from '../src/utils/mealPlan';

test.describe('Test Case 14: Essen/Wochenplan Tab and Print Layout', () => {
  test('unit tests: verify date calculation rules and translated week annotations', () => {
    // 1. Current week Monday calculation
    const mon = new Date(2026, 9, 19); // Oct 19 2026 (Monday)
    const tue = new Date(2026, 9, 20); // Tuesday
    const wed = new Date(2026, 9, 21); // Wednesday
    const thu = new Date(2026, 9, 22); // Thursday
    const fri = new Date(2026, 9, 23); // Friday
    const sat = new Date(2026, 9, 24); // Saturday
    const sun = new Date(2026, 9, 25); // Sunday

    expect(formatDateKey(getMondayOfWeek(mon))).toBe('2026-10-19');
    expect(formatDateKey(getMondayOfWeek(tue))).toBe('2026-10-19');
    expect(formatDateKey(getMondayOfWeek(wed))).toBe('2026-10-19');
    expect(formatDateKey(getMondayOfWeek(thu))).toBe('2026-10-19');
    expect(formatDateKey(getMondayOfWeek(fri))).toBe('2026-10-19');
    expect(formatDateKey(getMondayOfWeek(sat))).toBe('2026-10-19');
    expect(formatDateKey(getMondayOfWeek(sun))).toBe('2026-10-19');

    // 2. Default starting week rule:
    // "start on the current week, unless it's Thursday or Friday, then it should start on next week."
    expect(formatDateKey(getDefaultMealPlanMonday(mon))).toBe('2026-10-19'); // Monday -> current week
    expect(formatDateKey(getDefaultMealPlanMonday(tue))).toBe('2026-10-19'); // Tuesday -> current week
    expect(formatDateKey(getDefaultMealPlanMonday(wed))).toBe('2026-10-19'); // Wednesday -> current week
    expect(formatDateKey(getDefaultMealPlanMonday(thu))).toBe('2026-10-26'); // Thursday -> next week!
    expect(formatDateKey(getDefaultMealPlanMonday(fri))).toBe('2026-10-26'); // Friday -> next week!
    expect(formatDateKey(getDefaultMealPlanMonday(sat))).toBe('2026-10-19'); // Saturday -> current week
    expect(formatDateKey(getDefaultMealPlanMonday(sun))).toBe('2026-10-19'); // Sunday -> current week

    // 3. Translated annotations:
    // German (default): (diese Woche) / (nächste Woche)
    const today = mon; // Reference date: Oct 19
    expect(getWeekAnnotation(new Date(2026, 9, 19), today, 'de')).toBe('(diese Woche)');
    expect(getWeekAnnotation(new Date(2026, 9, 26), today, 'de')).toBe('(nächste Woche)');
    expect(getWeekAnnotation(new Date(2026, 9, 12), today, 'de')).toBeNull(); // Past week
    expect(getWeekAnnotation(new Date(2026, 10, 2), today, 'de')).toBeNull(); // 2 weeks out

    // English: (this week) / (next week)
    expect(getWeekAnnotation(new Date(2026, 9, 19), today, 'en')).toBe('(this week)');
    expect(getWeekAnnotation(new Date(2026, 9, 26), today, 'en')).toBe('(next week)');

    // 4. Exactly 5 days Monday-Friday:
    const days = getWeekDays(mon);
    expect(days).toHaveLength(5);
    expect(days.map(formatDateKey)).toEqual([
      '2026-10-19', // Monday
      '2026-10-20', // Tuesday
      '2026-10-21', // Wednesday
      '2026-10-22', // Thursday
      '2026-10-23', // Friday
    ]);
  });

  test('permission check: presence of tab is behind mealplan.view permission', async ({ page }) => {
    // User without mealplan.view permission
    await page.addInitScript(() => {
      localStorage.setItem('token', 'viewer@example.com');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Essen/Wochenplan tab must NOT be visible for viewer (who lacks mealplan.view)
    await expect(page.locator('.tabs').getByRole('button', { name: 'Essen/Wochenplan' })).toHaveCount(0);
  });

  test('verifies Essen/Wochenplan tab navigation, week selection, arrows, and preview', async ({ request, page }) => {
    // 1. Reset database
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Authenticate as admin user (has * which includes mealplan.view)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Load app
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 4. Verify the tab "Essen/Wochenplan" exists
    const kochenTab = page.getByRole('button', { name: 'Kochen', exact: true });
    if (await kochenTab.isVisible()) {
      await kochenTab.click();
    }
    const mealPlanTabBtn = page.locator('.tabs').getByRole('button', { name: 'Essen/Wochenplan' });
    await expect(mealPlanTabBtn).toBeVisible();

    // 5. Click on the "Essen/Wochenplan" tab
    await mealPlanTabBtn.click();
    await expect(mealPlanTabBtn).toHaveClass(/active/);
    await expect(mealPlanTabBtn).toHaveAttribute('data-active', 'true');
    expect(page.url()).toContain('#mealPlan');

    // 6. Verify week selector controls are visible
    const container = page.locator('[data-testid="meal-plan-tab"]');
    await expect(container).toBeVisible();

    const prevArrow = container.locator('.meal-plan-nav-arrow').first();
    const nextArrow = container.locator('.meal-plan-nav-arrow').nth(1);
    await expect(prevArrow).toBeVisible();
    await expect(nextArrow).toBeVisible();

    // 7. Verify "Drucken" button is present
    const printActionBtn = container.getByRole('button', { name: 'Drucken' });
    await expect(printActionBtn).toBeVisible();

    // 8. Verify the 5 days (Monday to Friday) are shown in the preview
    const dayCols = container.locator('.meal-plan-day-col');
    await expect(dayCols).toHaveCount(5);

    // Verify day titles contain Montag through Freitag
    await expect(dayCols.nth(0).locator('.meal-plan-day-name')).toHaveText('Montag');
    await expect(dayCols.nth(1).locator('.meal-plan-day-name')).toHaveText('Dienstag');
    await expect(dayCols.nth(2).locator('.meal-plan-day-name')).toHaveText('Mittwoch');
    await expect(dayCols.nth(3).locator('.meal-plan-day-name')).toHaveText('Donnerstag');
    await expect(dayCols.nth(4).locator('.meal-plan-day-name')).toHaveText('Freitag');

    // 9. Verify that who is cooking, Tollhaus subtitle, and disclaimer are NOT present
    await expect(container.locator('.meal-plan-cook-box')).toHaveCount(0);
    await expect(container.getByText('Kinderladen Tollhaus e.V.')).toHaveCount(0);
    await expect(container.getByText(/Guten Appetit/i)).toHaveCount(0);

    // 10. Verify Speiseplan title color is black
    const titleColor = await container.locator('.meal-plan-sheet-title').evaluate((el) => {
      return window.getComputedStyle(el).color;
    });
    expect(titleColor).toBe('rgb(0, 0, 0)');

    // 11. Verify navigation with arrows
    const initialLabel = await container.locator('.meal-plan-week-label').innerText();
    // Click next week
    await nextArrow.click();
    await page.waitForTimeout(200);
    const nextLabel = await container.locator('.meal-plan-week-label').innerText();
    expect(nextLabel).not.toBe(initialLabel);

    // Click previous week
    await prevArrow.click();
    await page.waitForTimeout(200);
    const restoredLabel = await container.locator('.meal-plan-week-label').innerText();
    expect(restoredLabel).toBe(initialLabel);
  });

  test('responsive preview: 5-column landscape grid on desktop, vertical stack on mobile (<= 768px)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 1. Desktop layout (1200px > 768px breakpoint)
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/#mealPlan');
    await page.waitForLoadState('networkidle');

    const grid = page.locator('.meal-plan-grid');
    await expect(grid).toBeVisible();

    const desktopDisplay = await grid.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns.split(' ').length,
      };
    });
    expect(desktopDisplay.display).toBe('grid');
    expect(desktopDisplay.gridTemplateColumns).toBe(5);

    // 2. Mobile layout (500px <= 768px breakpoint)
    await page.setViewportSize({ width: 500, height: 800 });
    const mobileDisplay = await grid.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        display: style.display,
        flexDirection: style.flexDirection,
      };
    });
    expect(mobileDisplay.display).toBe('flex');
    expect(mobileDisplay.flexDirection).toBe('column');
  });

  test('print view: standalone page with Print button, hidden upon printing, and A4 landscape sheet', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 1. Open print view URL
    await page.goto('/#mealPlanPrint?week=2026-10-19');
    await page.waitForLoadState('networkidle');

    // 2. Verify standalone print view
    const printView = page.locator('[data-testid="meal-plan-print-view"]');
    await expect(printView).toBeVisible();

    // 3. Verify top toolbar has "Print" button
    const printToolbar = page.locator('.meal-plan-print-toolbar');
    await expect(printToolbar).toBeVisible();
    const printBtn = printToolbar.getByRole('button', { name: 'Print' });
    await expect(printBtn).toBeVisible();

    // 4. Verify printable sheet has 5 days
    const sheet = printView.locator('[data-testid="meal-plan-sheet"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.meal-plan-day-col')).toHaveCount(5);

    // 5. Verify no cook box, no subtitle, no disclaimer
    await expect(sheet.locator('.meal-plan-cook-box')).toHaveCount(0);
    await expect(sheet.getByText('Kinderladen Tollhaus e.V.')).toHaveCount(0);
    await expect(sheet.getByText(/Guten Appetit/i)).toHaveCount(0);

    // 6. Verify Speiseplan title font color is black
    const printTitleColor = await sheet.locator('.meal-plan-sheet-title').evaluate((el) => {
      return window.getComputedStyle(el).color;
    });
    expect(printTitleColor).toBe('rgb(0, 0, 0)');

    // 7. Emulate print media and check that the toolbar is hidden
    await page.emulateMedia({ media: 'print' });
    const toolbarDisplayPrint = await printToolbar.evaluate((el) => window.getComputedStyle(el).display);
    expect(toolbarDisplayPrint).toBe('none');

    // And verify the sheet is visible in print
    const sheetDisplayPrint = await sheet.evaluate((el) => window.getComputedStyle(el).display);
    expect(sheetDisplayPrint).not.toBe('none');

    // Inner meal box has no additional inner border when printing and text is vertically centered
    const innerMealsBoxStyle = await sheet.locator('.meal-plan-meals-box').first().evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        borderStyle: style.borderStyle,
        borderWidth: style.borderWidth,
        justifyContent: style.justifyContent,
      };
    });
    expect(innerMealsBoxStyle.borderStyle).toBe('none');
    expect(innerMealsBoxStyle.justifyContent).toBe('center');
  });

  test('direct printing from mealPlan tab on mobile phone viewport: hides app shell and outputs 5-column landscape grid in print', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 1. Mobile phone viewport (390px x 844px, e.g. iPhone 13)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#mealPlan');
    await page.waitForLoadState('networkidle');

    // 2. On screen: header, tabs, and controls are visible, and meals are stacked vertically
    const header = page.locator('header');
    const tabsWrapper = page.locator('.tabs-wrapper');
    const controls = page.locator('.meal-plan-controls');
    const grid = page.locator('.meal-plan-grid');
    const sheet = page.locator('[data-testid="meal-plan-sheet"]');

    await expect(header).toBeVisible();
    await expect(tabsWrapper).toBeVisible();
    await expect(controls).toBeVisible();

    const screenDisplay = await grid.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        display: style.display,
        flexDirection: style.flexDirection,
      };
    });
    expect(screenDisplay.display).toBe('flex');
    expect(screenDisplay.flexDirection).toBe('column');

    // 3. Switch to print media (simulating tapping "Drucken" / window.print() on mobile)
    await page.emulateMedia({ media: 'print' });

    // Header, tabs, and controls must be hidden without trace
    const headerPrint = await header.evaluate((el) => window.getComputedStyle(el).display);
    const tabsPrint = await tabsWrapper.evaluate((el) => window.getComputedStyle(el).display);
    const controlsPrint = await controls.evaluate((el) => window.getComputedStyle(el).display);

    expect(headerPrint).toBe('none');
    expect(tabsPrint).toBe('none');
    expect(controlsPrint).toBe('none');

    // In print mode, the grid must be 5-column landscape grid even when triggered from a phone
    const printGrid = await grid.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns.split(' ').length,
      };
    });
    expect(printGrid.display).toBe('grid');
    expect(printGrid.gridTemplateColumns).toBe(5);

    // Sheet itself is visible
    const sheetPrint = await sheet.evaluate((el) => window.getComputedStyle(el).display);
    expect(sheetPrint).not.toBe('none');

    // Inner meal box has no additional inner border when printing directly from mealPlan tab and is vertically centered
    const mealBoxStyle = await sheet.locator('.meal-plan-meals-box').first().evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        borderStyle: style.borderStyle,
        borderWidth: style.borderWidth,
        justifyContent: style.justifyContent,
      };
    });
    expect(mealBoxStyle.borderStyle).toBe('none');
    expect(mealBoxStyle.justifyContent).toBe('center');
  });

  test('editing meal descriptions before printing: gray pencil icon, disclaimer note, revert to kochplan value, and session persistence across page reload', async ({ request, page }) => {
    // 1. Reset database
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Seed meal components for the current active meal plan week Monday
    const targetMonday = getDefaultMealPlanMonday();
    const mondayKey = formatDateKey(targetMonday);

    const seedRes = await request.post('/api/test/meal-plan', {
      data: [
        {
          date: mondayKey,
          cook_name: 'Test Koch',
          meal_components: ['Linsensuppe', 'Bauernbrot'],
        },
      ],
    });
    expect(seedRes.ok()).toBeTruthy();

    // 3. Authenticate as admin user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 4. Open #mealPlan
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/#mealPlan');
    await page.waitForLoadState('networkidle');

    const container = page.locator('[data-testid="meal-plan-tab"]');
    await expect(container).toBeVisible();

    // Locate Monday's day column
    const mondayCol = container.locator(`.meal-plan-day-col[data-date="${mondayKey}"]`);
    await expect(mondayCol).toBeVisible();

    // 5. Verify both components are rendered separately
    const comp0 = mondayCol.locator(`[data-testid="meal-plan-component-${mondayKey}-0"]`);
    const comp1 = mondayCol.locator(`[data-testid="meal-plan-component-${mondayKey}-1"]`);
    await expect(comp0).toBeVisible();
    await expect(comp1).toBeVisible();
    await expect(comp0.locator('.meal-plan-component-text')).toHaveText('Linsensuppe');
    await expect(comp1.locator('.meal-plan-component-text')).toHaveText('Bauernbrot');

    // 6. Verify each component has a visible gray edit pencil icon after it
    const pencil0 = comp0.locator('.meal-plan-component-pencil-btn');
    const pencil1 = comp1.locator('.meal-plan-component-pencil-btn');
    await expect(pencil0).toBeVisible();
    await expect(pencil1).toBeVisible();

    const pencilColor = await pencil0.evaluate((el) => window.getComputedStyle(el).color);
    // Slate-500 gray is rgb(100, 116, 139)
    expect(pencilColor).toBe('rgb(100, 116, 139)');

    // 7. Click the edit pencil icon on component 0
    await pencil0.click();

    // Verify edit box appears with input, note, revert button, cancel and save buttons
    const editBox = comp0.locator('.meal-plan-component-edit-box');
    await expect(editBox).toBeVisible();

    const input = comp0.locator('.meal-plan-component-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Linsensuppe');

    // Verify note is displayed in German that this does not change the Kochplan - only for printing
    const note = comp0.locator('[data-testid="meal-plan-edit-note"]');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Dies ändert nicht den Kochplan – nur für den Druck.');

    // Verify "Auf Kochplan-Wert zurücksetzen" button is visible
    const revertBtn = comp0.locator('[data-testid="revert-to-kochplan"]');
    await expect(revertBtn).toBeVisible();
    await expect(revertBtn).toContainText('Auf Kochplan-Wert zurücksetzen');

    // 8. Edit component 0 text and save
    await input.fill('Feine Linsensuppe mit Würstchen');
    const saveBtn = comp0.locator('[data-testid="meal-plan-save-btn"]');
    await saveBtn.click();

    // Edit box disappears and component 0 now displays edited text
    await expect(editBox).toHaveCount(0);
    await expect(comp0.locator('.meal-plan-component-text')).toHaveText('Feine Linsensuppe mit Würstchen');
    // Component 1 is untouched
    await expect(comp1.locator('.meal-plan-component-text')).toHaveText('Bauernbrot');

    // 9. Verify persistence across page reload (session storage)
    await page.reload();
    await page.waitForLoadState('networkidle');

    const mondayColAfterReload = page.locator(`.meal-plan-day-col[data-date="${mondayKey}"]`);
    const comp0AfterReload = mondayColAfterReload.locator(`[data-testid="meal-plan-component-${mondayKey}-0"]`);
    await expect(comp0AfterReload.locator('.meal-plan-component-text')).toHaveText('Feine Linsensuppe mit Würstchen');

    // 10. Test "revert to kochplan value" button
    const pencilAfterReload = comp0AfterReload.locator('.meal-plan-component-pencil-btn');
    await pencilAfterReload.click();

    const revertBtnAfterReload = comp0AfterReload.locator('[data-testid="revert-to-kochplan"]');
    await expect(revertBtnAfterReload).toBeVisible();
    await revertBtnAfterReload.click();

    // Verify component reverted back to original value from Kochplan
    await expect(comp0AfterReload.locator('.meal-plan-component-text')).toHaveText('Linsensuppe');

    // 11. Verify revert is also persisted across reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    const comp0Final = page.locator(`.meal-plan-day-col[data-date="${mondayKey}"] [data-testid="meal-plan-component-${mondayKey}-0"]`);
    await expect(comp0Final.locator('.meal-plan-component-text')).toHaveText('Linsensuppe');

    // 12. Verify print media hides pencil buttons
    await page.emulateMedia({ media: 'print' });
    const finalPencilDisplay = await comp0Final.locator('.meal-plan-component-pencil-btn').evaluate((el) => window.getComputedStyle(el).display);
    expect(finalPencilDisplay).toBe('none');
  });

  test('editing when there is no menu entry: empty day displays edit pencil, entering description persists in session and can be reverted', async ({ page }) => {
    // 1. Authenticate as admin user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    const targetMonday = getDefaultMealPlanMonday();
    const days = getWeekDays(targetMonday);
    const tuesdayKey = formatDateKey(days[1]); // Tuesday (has no menu entries seeded)

    // 2. Open #mealPlan
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/#mealPlan');
    await page.waitForLoadState('networkidle');

    const container = page.locator('[data-testid="meal-plan-tab"]');
    await expect(container).toBeVisible();

    const tuesdayCol = container.locator(`.meal-plan-day-col[data-date="${tuesdayKey}"]`);
    await expect(tuesdayCol).toBeVisible();

    // 3. Verify empty text is shown and edit pencil button is visible
    const emptyText = tuesdayCol.locator('.meal-plan-empty-text');
    await expect(emptyText).toHaveText('Kein Speiseplan eingetragen');

    const emptyEditBtn = tuesdayCol.locator(`[data-testid="edit-meal-empty-${tuesdayKey}"]`);
    await expect(emptyEditBtn).toBeVisible();

    // 4. Click the edit button on empty day
    await emptyEditBtn.click();

    const editBox = tuesdayCol.locator(`[data-testid="meal-plan-edit-box-${tuesdayKey}-0"]`);
    await expect(editBox).toBeVisible();

    const input = tuesdayCol.locator(`[data-testid="meal-plan-component-input-${tuesdayKey}-0"]`);
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('');

    // Verify note is displayed
    const note = editBox.locator('[data-testid="meal-plan-edit-note"]');
    await expect(note).toContainText('Dies ändert nicht den Kochplan – nur für den Druck.');

    // 5. Enter a meal description and save
    await input.fill('Kartoffelpuffer mit Apfelmus');
    const saveBtn = editBox.locator('[data-testid="meal-plan-save-btn"]');
    await saveBtn.click();

    // Edit box disappears and entered meal description is now displayed
    await expect(editBox).toHaveCount(0);
    const comp0 = tuesdayCol.locator(`[data-testid="meal-plan-component-${tuesdayKey}-0"]`);
    await expect(comp0).toBeVisible();
    await expect(comp0.locator('.meal-plan-component-text')).toHaveText('Kartoffelpuffer mit Apfelmus');

    // 6. Verify persistence across page reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    const tuesdayColAfterReload = page.locator(`.meal-plan-day-col[data-date="${tuesdayKey}"]`);
    const comp0AfterReload = tuesdayColAfterReload.locator(`[data-testid="meal-plan-component-${tuesdayKey}-0"]`);
    await expect(comp0AfterReload.locator('.meal-plan-component-text')).toHaveText('Kartoffelpuffer mit Apfelmus');

    // 7. Click edit pencil on the entered meal and revert to kochplan value
    await comp0AfterReload.locator('.meal-plan-component-pencil-btn').click();
    const revertBtn = comp0AfterReload.locator('[data-testid="revert-to-kochplan"]');
    await expect(revertBtn).toBeVisible();
    await revertBtn.click();

    // Verify day goes back to "Kein Speiseplan eingetragen" with edit pencil
    const emptyTextAfterRevert = tuesdayColAfterReload.locator('.meal-plan-empty-text');
    await expect(emptyTextAfterRevert).toHaveText('Kein Speiseplan eingetragen');
    await expect(tuesdayColAfterReload.locator(`[data-testid="edit-meal-empty-${tuesdayKey}"]`)).toBeVisible();

    // 8. Verify revert persists across reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    const tuesdayColFinal = page.locator(`.meal-plan-day-col[data-date="${tuesdayKey}"]`);
    await expect(tuesdayColFinal.locator('.meal-plan-empty-text')).toHaveText('Kein Speiseplan eingetragen');
    await expect(tuesdayColFinal.locator(`[data-testid="edit-meal-empty-${tuesdayKey}"]`)).toBeVisible();
  });
});
