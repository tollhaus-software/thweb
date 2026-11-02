import { test, expect } from '@playwright/test';

test.describe('Test Case 10: Embedded Dashboard Tab', () => {
  test('verifies dashboard is embedded as a tab, navigates smoothly, and header link is removed', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Authenticate as regular user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Load application
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 4. Verify the old dashboard link in header is NOT present
    const header = page.locator('header');
    await expect(header).toBeVisible();
    await expect(header.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);

    // 5. Verify the "Dashboard" tab exists in the tab navigation bar
    const dashboardTab = page.locator('.tabs').getByRole('button', { name: 'Dashboard' });
    await expect(dashboardTab).toBeVisible();

    // 6. Click on the "Dashboard" tab
    await dashboardTab.click();

    // 7. Verify tab is active and hash updated to #dashboard
    await expect(dashboardTab).toHaveClass(/active/);
    await expect(dashboardTab).toHaveAttribute('data-active', 'true');
    expect(page.url()).toContain('#dashboard');

    // 8. Verify embedded dashboard content is rendered
    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    // Verify key dashboard sections are visible inside the embedded container
    await expect(embeddedPage.locator('.kiosk-header-date')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-cook')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-meal')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-todos')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-bottom-nav')).toBeVisible();

    // 9. Verify date navigation arrows
    const prevDayBtn = embeddedPage.locator('.kiosk-header-nav-btn.left');
    const nextDayBtn = embeddedPage.locator('.kiosk-header-nav-btn.right');
    await expect(prevDayBtn).toBeVisible();
    await expect(nextDayBtn).toBeVisible();

    const initialDateText = await embeddedPage.locator('.kiosk-header-date').innerText();
    await prevDayBtn.click();
    await page.waitForTimeout(300);
    const newDateText = await embeddedPage.locator('.kiosk-header-date').innerText();
    expect(newDateText).not.toBe(initialDateText);

    // Click Home button to return to today
    const homeBtn = embeddedPage.locator('.kiosk-nav-home-btn');
    await expect(homeBtn).toBeVisible();
    await homeBtn.click();
    await page.waitForTimeout(300);
    const resetDateText = await embeddedPage.locator('.kiosk-header-date').innerText();
    expect(resetDateText).toBe(initialDateText);

    // 10. Direct navigation with hash #dashboard
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');
    await expect(dashboardTab).toHaveClass(/active/);
    await expect(embeddedPage).toBeVisible();
  });

  test('displays meal components with allergens under official meal plan when allergens are added, and applies reduced font size and spacing', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const testDate = '2026-10-22';

    // 2. Add allergens for testDate
    const putRes = await request.put(`/api/meal-allergens/${testDate}`, {
      headers: {
        Authorization: 'Bearer developer@example.com',
        'Content-Type': 'application/json',
      },
      data: {
        cook_custom_name: 'Sabine Koch',
        meal_components: [
          { name: 'Kürbissuppe', allergens: ['sellerie', 'laktose'] },
          { name: 'Vollkornbrot', allergens: ['gluten'] },
          { name: 'Apfelschnitze', allergens: [] },
        ],
      },
    });
    expect(putRes.ok()).toBeTruthy();

    // 3. Authenticate and load dashboard
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    // 4. Verify reduced font size and tighter spacing on dashboard elements
    const headerDate = embeddedPage.locator('.kiosk-header-date');
    await expect(headerDate).toBeVisible();
    const headerFontSize = await headerDate.evaluate((el) => window.getComputedStyle(el).fontSize);
    // Embedded header date was reduced to 1.5rem (27px at 18px root) from 1.8rem (32.4px)
    expect(parseFloat(headerFontSize)).toBeLessThanOrEqual(28);

    const kioskCard = embeddedPage.locator('.kiosk-card-meal');
    await expect(kioskCard).toBeVisible();
    const cardPadding = await kioskCard.evaluate((el) => window.getComputedStyle(el).paddingTop);
    // Embedded card padding was reduced from 20px (1.25rem) to ~15px (0.95rem)
    expect(parseFloat(cardPadding)).toBeLessThanOrEqual(18);

    // 5. Add allergens for TODAY as well so today immediately has them
    const todayStr = new Date().toISOString().split('T')[0];
    const putTodayRes = await request.put(`/api/meal-allergens/${todayStr}`, {
      headers: {
        Authorization: 'Bearer developer@example.com',
        'Content-Type': 'application/json',
      },
      data: {
        cook_custom_name: 'Sabine Koch',
        meal_components: [
          { name: 'Kürbissuppe', allergens: ['sellerie', 'laktose'] },
          { name: 'Vollkornbrot', allergens: ['gluten'] },
          { name: 'Apfelschnitze', allergens: [] },
        ],
      },
    });
    expect(putTodayRes.ok()).toBeTruthy();

    // Reload page to display today's updated meal allergens
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 6. Verify that the official meal plan card contains the meal allergens section under it
    const mealCard = embeddedPage.locator('.kiosk-card-meal');
    await expect(mealCard).toBeVisible();
    await expect(mealCard.locator('.kiosk-meal-lines')).toBeVisible();

    const allergensSection = mealCard.locator('[data-testid="kiosk-meal-allergens-section"]');
    await expect(allergensSection).toBeVisible();

    // Verify allergens header
    const allergensHeader = allergensSection.locator('.kiosk-meal-allergens-header');
    await expect(allergensHeader).toContainText('Komponenten und Allergene:');

    // Verify edit icon is visible on today
    const editBtn = allergensHeader.locator('[data-testid="kiosk-edit-meal-allergens-btn"]');
    await expect(editBtn).toBeVisible();

    // Verify component 0: Kürbissuppe with Sellerie and Milch/Laktose, with allergens always under component name (flex-direction: column)
    const comp0 = allergensSection.locator('[data-testid="kiosk-allergen-comp-0"]');
    await expect(comp0).toBeVisible();
    const comp0FlexDir = await comp0.evaluate((el) => window.getComputedStyle(el).flexDirection);
    expect(comp0FlexDir).toBe('column');
    await expect(comp0.locator('.kiosk-allergen-comp-name')).toHaveText('Kürbissuppe');
    await expect(comp0.locator('[data-testid="kiosk-allergen-pill-0-sellerie"]')).toContainText('Sellerie');
    await expect(comp0.locator('[data-testid="kiosk-allergen-pill-0-laktose"]')).toContainText('Milch/Laktose');

    // Verify component 1: Vollkornbrot with Glutenhaltiges Getreide
    const comp1 = allergensSection.locator('[data-testid="kiosk-allergen-comp-1"]');
    await expect(comp1).toBeVisible();
    await expect(comp1.locator('.kiosk-allergen-comp-name')).toHaveText('Vollkornbrot');
    await expect(comp1.locator('[data-testid="kiosk-allergen-pill-1-gluten"]')).toContainText('Glutenhaltiges Getreide');

    // Verify component 2: Apfelschnitze with Keine
    const comp2 = allergensSection.locator('[data-testid="kiosk-allergen-comp-2"]');
    await expect(comp2).toBeVisible();
    await expect(comp2.locator('.kiosk-allergen-comp-name')).toHaveText('Apfelschnitze');
    await expect(comp2.locator('.kiosk-allergen-pill-none')).toHaveText('Keine Allergien');

    // 7. Verify day with NO allergens does NOT show the allergens section (and no edit icon when not today)
    const nextDayBtn = embeddedPage.locator('.kiosk-header-nav-btn.right');
    await nextDayBtn.click();
    await page.waitForTimeout(400);

    // On the next day (which has no allergens added), the allergens section should not be visible
    await expect(mealCard.locator('[data-testid="kiosk-meal-allergens-section"]')).toHaveCount(0);
  });

  test('displays allergy matching warnings on dashboard and allows editing today meal components & allergens with history tracking', async ({
    request,
    page,
  }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const authHeaders = {
      Authorization: 'Bearer developer@example.com',
      'Content-Type': 'application/json',
    };
    const todayStr = new Date().toISOString().split('T')[0];

    // 2. Create family & child in Group 1 with Milch/Laktose allergy
    const famRes = await request.post('/api/families', {
      headers: authHeaders,
      data: {
        parents: [
          {
            first_name: 'Anna',
            last_name: 'Match',
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const fam = await famRes.json();

    const childId = crypto.randomUUID();
    const childRes = await request.put(`/api/children/${childId}`, {
      headers: authHeaders,
      data: {
        id: childId,
        family_id: fam.id,
        first_name: 'Leo',
        last_name: 'Match',
        birth_date: '2022-05-10',
        allergies: [{ name: 'Milch/Laktose', category: 'lebensmittel' }],
      },
    });
    expect(childRes.ok()).toBeTruthy();

    const addGcRes = await request.post(`/api/children/${childId}/group_changes`, {
      headers: authHeaders,
      data: {
        child_id: childId,
        change_date: '2024-01-01',
        target_group: 1,
      },
    });
    expect(addGcRes.ok()).toBeTruthy();

    // 3. Load dashboard when today has NO allergens yet — edit icon should still be visible on today
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    const mealCard = embeddedPage.locator('.kiosk-card-meal');
    const allergensSection = mealCard.locator('[data-testid="kiosk-meal-allergens-section"]');
    await expect(allergensSection).toBeVisible();
    await expect(allergensSection.locator('.kiosk-meal-allergens-header')).toContainText(
      'Komponenten und Allergene:'
    );

    const editBtn = allergensSection.locator('[data-testid="kiosk-edit-meal-allergens-btn"]');
    await expect(editBtn).toBeVisible();

    // 4. Click edit icon to open MealAllergensEditor inside dashboard
    await editBtn.click();
    const editor = embeddedPage.locator('[data-testid="meal-allergens-editor"]');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('data-loaded', 'true');

    // Verify "Laut Speiseplan:" is NOT shown when editing from dashboard, and cook label is "Es kocht"
    await expect(editor.locator('[data-testid="meal-plan-reference-box"]')).toHaveCount(0);
    await expect(editor.locator('.meal-allergens-field-label')).toHaveText('Es kocht');

    // Verify empty dropzone card is NOT shown
    await expect(editor.locator('[data-testid="components-empty-dropzone"]')).toHaveCount(0);

    // Verify history icon next to Status is visible in dashboard editor
    const dashboardHistoryBtn = editor.locator('[data-testid="allergens-history-btn"]');
    await expect(dashboardHistoryBtn).toBeVisible();

    // Add a component with Laktose in the editor
    await editor.locator('[data-testid="add-meal-component-btn"]').first().click();
    const nameInput = page.getByTestId('meal-component-name-input-0');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Milchreis');
    await page.getByTestId('allergen-option-0-laktose').click();
    await page.getByTestId('popover-done-btn').click();
    await expect(page.locator('.meal-component-popover')).toHaveCount(0);

    // Verify allergy match warning inside the editor
    await expect(editor.locator('[data-testid="allergen-match-warning-0-laktose"]')).toContainText(
      'Kleine Gruppe'
    );

    // Open history viewer from dashboard editor
    await dashboardHistoryBtn.click();
    const dashboardHistoryModal = page.getByTestId('meal-allergens-history-modal');
    await expect(dashboardHistoryModal).toBeVisible();
    await expect(dashboardHistoryModal.getByTestId('history-entries-list')).toBeVisible();
    await expect(dashboardHistoryModal.getByTestId('history-entry-0')).toBeVisible();
    await expect(dashboardHistoryModal.getByTestId('history-who-0')).toContainText('developer@example.com');
    await expect(dashboardHistoryModal.getByTestId('history-what-0')).toContainText('Milchreis');
    await dashboardHistoryModal.getByTestId('close-history-modal-btn').click();
    await expect(dashboardHistoryModal).toHaveCount(0);

    // 5. Click Back in the editor to return to dashboard view
    await editor.locator('[data-testid="allergens-editor-back-btn"]').click();
    await expect(editor).toHaveCount(0);

    // 6. Verify dashboard now displays the saved component and the matching group warning badge
    await expect(allergensSection.locator('[data-testid="kiosk-allergen-comp-0"]')).toBeVisible();
    await expect(
      allergensSection.locator('[data-testid="kiosk-allergen-comp-0"] .kiosk-allergen-comp-name')
    ).toHaveText('Milchreis');
    await expect(
      allergensSection.locator('[data-testid="kiosk-allergen-pill-0-laktose"]')
    ).toContainText('Milch/Laktose');
    await expect(
      allergensSection.locator('[data-testid="kiosk-allergen-match-warning-0-laktose"]')
    ).toContainText('Kleine Gruppe');

    // 7. Verify meal_allergens_history recorded the change for today
    const historyRes = await request.get(`/api/meal-allergens/history?cooking_date=${todayStr}`, {
      headers: authHeaders,
    });
    expect(historyRes.ok()).toBeTruthy();
    const historyEntries = await historyRes.json();
    expect(historyEntries.length).toBeGreaterThanOrEqual(1);
    expect(historyEntries[0].cooking_date).toBe(todayStr);
    expect(historyEntries[0].changed_by_email).toBe('developer@example.com');
    expect(historyEntries[0].is_kiosk).toBe(false);
    expect(historyEntries[0].after_snapshot.meal_components).toEqual([
      { name: 'Milchreis', allergens: ['laktose'] },
    ]);
  });
});
