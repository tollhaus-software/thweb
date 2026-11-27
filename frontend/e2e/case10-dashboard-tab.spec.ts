import { test, expect, type APIRequestContext } from '@playwright/test';

async function seedDeveloperCookingDutyToday(
  request: APIRequestContext,
  cookFirstName = 'Sabine',
  cookLastName = 'Koch',
  mealComp1 = 'Gemüsesuppe'
) {
  const authHeaders = {
    Authorization: 'Bearer developer@example.com',
    'Content-Type': 'application/json',
  };
  const briefRes = await request.get('/api/dashboard/daily-brief', { headers: authHeaders });
  expect(briefRes.ok()).toBeTruthy();
  const briefData = await briefRes.json();
  const todayStr = briefData.date
    ? briefData.date.split('T')[0]
    : new Date().toISOString().split('T')[0];

  const empRes = await request.post('/api/employees', {
    headers: authHeaders,
    data: {
      first_name: cookFirstName,
      last_name: cookLastName,
      employee_type: 'cook',
      emails: [{ value: 'developer@example.com', identifier_email: true, address_list: true }],
      phones: [],
      address: '',
    },
  });
  expect(empRes.ok()).toBeTruthy();
  const emp = await empRes.json();

  const displayName = `${cookFirstName} ${cookLastName}`.trim();
  const seedPlanRes = await request.post('/api/test/meal-plan', {
    headers: authHeaders,
    data: [
      {
        date: todayStr,
        cook_name: displayName,
        cooks: [
          {
            id: emp.id,
            type: 'employee',
            first_name: cookFirstName,
            last_name: cookLastName,
            display_name: displayName,
          },
        ],
        cook_resolution_status: 'resolved',
        food_component_1: mealComp1,
        food_component_2: '',
        food_component_3: '',
      },
    ],
  });
  expect(seedPlanRes.ok()).toBeTruthy();
  return { emp, todayStr };
}

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
    await expect(header.getByRole('button', { name: 'Kochansicht' })).toHaveCount(0);

    // 5. Verify the "Kochansicht" tab exists under "Kochen" in the tab navigation bar
    await page.locator('.tabs').getByRole('button', { name: 'Kochen', exact: true }).click();
    const dashboardTab = page.locator('.tabs').getByRole('button', { name: 'Kochansicht' });
    await expect(dashboardTab).toBeVisible();

    // 6. Click on the "Kochansicht" tab
    await dashboardTab.click();

    // 7. Verify tab is active and hash updated to #dashboard
    await expect(dashboardTab).toHaveClass(/active/);
    await expect(dashboardTab).toHaveAttribute('data-active', 'true');
    expect(page.url()).toContain('#dashboard');

    // 8. Verify embedded dashboard content is rendered
    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    // Verify key dashboard sections are visible inside the embedded container (Home tab active by default)
    const homeBtn = embeddedPage.locator('.kiosk-nav-home-btn');
    const todosBtn = embeddedPage.getByTestId('kiosk-todos-btn');
    await expect(homeBtn).toBeVisible();
    await expect(homeBtn).toHaveClass(/active/);
    await expect(todosBtn).toBeVisible();
    await expect(todosBtn).toContainText(/TODOs \(\d+\/\d+\)/);

    await expect(embeddedPage.locator('.kiosk-header-date')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-cook')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-meal')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-todos')).toHaveCount(0);
    await expect(embeddedPage.locator('.kiosk-bottom-nav')).toBeVisible();

    // Clicking TODOs nav button switches content between header and footer, highlights TODOs, and hides date change arrows
    await todosBtn.click();
    await expect(todosBtn).toHaveClass(/active/);
    await expect(homeBtn).not.toHaveClass(/active/);
    await expect(embeddedPage.locator('.kiosk-header-date')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-header-nav-btn')).toHaveCount(0);
    await expect(embeddedPage.locator('.kiosk-card-todos')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-cook')).toHaveCount(0);

    // Switch back to Home tab
    await homeBtn.click();
    await expect(homeBtn).toHaveClass(/active/);
    await expect(todosBtn).not.toHaveClass(/active/);
    await expect(embeddedPage.locator('.kiosk-card-cook')).toBeVisible();

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

    // Click Home button while already on Home to return to today
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

    await seedDeveloperCookingDutyToday(request, 'Sabine', 'Koch', 'Kürbissuppe');

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
    const now1 = new Date();
    const todayStr = `${now1.getFullYear()}-${String(now1.getMonth() + 1).padStart(2, '0')}-${String(now1.getDate()).padStart(2, '0')}`;
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

    // Verify component 0: Kürbissuppe with Sellerie and Milch/Laktose, with allergens directly behind component name (flex-direction: row)
    const comp0 = allergensSection.locator('[data-testid="kiosk-allergen-comp-0"]');
    await expect(comp0).toBeVisible();
    const comp0FlexDir = await comp0.evaluate((el) => window.getComputedStyle(el).flexDirection);
    expect(comp0FlexDir).toBe('row');
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

    // 7. Verify next day allows editing allergens from dashboard (edit icon visible, but no allergens listed yet)
    const nextDayBtn = embeddedPage.locator('.kiosk-header-nav-btn.right');
    await nextDayBtn.click();
    await page.waitForTimeout(400);

    // On the next day (which has no allergens added yet), the edit button is visible so allergens can be edited
    const nextDayAllergensSection = mealCard.locator('[data-testid="kiosk-meal-allergens-section"]');
    await expect(nextDayAllergensSection).toBeVisible();
    await expect(nextDayAllergensSection.locator('[data-testid="kiosk-edit-meal-allergens-btn"]')).toBeVisible();
    await expect(nextDayAllergensSection.locator('[data-testid="kiosk-meal-allergens-list"]')).toHaveCount(0);
  });

  test('displays allergy matching warnings on dashboard and allows editing today meal components & allergens with history tracking', async ({
    request,
    page,
  }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    await seedDeveloperCookingDutyToday(request, 'Sabine', 'Koch', 'Milchreis');

    const authHeaders = {
      Authorization: 'Bearer developer@example.com',
      'Content-Type': 'application/json',
    };
    const now2 = new Date();
    const todayStr = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}-${String(now2.getDate()).padStart(2, '0')}`;

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
    const mainHeaderDateBox = await page.locator('.kiosk-header-date').boundingBox();
    await editBtn.click();
    const editor = embeddedPage.locator('[data-testid="meal-allergens-editor"]');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('data-loaded', 'true');

    // Header center date does not jump between main dashboard view and allergens editor view
    const editorHeaderDateBox = await page.locator('.kiosk-header-date').boundingBox();
    await expect(page.locator('.kiosk-header-date')).toContainText('Allergene für');
    if (mainHeaderDateBox && editorHeaderDateBox) {
      const mainCenter = mainHeaderDateBox.x + mainHeaderDateBox.width / 2;
      const editorCenter = editorHeaderDateBox.x + editorHeaderDateBox.width / 2;
      expect(Math.abs(mainCenter - editorCenter)).toBeLessThanOrEqual(2);
    }

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
    await page.getByTestId('component-step-next-btn').click();
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

    // 5. Verify dashboard day header is shown without < > navigation buttons, and click Back to return to dashboard view
    await expect(page.locator('.kiosk-header-date')).toBeVisible();
    await expect(page.locator('.kiosk-header-nav-btn')).toHaveCount(0);
    await page.getByTestId('allergens-editor-back-btn').click();
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

  test('improves tasks handling in dashboard: todo boxes, strikethrough, bottom sorting, today-only restriction, and Allergene eintragen opening editor & marking done upon finalization', async ({ request, page }) => {
    // Automatically accept confirm dialogs
    page.on('dialog', (dialog) => dialog.accept());

    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const authHeaders = {
      Authorization: 'Bearer developer@example.com',
      'Content-Type': 'application/json',
    };

    // Calculate dates matching the backend's current day
    const initialBriefRes = await request.get('/api/dashboard/daily-brief');
    expect(initialBriefRes.ok()).toBeTruthy();
    const initBriefData = await initialBriefRes.json();
    const todayStr = initBriefData.date ? initBriefData.date.split('T')[0] : new Date().toISOString().split('T')[0];

    const todayDateObj = new Date(todayStr + 'T12:00:00Z');
    const tomorrowObj = new Date(todayDateObj);
    tomorrowObj.setUTCDate(tomorrowObj.getUTCDate() + 1);
    const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

    const yesterdayObj = new Date(todayDateObj);
    yesterdayObj.setUTCDate(yesterdayObj.getUTCDate() - 1);
    const yesterdayStr = yesterdayObj.toISOString().split('T')[0];

    // Seed yellow bag for tomorrow so today has task "yellow_bin_put_out" ("Gelbe Tonne rausstellen")
    const seedYellowRes = await request.post('/api/test/yellow-bag', {
      headers: authHeaders,
      data: { dates: [tomorrowStr] },
    });
    expect(seedYellowRes.ok()).toBeTruthy();

    const { emp: devCook } = await seedDeveloperCookingDutyToday(request, 'Küchenchef', 'Anton', 'Gemüsesuppe');

    // Seed meal plan with cook for yesterday, today, and tomorrow
    const seedPlanRes = await request.post('/api/test/meal-plan', {
      headers: authHeaders,
      data: [
        {
          date: yesterdayStr,
          cook_name: 'Koch Gestern',
          food_component_1: 'Gulasch',
          food_component_2: '',
          food_component_3: '',
        },
        {
          date: todayStr,
          cook_name: 'Küchenchef Anton',
          cooks: [
            {
              id: devCook.id,
              type: 'employee',
              first_name: 'Küchenchef',
              last_name: 'Anton',
              display_name: 'Küchenchef Anton',
            },
          ],
          cook_resolution_status: 'resolved',
          food_component_1: 'Gemüsesuppe',
          food_component_2: '',
          food_component_3: '',
        },
        {
          date: tomorrowStr,
          cook_name: 'Koch Zukunft',
          food_component_1: 'Reispfanne',
          food_component_2: '',
          food_component_3: '',
        },
      ],
    });
    expect(seedPlanRes.ok()).toBeTruthy();

    // Authenticate and open dashboard
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    // Switch to TODOs tab via bottom navigation bar
    const todosBtn = embeddedPage.getByTestId('kiosk-todos-btn');
    await expect(todosBtn).toBeVisible();
    await todosBtn.click();
    await expect(todosBtn).toHaveClass(/active/);

    const todosCard = embeddedPage.locator('.kiosk-card-todos');
    await expect(todosCard).toBeVisible();

    const totalTasks = await todosCard.locator('.kiosk-todo-item').count();
    await expect(todosBtn).toContainText(`TODOs (0/${totalTasks})`);

    // Verify task items exist: yellow_bin_put_out and enter_allergens
    const yellowTask = todosCard.locator('[data-testid="kiosk-todo-item-yellow_bin_put_out"]');
    const allergenTask = todosCard.locator('[data-testid="kiosk-todo-item-enter_allergens"]');
    await expect(yellowTask).toBeVisible();
    await expect(allergenTask).toBeVisible();

    // Verify:
    // - yellow_bin_put_out is checkable today -> has checkbox, initially not checked
    // - enter_allergens also has a checkbox for consistency, initially not checked
    const yellowCheckbox = yellowTask.locator('[data-testid="task-checkbox-yellow_bin_put_out"]');
    const allergenCheckbox = allergenTask.locator('[data-testid="task-checkbox-enter_allergens"]');
    await expect(yellowCheckbox).toBeVisible();
    await expect(allergenCheckbox).toBeVisible();
    await expect(allergenCheckbox).not.toHaveClass(/checked/);

    await expect(yellowTask).toHaveAttribute('data-completed', 'false');
    await expect(allergenTask).toHaveAttribute('data-completed', 'false');
    await expect(yellowCheckbox).not.toHaveClass(/checked/);

    // 2. Check yellow_bin_put_out task on today
    // Clicking the checkbox should open confirmation modal ("<task> abhaken?")
    await yellowCheckbox.click();
    const confirmModal = page.locator('[data-testid="task-confirm-modal"]');
    await expect(confirmModal).toBeVisible();
    await expect(confirmModal.locator('[data-testid="task-confirm-modal-title"]')).toHaveText(
      'Gelbe Tonne rausstellen abhaken?'
    );

    // Cancel first to verify dismissal
    await confirmModal.locator('[data-testid="task-confirm-cancel-btn"]').click();
    await expect(confirmModal).not.toBeVisible();
    await expect(yellowTask).toHaveAttribute('data-completed', 'false');

    // Click again and confirm
    await yellowCheckbox.click();
    await expect(confirmModal).toBeVisible();
    await confirmModal.locator('[data-testid="task-confirm-confirm-btn"]').click();
    await expect(confirmModal).not.toBeVisible();

    // Verify it is now marked as done:
    // - striked through in smaller font
    // - check mark in todo box
    // - placed at bottom of list
    await expect(yellowTask).toHaveAttribute('data-completed', 'true');
    await expect(yellowTask).toHaveClass(/kiosk-todo-completed/);
    await expect(yellowCheckbox).toHaveClass(/checked/);
    await expect(yellowCheckbox.locator('.kiosk-todo-check-icon')).toBeVisible();
    await expect(todosBtn).toContainText(`TODOs (1/${totalTasks})`);

    const yellowLabel = yellowTask.locator('.kiosk-todo-label');
    await expect(yellowLabel).toHaveCSS('text-decoration-line', 'line-through');

    // Verify yellow_bin_put_out moved to the bottom after pending tasks
    const todoItems = todosCard.locator('.kiosk-todo-item');
    const lastTodo = todoItems.last();
    await expect(lastTodo).toHaveAttribute('data-task-id', 'yellow_bin_put_out');

    // 3. Verify backend database persistence with day, user, timestamp, task type id
    const briefRes = await request.get('/api/dashboard/daily-brief', {
      headers: authHeaders,
    });
    expect(briefRes.ok()).toBeTruthy();
    const briefData = await briefRes.json();
    expect(briefData.completed_tasks).toBeDefined();
    const yellowCompleted = briefData.completed_tasks.find(
      (ct: { task_type_id: string }) => ct.task_type_id === 'yellow_bin_put_out'
    );
    expect(yellowCompleted).toBeDefined();
    expect(yellowCompleted.task_date).toBe(todayStr);
    expect(yellowCompleted.completed_by_email).toBe('developer@example.com');
    expect(yellowCompleted.is_kiosk).toBe(false);
    expect(yellowCompleted.completed_at).toBeTruthy();

    // 4. Verify date restriction: date changing is hidden on non-Home tabs; switch to Home to navigate to yesterday
    const homeBtn = embeddedPage.locator('.kiosk-nav-home-btn');
    await expect(embeddedPage.locator('.kiosk-header-nav-btn')).toHaveCount(0);
    await homeBtn.click();
    await expect(homeBtn).toHaveClass(/active/);

    const prevDayBtn = embeddedPage.locator('.kiosk-header-nav-btn.left');
    await prevDayBtn.click();
    await page.waitForTimeout(300);

    // Switch to TODOs on yesterday: tasks that are not checkable do NOT have a checkbox, and date arrows are hidden
    await todosBtn.click();
    await expect(todosBtn).toHaveClass(/active/);
    await expect(embeddedPage.locator('.kiosk-header-nav-btn')).toHaveCount(0);
    const pastYellowCheckbox = todosCard.locator('[data-testid="task-checkbox-yellow_bin_put_out"]');
    await expect(pastYellowCheckbox).toHaveCount(0);

    const pastAttempt = await request.post(
      `/api/dashboard/tasks/yellow_bin_put_out/complete?date=2026-01-01`,
      { headers: authHeaders }
    );
    expect(pastAttempt.status()).toBe(400);

    // Return to Home, navigate back to today via nextDayBtn, then switch back to TODOs tab
    await homeBtn.click();
    const nextDayToTodayBtn = embeddedPage.locator('.kiosk-header-nav-btn.right');
    await nextDayToTodayBtn.click();
    await page.waitForTimeout(300);
    await todosBtn.click();
    await expect(todosBtn).toHaveClass(/active/);

    // 5. "Allergene eintragen...": has a pencil icon button instead of the large text button, and only 1 symbol!
    const allergenLabel = allergenTask.locator('[data-testid="task-label-enter_allergens"]');
    await expect(allergenLabel).toHaveText('Allergene eintragen...');

    const openAllergensBtn = allergenTask.locator('[data-testid="open-allergens-editor-btn"]');
    await expect(openAllergensBtn).toBeVisible();
    await expect(openAllergensBtn).toHaveText('');
    await expect(openAllergensBtn.locator('svg')).toBeVisible();
    // Max one symbol on the uncompleted enter_allergens row (just the pencil SVG)
    await expect(allergenTask.locator('svg')).toHaveCount(1);

    // Clicking anywhere on the "Allergene eintragen" TODO item opens the allergens editor directly!
    await allergenLabel.click();
    const editor = embeddedPage.locator('[data-testid="meal-allergens-editor"]');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('data-loaded', 'true');

    // Cook is already matched from meal plan (Küchenchef Anton). Add a component, then finalize
    await editor.locator('[data-testid="add-meal-component-btn"]').first().click();
    const compInput = page.getByTestId('meal-component-name-input-0');
    await expect(compInput).toBeVisible();
    await compInput.fill('Gemüsesuppe');
    await page.getByTestId('component-step-next-btn').click();
    await page.getByTestId('popover-done-btn').click();

    // Click finalize in editor - finalizing should close the allergen editor automatically
    const finalizeBtn = editor.locator('[data-testid="finalize-allergens-btn"]');
    await expect(finalizeBtn).toBeEnabled();
    await finalizeBtn.click();

    // Verify editor is closed automatically and we are back on the TODOs tab
    await expect(editor).toHaveCount(0);
    await expect(todosBtn).toHaveClass(/active/);

    // 6. Verify "Allergene eintragen" is now marked done on the dashboard and bottom bar counter updated!
    const allergenTaskAfter = todosCard.locator('[data-testid="kiosk-todo-item-enter_allergens"]');
    await expect(allergenTaskAfter).toBeVisible();
    await expect(allergenTaskAfter).toHaveAttribute('data-completed', 'true');
    await expect(allergenTaskAfter).toHaveClass(/kiosk-todo-completed/);
    await expect(todosBtn).toContainText(`TODOs (2/${totalTasks})`);

    const allergenCheckboxAfter = allergenTaskAfter.locator('[data-testid="task-checkbox-enter_allergens"]');
    await expect(allergenCheckboxAfter).toBeVisible();
    await expect(allergenCheckboxAfter).toHaveClass(/checked/);
    await expect(allergenCheckboxAfter.locator('.kiosk-todo-check-icon')).toBeVisible();

    const allergenLabelAfter = allergenTaskAfter.locator('.kiosk-todo-label');
    await expect(allergenLabelAfter).toHaveCSS('text-decoration-line', 'line-through');

    // The open button remains displayed, and clicking the completed task row opens the editor
    const openAllergensBtnAfter = allergenTaskAfter.locator('[data-testid="open-allergens-editor-btn"]');
    await expect(openAllergensBtnAfter).toBeVisible();
    await allergenCheckboxAfter.click();
    await expect(editor).toBeVisible();
    await page.getByTestId('allergens-editor-back-btn').click();
    await expect(editor).toHaveCount(0);
    await expect(allergenTaskAfter).toHaveAttribute('data-completed', 'true');

    // 7. Verify future dates ALLOW editing allergens from dashboard, but restrict "Finalisieren" to today!
    // Switch to Home first since date can only be changed on Home
    await homeBtn.click();
    const nextDayBtn = embeddedPage.locator('.kiosk-header-nav-btn.right');
    await nextDayBtn.click();
    await page.waitForTimeout(300);

    // On tomorrow (future date), we are on Home:
    // - Card 3 pencil edit button IS visible
    await expect(homeBtn).toHaveClass(/active/);
    const tomorrowEditPencil = embeddedPage.locator('[data-testid="kiosk-edit-meal-allergens-btn"]');
    await expect(tomorrowEditPencil).toBeVisible();

    await todosBtn.click();

    // - Card 4 allergen task pencil button IS enabled on future date
    const futureAllergenTask = todosCard.locator('[data-testid="kiosk-todo-item-enter_allergens"]');
    await expect(futureAllergenTask).toBeVisible();
    await expect(futureAllergenTask.locator('[data-testid="task-checkbox-enter_allergens"]')).toHaveCount(0);

    const futureOpenBtn = futureAllergenTask.locator('[data-testid="open-allergens-editor-btn"]');
    await expect(futureOpenBtn).toBeVisible();
    await expect(futureOpenBtn).toBeEnabled();

    // Clicking it on the future date OPENS editor
    await futureOpenBtn.click();
    const tomorrowEditor = embeddedPage.locator('[data-testid="meal-allergens-editor"]');
    await expect(tomorrowEditor).toBeVisible();
    await expect(tomorrowEditor).toHaveAttribute('data-loaded', 'true');

    // Finalize button is disabled for tomorrow (restricted to today in dashboard)
    const tomorrowFinalizeBtn = tomorrowEditor.locator('[data-testid="finalize-allergens-btn"]');
    await expect(tomorrowFinalizeBtn).toBeVisible();
    await expect(tomorrowFinalizeBtn).toBeDisabled();
    await expect(tomorrowEditor.locator('[data-testid="checklist-item-today"]')).toBeVisible();

    await page.getByTestId('allergens-editor-back-btn').click();
    await expect(tomorrowEditor).toHaveCount(0);

    // 8. Verify past days ALLOW editing allergens from the dashboard (with Finalisieren also restricted to today)!
    // Switch to Home to navigate from tomorrow back to today, then to yesterday
    await homeBtn.click();
    const prevDayBtn2 = embeddedPage.locator('.kiosk-header-nav-btn.left');
    await prevDayBtn2.click(); // back to today
    await page.waitForTimeout(200);
    await prevDayBtn2.click(); // to yesterday
    await page.waitForTimeout(300);

    // Switch to TODOs on yesterday (past day):
    await todosBtn.click();
    // - Regular tasks cannot be checked (no checkbox)
    await expect(todosCard.locator('[data-testid="task-checkbox-yellow_bin_put_out"]')).toHaveCount(0);

    // - Allergens task CAN be opened and edited on past days!
    const yesterdayAllergenTask = todosCard.locator('[data-testid="kiosk-todo-item-enter_allergens"]');
    await expect(yesterdayAllergenTask).toBeVisible();
    const yesterdayOpenBtn = yesterdayAllergenTask.locator('[data-testid="open-allergens-editor-btn"]');
    await expect(yesterdayOpenBtn).toBeVisible();
    await expect(yesterdayOpenBtn).toBeEnabled();

    // Clicking the open button opens the editor for yesterday
    await yesterdayOpenBtn.click();
    const yesterdayEditor = embeddedPage.locator('[data-testid="meal-allergens-editor"]');
    await expect(yesterdayEditor).toBeVisible();
    await expect(yesterdayEditor).toHaveAttribute('data-loaded', 'true');

    // Finalize is also disabled on past day in the dashboard
    const yesterdayFinalizeBtn = yesterdayEditor.locator('[data-testid="finalize-allergens-btn"]');
    await expect(yesterdayFinalizeBtn).toBeVisible();
    await expect(yesterdayFinalizeBtn).toBeDisabled();
    await expect(yesterdayEditor.locator('[data-testid="checklist-item-today"]')).toBeVisible();

    await page.getByTestId('allergens-editor-back-btn').click();
    await expect(yesterdayEditor).toHaveCount(0);
  });

  test('displays Allergies view inline between header and footer when selected in bottom navigation', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    await seedDeveloperCookingDutyToday(request, 'Sabine', 'Koch', 'Milchreis');

    const authHeaders = {
      Authorization: 'Bearer developer@example.com',
      'Content-Type': 'application/json',
    };

    // 2. Create child with allergy in Group 1
    const famRes = await request.post('/api/families', {
      headers: authHeaders,
      data: {
        parents: [{ first_name: 'Maria', last_name: 'Test' }],
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
        first_name: 'Lukas',
        last_name: 'Test',
        birth_date: '2022-01-01',
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

    // 3. Open dashboard tab
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    // Verify main Home cards (cook, meal) are visible and Home is highlighted
    const homeBtn = embeddedPage.locator('.kiosk-nav-home-btn');
    await expect(homeBtn).toHaveClass(/active/);
    await expect(embeddedPage.locator('.kiosk-card-cook')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-meal')).toBeVisible();
    await expect(embeddedPage.locator('[data-testid="kiosk-allergies-section"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="kiosk-allergies-popup"]')).toHaveCount(0);

    // 4. Click the Allergies ("Allergien") button in the bottom navigation
    const allergiesBtn = embeddedPage.locator('.kiosk-nav-btn', { hasText: 'Allergien' });
    await expect(allergiesBtn).toBeVisible();
    await allergiesBtn.click();

    // 5. Verify Allergies button is highlighted and allergies view is displayed inline between header and footer
    await expect(allergiesBtn).toHaveClass(/active/);
    await expect(homeBtn).not.toHaveClass(/active/);
    await expect(page.locator('[data-testid="kiosk-allergies-popup"]')).toHaveCount(0);

    const header = embeddedPage.locator('.kiosk-header');
    const footer = embeddedPage.locator('.kiosk-bottom-nav');
    const allergiesSection = embeddedPage.locator('[data-testid="kiosk-allergies-section"]');
    await expect(header).toBeVisible();
    await expect(footer).toBeVisible();
    await expect(allergiesSection).toBeVisible();

    const headerBox = await header.boundingBox();
    const sectionBox = await allergiesSection.boundingBox();
    const footerBox = await footer.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(sectionBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    if (headerBox && sectionBox && footerBox) {
      expect(sectionBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 2);
      expect(sectionBox.y + sectionBox.height).toBeLessThanOrEqual(footerBox.y + 2);
    }

    // Verify group allergies are displayed inside the inline view
    const allergiesView = allergiesSection.locator('.kiosk-allergies-view');
    await expect(allergiesView).toBeVisible();
    const group1 = allergiesView.locator('.kiosk-card-allergies-group').first();
    await expect(group1).toBeVisible();
    await expect(group1.locator('.kiosk-allergy-badge', { hasText: 'Milch/Laktose' })).toBeVisible();

    // 6. Switch back to Home via bottom nav
    await homeBtn.click();
    await expect(homeBtn).toHaveClass(/active/);
    await expect(allergiesBtn).not.toHaveClass(/active/);
    await expect(allergiesSection).toHaveCount(0);
    await expect(embeddedPage.locator('.kiosk-card-cook')).toBeVisible();
  });

  test('automatically returns to home view after inactivity timeout', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Authenticate as regular user and set a short test idle timeout (1200ms)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
      (window as unknown as { __TEST_IDLE_TIMEOUT_MS__?: number }).__TEST_IDLE_TIMEOUT_MS__ = 1200;
    });

    // 3. Navigate to embedded dashboard
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    const initialDateText = await embeddedPage.locator('.kiosk-header-date').innerText();
    const prevDayBtn = embeddedPage.locator('.kiosk-header-nav-btn.left');
    await prevDayBtn.click();
    await page.waitForTimeout(200);

    const changedDateText = await embeddedPage.locator('.kiosk-header-date').innerText();
    expect(changedDateText).not.toBe(initialDateText);

    // Switch to allergies view
    const allergiesBtn = embeddedPage.locator('.kiosk-nav-btn', { hasText: 'Allergien' });
    await allergiesBtn.click();
    const allergiesSection = embeddedPage.locator('[data-testid="kiosk-allergies-section"]');
    await expect(allergiesSection).toBeVisible();
    await expect(allergiesBtn).toHaveClass(/active/);

    // Wait without interacting for the idle timeout to expire
    await page.waitForTimeout(1600);

    // Verify view has automatically returned to Home and date reset back to initial (today)
    await expect(allergiesSection).toHaveCount(0);
    await expect(embeddedPage.locator('.kiosk-nav-home-btn')).toHaveClass(/active/);
    await expect(embeddedPage.locator('.kiosk-card-cook')).toBeVisible();
    const resetDateText = await embeddedPage.locator('.kiosk-header-date').innerText();
    expect(resetDateText).toBe(initialDateText);
  });

  test('configures Fully Kiosk screensaver exit times (default 09:30 and 10:00, or via URL/config) and wakes kiosk', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Setup mock Fully Kiosk API on window before page load
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');

      const calls: string[] = [];
      const fullyMock = {
        turnScreenOn: () => { calls.push('turnScreenOn'); },
        stopScreensaver: () => { calls.push('stopScreensaver'); },
        startScreensaver: () => { calls.push('startScreensaver'); },
        isScreenOn: () => true,
      };

      (window as unknown as {
        fully?: typeof fullyMock;
        __FULLY_CALLS__?: string[];
        __KIOSK_SCREENSAVER_OFF_DURATION_MS__?: number;
      }).fully = fullyMock;
      (window as unknown as {
        __FULLY_CALLS__?: string[];
        __KIOSK_SCREENSAVER_OFF_DURATION_MS__?: number;
      }).__FULLY_CALLS__ = calls;
      (window as unknown as {
        __KIOSK_SCREENSAVER_OFF_DURATION_MS__?: number;
      }).__KIOSK_SCREENSAVER_OFF_DURATION_MS__ = 600;
    });

    // 3. Navigate to dashboard with default configuration
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const clock = page.locator('[data-testid="kiosk-clock"]');
    await expect(clock).toBeVisible();

    // Default exit times should be 09:30, 10:00
    await expect(clock).toHaveAttribute('data-wake-times', '09:30, 10:00');

    // 4. Test date navigation and open popup before wake
    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    const initialDateText = await embeddedPage.locator('.kiosk-header-date').innerText();
    const prevDayBtn = embeddedPage.locator('.kiosk-header-nav-btn.left');
    await prevDayBtn.click();
    await page.waitForTimeout(200);

    const prevDateText = await embeddedPage.locator('.kiosk-header-date').innerText();
    expect(prevDateText).not.toBe(initialDateText);

    // Switch to allergies view
    const allergiesBtn = embeddedPage.locator('.kiosk-nav-btn', { hasText: 'Allergien' });
    await allergiesBtn.click();
    const allergiesSection = embeddedPage.locator('[data-testid="kiosk-allergies-section"]');
    await expect(allergiesSection).toBeVisible();

    // 5. Trigger Fully screensaver exit programmatically
    const exitResult = await page.evaluate(() => {
      const win = window as unknown as {
        __triggerFullyScreensaverExit?: () => boolean;
        __FULLY_CALLS__?: string[];
      };
      const success = win.__triggerFullyScreensaverExit ? win.__triggerFullyScreensaverExit() : false;
      return { success, calls: win.__FULLY_CALLS__ || [] };
    });

    expect(exitResult.success).toBe(true);
    expect(exitResult.calls).toContain('turnScreenOn');
    expect(exitResult.calls).toContain('stopScreensaver');
    expect(exitResult.calls).not.toContain('stopDaydream');
    expect(exitResult.calls).not.toContain('bringToForeground');

    // 6. Verify view resets back to Home on today
    await expect(allergiesSection).toHaveCount(0);
    await expect(embeddedPage.locator('.kiosk-nav-home-btn')).toHaveClass(/active/);
    const currentDateText = await embeddedPage.locator('.kiosk-header-date').innerText();
    expect(currentDateText).toBe(initialDateText);

    // 7. Verify that after the screensaver off duration (600ms in test), screensaver is re-engaged
    await page.waitForTimeout(800);
    const afterDurationCalls = await page.evaluate(() => {
      const win = window as unknown as { __FULLY_CALLS__?: string[] };
      return win.__FULLY_CALLS__ || [];
    });
    expect(afterDurationCalls).toContain('startScreensaver');

    // 8. Verify configurable times override (e.g. for testing)
    await page.addInitScript(() => {
      (window as unknown as { __KIOSK_SCREENSAVER_EXIT_TIMES__?: string[] }).__KIOSK_SCREENSAVER_EXIT_TIMES__ = [
        '08:15',
        '11:45',
        '15:30',
      ];
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    const customClock = page.locator('[data-testid="kiosk-clock"]');
    await expect(customClock).toBeVisible();
    await expect(customClock).toHaveAttribute('data-wake-times', '08:15, 11:45, 15:30');
  });

  test('only shows dashboard link to users with dashboard.use permission', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Create user with 'viewer' role (viewer does not have dashboard.use)
    const viewerEmail = 'viewer.user@tollhaus-stuttgart.de';
    const userRes = await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: viewerEmail,
        roles: ['viewer'],
      },
    });
    expect(userRes.ok()).toBeTruthy();

    // 3. Log in as viewer (no dashboard.use permission)
    await page.addInitScript((email) => {
      localStorage.setItem('token', email);
    }, viewerEmail);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 4. Verify Kochansicht / Dashboard link is NOT shown in sidebar navigation or tabs
    await expect(page.getByRole('button', { name: 'Kochansicht' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);

    // 5. Verify link is NOT shown in header overflow menu
    const overflowBtn = page.locator('button.header-overflow-btn');
    if (await overflowBtn.isVisible()) {
      await overflowBtn.click();
      await expect(page.getByTestId('overflow-dashboard-button')).toHaveCount(0);
      await page.keyboard.press('Escape');
    }

    // 6. Direct navigation to /#dashboard falls back to default allowed tab and does not show dashboard
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.kiosk-tablet-page.embedded')).toHaveCount(0);

    // 7. Verify parents and cooks have dashboard.use and see Kochansicht,
    //    which is non-editable by default unless they have a cooking_duty today
    const parentEmail = 'regular.parent@tollhaus-stuttgart.de';
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Regular',
            last_name: 'Parent',
            emails: [{ value: parentEmail, identifier_email: true, address_list: true }],
            phones: [{ value: '012345678', address_list: true }],
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const createdFam = await famRes.json();
    const parentId = createdFam.parents[0].id;

    // Seed today's meal plan cooked by someone else so tasks (including enter_allergens) appear
    const briefRes = await request.get('/api/dashboard/daily-brief', {
      headers: { Authorization: 'Bearer developer@example.com' },
    });
    expect(briefRes.ok()).toBeTruthy();
    const briefData = await briefRes.json();
    const todayStr = briefData.date.split('T')[0];

    await request.post('/api/test/meal-plan', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: [
        {
          date: todayStr,
          cook_name: 'Andere Person',
          food_component_1: 'Nudelsuppe',
        },
      ],
    });

    const parentPage = await page.context().newPage();
    await parentPage.addInitScript((email) => {
      localStorage.setItem('token', email);
    }, parentEmail);
    await parentPage.goto('/');
    await parentPage.waitForLoadState('networkidle');

    // Parent sees Kochansicht tab under Kochen in sidebar navigation
    await parentPage.locator('.tabs').getByRole('button', { name: 'Kochen', exact: true }).click();
    const parentKochansichtBtn = parentPage.locator('.tabs').getByRole('button', { name: 'Kochansicht' });
    await expect(parentKochansichtBtn).toBeVisible();
    await parentKochansichtBtn.click();
    await expect(parentPage.locator('.kiosk-tablet-page.embedded')).toBeVisible();

    // Without cooking duty today, Kochansicht is non-editable:
    // - No edit meal allergens pencil button on Home tab
    await expect(parentPage.getByTestId('kiosk-edit-meal-allergens-btn')).toHaveCount(0);

    // - Switch to TODOs tab: no checkboxes or open-allergens pencil button, items are disabled
    await parentPage.getByTestId('kiosk-todos-btn').click();
    await expect(parentPage.locator('.kiosk-card-todos')).toBeVisible();
    await expect(parentPage.getByTestId('open-allergens-editor-btn')).toHaveCount(0);
    await expect(parentPage.locator('[data-testid^="task-checkbox-"]')).toHaveCount(0);

    // Clicking the enter_allergens task does NOT open the editor
    const parentAllergenTask = parentPage.getByTestId('kiosk-todo-item-enter_allergens');
    await expect(parentAllergenTask).toBeVisible();
    await expect(parentAllergenTask).toHaveClass(/kiosk-todo-disabled/);
    await parentAllergenTask.click();
    await expect(parentPage.getByTestId('meal-allergens-editor')).toHaveCount(0);

    // Backend also rejects task completion when user has no cooking duty today
    const forbiddenTaskRes = await request.post(
      `/api/dashboard/tasks/clean_dishwasher_filter/complete?date=${todayStr}`,
      { headers: { Authorization: `Bearer ${parentEmail}` } }
    );
    expect(forbiddenTaskRes.status()).toBe(403);

    // Now assign cooking_duty today to this parent
    const assignCookRes = await request.post('/api/test/meal-plan', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: [
        {
          date: todayStr,
          cook_name: 'Regular Parent',
          cooks: [
            {
              id: parentId,
              type: 'parent',
              first_name: 'Regular',
              last_name: 'Parent',
              display_name: 'Regular Parent',
            },
          ],
          cook_resolution_status: 'resolved',
          food_component_1: 'Nudelsuppe',
        },
      ],
    });
    expect(assignCookRes.ok()).toBeTruthy();

    // Reload Kochansicht as the parent who now has cooking_duty today -> dashboard is editable!
    await parentPage.reload();
    await parentPage.waitForLoadState('networkidle');
    await expect(parentPage.locator('.kiosk-tablet-page.embedded')).toBeVisible();
    await expect(parentPage.getByTestId('kiosk-edit-meal-allergens-btn')).toBeVisible();

    await parentPage.getByTestId('kiosk-todos-btn').click();
    await expect(parentPage.getByTestId('open-allergens-editor-btn')).toBeVisible();
    await expect(parentPage.getByTestId('task-checkbox-enter_allergens')).toBeVisible();
    await parentPage.close();

    // 8. Log in as admin (developer@example.com) who has wildcard * including dashboard.use
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify Kochansicht link IS accessible for user with dashboard.use (read-only when admin has no cooking duty today)
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.kiosk-tablet-page.embedded')).toBeVisible();
    await expect(page.getByTestId('kiosk-edit-meal-allergens-btn')).toHaveCount(0);
  });

  test('navigates between days using left and right swipe gestures, ignoring vertical scrolls and mouse clicks', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Log in as admin
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Open dashboard
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const contentArea = page.locator('.kiosk-content-area');
    await expect(contentArea).toBeVisible();

    const dateHeader = page.locator('.kiosk-header-date-text');
    await expect(dateHeader).toBeVisible();
    const initialDateText = await dateHeader.innerText();

    // Helper to simulate touch swipe via pointer events
    const simulatePointerSwipe = async (startX: number, startY: number, endX: number, endY: number, pointerType: string = 'touch') => {
      await contentArea.dispatchEvent('pointerdown', {
        clientX: startX,
        clientY: startY,
        pointerType,
        pointerId: 1,
      });
      await contentArea.dispatchEvent('pointerup', {
        clientX: endX,
        clientY: endY,
        pointerType,
        pointerId: 1,
      });
    };

    // 4. Verify mouse drag does NOT trigger day navigation
    await simulatePointerSwipe(300, 200, 100, 200, 'mouse');
    await page.waitForTimeout(300);
    expect(await dateHeader.innerText()).toBe(initialDateText);

    // 5. Verify predominantly vertical scroll does NOT trigger day navigation
    await simulatePointerSwipe(200, 100, 210, 300, 'touch');
    await page.waitForTimeout(300);
    expect(await dateHeader.innerText()).toBe(initialDateText);

    // 6. Swipe Left (drag finger left: x=300 to x=100) -> Navigates to Next Day
    await simulatePointerSwipe(300, 200, 100, 200, 'touch');
    await expect(dateHeader).not.toHaveText(initialDateText);
    const nextDateText = await dateHeader.innerText();

    // 7. Swipe Right (drag finger right: x=100 to x=300) -> Navigates to Previous Day (back to initial)
    // Wait for cooldown window (400ms)
    await page.waitForTimeout(450);
    await simulatePointerSwipe(100, 200, 300, 200, 'touch');
    await expect(dateHeader).toHaveText(initialDateText);

    // 8. Verify TouchEvent (touchstart/touchend) also triggers swipe left
    await page.waitForTimeout(450);
    await page.evaluate(() => {
      const el = document.querySelector('.kiosk-content-area');
      if (!el) return;
      const tStart = new Touch({ identifier: 0, target: el, clientX: 300, clientY: 200 });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [tStart], changedTouches: [tStart], bubbles: true }));

      const tEnd = new Touch({ identifier: 0, target: el, clientX: 100, clientY: 200 });
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [tEnd], bubbles: true }));
    });
    await expect(dateHeader).toHaveText(nextDateText);

    // Swipe right back to today using touch events
    await page.waitForTimeout(450);
    await page.evaluate(() => {
      const el = document.querySelector('.kiosk-content-area');
      if (!el) return;
      const tStart = new Touch({ identifier: 0, target: el, clientX: 100, clientY: 200 });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [tStart], changedTouches: [tStart], bubbles: true }));

      const tEnd = new Touch({ identifier: 0, target: el, clientX: 300, clientY: 200 });
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [tEnd], bubbles: true }));
    });
    await expect(dateHeader).toHaveText(initialDateText);

    // 9. Verify date changing (arrows + swiping) is disabled on ALL non-home tabs (TODOs, Allergies, Feedback)
    for (const nonHomeBtnTestId of ['kiosk-todos-btn', 'kiosk-allergies-btn', 'kiosk-feedback-btn']) {
      const navBtn = page.getByTestId(nonHomeBtnTestId);
      await expect(navBtn).toBeVisible();
      await navBtn.click();
      await expect(navBtn).toHaveClass(/active/);
      await expect(page.locator('.kiosk-header-nav-btn')).toHaveCount(0);

      await page.waitForTimeout(450);
      await simulatePointerSwipe(300, 200, 100, 200, 'touch');
      await page.waitForTimeout(250);
      expect(await dateHeader.innerText()).toBe(initialDateText);
    }

    // Switch back to Home tab — arrows return
    await page.getByTestId('kiosk-home-btn').click();
    await expect(page.locator('.kiosk-header-nav-btn')).toHaveCount(2);
  });

  test('does not show Vesper badge on any day of the week including Wednesday and Thursday', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    const dateHeader = embeddedPage.locator('.kiosk-header-date');
    await expect(dateHeader).toBeVisible();
    const nextBtn = embeddedPage.locator('.kiosk-header-nav-btn.right');
    const homeBtn = embeddedPage.locator('.kiosk-nav-home-btn');

    // Test a full week cycle (7 consecutive days) — Vesper badge must never appear
    for (let i = 0; i < 7; i++) {
      await expect(dateHeader.locator('[data-testid="kiosk-vesper-badge"]')).toHaveCount(0);
      await expect(dateHeader).not.toContainText('Vesper');

      await nextBtn.click();
      await page.waitForTimeout(150);
    }

    // Reset back to today with Home button
    await homeBtn.click();
    await page.waitForTimeout(150);
  });

  test('shows Bufdi absence tasks only when Bufdi has an absence, allows completing, persists on absence re-add', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    await seedDeveloperCookingDutyToday(request, 'Sabine', 'Koch', 'Milchreis');

    const authHeaders = {
      Authorization: 'Bearer developer@example.com',
      'Content-Type': 'application/json',
    };

    // Calculate today's date in YYYY-MM-DD (matching Europe/Berlin local day)
    const now3 = new Date();
    const todayStr = `${now3.getFullYear()}-${String(now3.getMonth() + 1).padStart(2, '0')}-${String(now3.getDate()).padStart(2, '0')}`;

    // Ensure no existing volunteer absence for today
    const listRes = await request.get('/api/volunteer-absences', { headers: authHeaders });
    expect(listRes.ok()).toBeTruthy();
    const existingAbsences = await listRes.json();
    for (const a of existingAbsences) {
      if (a.start_date <= todayStr && a.end_date >= todayStr) {
        await request.delete(`/api/volunteer-absences/${a.id}`, { headers: authHeaders });
      }
    }

    // 2. Open dashboard and verify none of the 3 Bufdi tasks are visible
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    const homeWarning = embeddedPage.getByTestId('kiosk-bufdi-absence-warning');
    await expect(homeWarning).toHaveCount(0);

    const todosBtn = embeddedPage.getByTestId('kiosk-todos-btn');
    await todosBtn.click();
    await expect(todosBtn).toHaveClass(/active/);

    const dryerTask = embeddedPage.locator('[data-testid="kiosk-todo-item-start_dryer"]');
    const washerTask = embeddedPage.locator('[data-testid="kiosk-todo-item-start_washer"]');
    const diaperTask = embeddedPage.locator('[data-testid="kiosk-todo-item-change_diaper_bag"]');
    const foldLaundryTask = embeddedPage.locator('[data-testid="kiosk-todo-item-fold_laundry"]');

    await expect(dryerTask).toHaveCount(0);
    await expect(washerTask).toHaveCount(0);
    await expect(diaperTask).toHaveCount(0);
    await expect(foldLaundryTask).toHaveCount(0);

    // 3. Add volunteer absence for BuFDI covering today
    const createRes = await request.post('/api/volunteer-absences', {
      headers: authHeaders,
      data: {
        type: 'bufdi',
        start_date: todayStr,
        end_date: todayStr,
        note: 'Seminar krank',
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const createdAbsence = await createRes.json();

    // 4. Verify all 4 tasks appear automatically (realtime / WebSocket update)
    await expect(dryerTask).toBeVisible();
    await expect(washerTask).toBeVisible();
    await expect(diaperTask).toBeVisible();
    await expect(foldLaundryTask).toBeVisible();

    // Switch briefly to Home tab to verify default BuFDI warning banner under cook/food/allergens
    await embeddedPage.getByTestId('kiosk-home-btn').click();
    await expect(homeWarning).toBeVisible();
    await expect(homeWarning).toHaveText('BuFDI heute nicht im Haus!');
    await todosBtn.click();

    await expect(dryerTask.locator('[data-testid="task-label-start_dryer"]')).toHaveText(
      'Morgens: Wäsche in den Trockner'
    );
    await expect(washerTask.locator('[data-testid="task-label-start_washer"]')).toHaveText(
      'Nachmittags: Wäsche in die Waschmaschine'
    );
    await expect(diaperTask.locator('[data-testid="task-label-change_diaper_bag"]')).toHaveText(
      'Möglichst spät: Windeleimer Tüte wechseln'
    );
    await expect(foldLaundryTask.locator('[data-testid="task-label-fold_laundry"]')).toHaveText(
      'Trockene Wäsche falten und einräumen'
    );

    // Verify each laundry/dryer task uses ONLY the single washing machine symbol (no composite flow icons, max 1 symbol per TODO)
    await expect(dryerTask.locator('.kiosk-todo-icon-composite')).toHaveCount(0);
    await expect(washerTask.locator('.kiosk-todo-icon-composite')).toHaveCount(0);
    await expect(foldLaundryTask.locator('.kiosk-todo-icon-composite')).toHaveCount(0);

    await expect(dryerTask.locator('svg.laundry-svg-icon')).toHaveCount(1);
    await expect(washerTask.locator('svg.laundry-svg-icon')).toHaveCount(1);
    await expect(foldLaundryTask.locator('svg.laundry-svg-icon')).toHaveCount(1);

    // Every uncompleted TODO item has at most 1 SVG symbol
    const allTodoItems = embeddedPage.locator('.kiosk-todo-item[data-completed="false"]');
    const todoCount = await allTodoItems.count();
    for (let i = 0; i < todoCount; i++) {
      const svgCount = await allTodoItems.nth(i).locator('svg').count();
      expect(svgCount).toBeLessThanOrEqual(1);
    }

    // Verify task sort order by orderIndex:
    // 200 (start_dryer) < 300 (fold_laundry) < 400 (start_washer) < 500 (change_diaper_bag)
    const initialTaskIds = await embeddedPage.locator('.kiosk-todo-item').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid'))
    );
    const dryerIdx = initialTaskIds.indexOf('kiosk-todo-item-start_dryer');
    const foldIdx = initialTaskIds.indexOf('kiosk-todo-item-fold_laundry');
    const washerIdx = initialTaskIds.indexOf('kiosk-todo-item-start_washer');
    const diaperIdx = initialTaskIds.indexOf('kiosk-todo-item-change_diaper_bag');
    expect(dryerIdx).toBeLessThan(foldIdx);
    expect(foldIdx).toBeLessThan(washerIdx);
    expect(washerIdx).toBeLessThan(diaperIdx);

    // 5. Complete start_dryer task
    const dryerCheckbox = embeddedPage.locator('[data-testid="task-checkbox-start_dryer"]');
    await dryerCheckbox.click();

    const confirmModal = page.locator('[data-testid="task-confirm-modal"]');
    await expect(confirmModal).toBeVisible();
    await expect(confirmModal.locator('[data-testid="task-confirm-modal-title"]')).toHaveText(
      'Wäsche in den Trockner abhaken?'
    );

    await confirmModal.locator('[data-testid="task-confirm-confirm-btn"]').click();
    await expect(confirmModal).not.toBeVisible();

    // Verify it is marked as done and moved below uncompleted tasks
    await expect(dryerTask).toHaveAttribute('data-completed', 'true');
    await expect(dryerTask).toHaveClass(/kiosk-todo-completed/);
    await expect(dryerCheckbox).toHaveClass(/checked/);

    const completedTaskIds = await embeddedPage.locator('.kiosk-todo-item').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid'))
    );
    const newDryerIdx = completedTaskIds.indexOf('kiosk-todo-item-start_dryer');
    const newDiaperIdx = completedTaskIds.indexOf('kiosk-todo-item-change_diaper_bag');
    expect(newDiaperIdx).toBeLessThan(newDryerIdx);

    // 6. Delete the volunteer absence
    const deleteRes = await request.delete(`/api/volunteer-absences/${createdAbsence.id}`, {
      headers: authHeaders,
    });
    expect(deleteRes.ok()).toBeTruthy();

    // Tasks should disappear automatically
    await expect(dryerTask).toHaveCount(0);
    await expect(washerTask).toHaveCount(0);
    await expect(diaperTask).toHaveCount(0);
    await expect(foldLaundryTask).toHaveCount(0);

    // Home warning should also disappear
    await embeddedPage.getByTestId('kiosk-home-btn').click();
    await expect(homeWarning).toHaveCount(0);
    await todosBtn.click();

    // 7. Re-add the volunteer absence
    const readdRes = await request.post('/api/volunteer-absences', {
      headers: authHeaders,
      data: {
        type: 'bufdi',
        start_date: todayStr,
        end_date: todayStr,
        note: 'Seminar re-added',
      },
    });
    expect(readdRes.ok()).toBeTruthy();

    // Tasks reappear AND start_dryer is STILL marked as completed!
    await expect(dryerTask).toBeVisible();
    await expect(washerTask).toBeVisible();
    await expect(diaperTask).toBeVisible();
    await expect(foldLaundryTask).toBeVisible();

    await expect(dryerTask).toHaveAttribute('data-completed', 'true');
    await expect(dryerTask).toHaveClass(/kiosk-todo-completed/);
    await expect(washerTask).toHaveAttribute('data-completed', 'false');
    await expect(foldLaundryTask).toHaveAttribute('data-completed', 'false');
    await expect(diaperTask).toHaveAttribute('data-completed', 'false');
  });

  test('verifies dashboard page takes up available space without page scrolling, header and footer are visible, cook is present, and meal/todos handle scrolling internally', async ({ page, request }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Authenticate and load dashboard
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    // Verify outer tab-scroll-content and embedded page do not allow page scrolling
    const tabScroll = page.locator('.tab-scroll-content');
    const tabScrollOverflow = await tabScroll.evaluate((el) => window.getComputedStyle(el).overflowY);
    expect(tabScrollOverflow).toBe('hidden');

    const contentArea = embeddedPage.locator('.kiosk-content-area');
    await expect(contentArea).toBeVisible();
    const contentAreaOverflow = await contentArea.evaluate((el) => window.getComputedStyle(el).overflowY);
    expect(contentAreaOverflow).toBe('hidden');

    // Header date is visible at top
    const header = embeddedPage.locator('.kiosk-header');
    await expect(header).toBeVisible();

    // Footer is visible at bottom
    const footer = embeddedPage.locator('.kiosk-bottom-nav');
    await expect(footer).toBeVisible();

    // Cook card is present
    const cookCard = embeddedPage.locator('.kiosk-card-cook');
    await expect(cookCard).toBeVisible();

    // Meal card takes space and has internal scrollable container
    const mealCard = embeddedPage.locator('.kiosk-card-meal');
    await expect(mealCard).toBeVisible();
    const mealCardContent = mealCard.locator('.kiosk-meal-card-content');
    await expect(mealCardContent).toBeVisible();
    const mealContentOverflow = await mealCardContent.evaluate((el) => window.getComputedStyle(el).overflowY);
    expect(mealContentOverflow).toBe('auto');

    // Switch to TODOs tab and verify Todos card fits between header and footer with internal scrollable list
    await embeddedPage.getByTestId('kiosk-todos-btn').click();
    const todosCard = embeddedPage.locator('.kiosk-card-todos');
    await expect(todosCard).toBeVisible();

    const todosList = todosCard.locator('.kiosk-todos-list');
    await expect(todosList).toBeVisible();
    const todosListOverflow = await todosList.evaluate((el) => window.getComputedStyle(el).overflowY);
    expect(todosListOverflow).toBe('auto');

    // Verify scaled-down font sizes and compact spacing on mobile viewports (<= 768px)
    await embeddedPage.getByTestId('kiosk-home-btn').click();
    const desktopHeaderSize = parseFloat(
      await header.locator('.kiosk-header-date').evaluate((el) => window.getComputedStyle(el).fontSize)
    );
    const desktopCookSize = parseFloat(
      await cookCard.locator('.kiosk-cook-content').evaluate((el) => window.getComputedStyle(el).fontSize)
    );
    const desktopClockSize = parseFloat(
      await footer.getByTestId('kiosk-clock').evaluate((el) => window.getComputedStyle(el).fontSize)
    );

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileHeaderSize = parseFloat(
      await header.locator('.kiosk-header-date').evaluate((el) => window.getComputedStyle(el).fontSize)
    );
    const mobileCookSize = parseFloat(
      await cookCard.locator('.kiosk-cook-content').evaluate((el) => window.getComputedStyle(el).fontSize)
    );
    const mobileClockSize = parseFloat(
      await footer.getByTestId('kiosk-clock').evaluate((el) => window.getComputedStyle(el).fontSize)
    );

    expect(mobileHeaderSize).toBeLessThan(desktopHeaderSize);
    expect(mobileCookSize).toBeLessThan(desktopCookSize);
    expect(mobileClockSize).toBeLessThan(desktopClockSize);
  });

  test('displays daily mon-fri task "Spülmaschine - Filter reinigen" on dashboard and allows checking off', async ({ request, page }) => {
    page.on('dialog', (dialog) => dialog.accept());

    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    await seedDeveloperCookingDutyToday(request, 'Sabine', 'Koch', 'Milchreis');

    const authHeaders = {
      Authorization: 'Bearer developer@example.com',
      'Content-Type': 'application/json',
    };

    // Verify task presence on weekdays vs weekends via backend daily-brief API
    const mondayBriefRes = await request.get('/api/dashboard/daily-brief?date=2026-11-16', {
      headers: authHeaders,
    });
    expect(mondayBriefRes.ok()).toBeTruthy();
    const mondayData = await mondayBriefRes.json();
    expect(mondayData.tasks_and_info).toContain('clean_dishwasher_filter');

    const saturdayBriefRes = await request.get('/api/dashboard/daily-brief?date=2026-11-21', {
      headers: authHeaders,
    });
    expect(saturdayBriefRes.ok()).toBeTruthy();
    const saturdayData = await saturdayBriefRes.json();
    expect(saturdayData.tasks_and_info).not.toContain('clean_dishwasher_filter');

    // 2. Open dashboard on today and switch to TODOs tab
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();
    await embeddedPage.getByTestId('kiosk-todos-btn').click();

    const initialBriefRes = await request.get('/api/dashboard/daily-brief');
    expect(initialBriefRes.ok()).toBeTruthy();
    const initBriefData = await initialBriefRes.json();
    const todayStr = initBriefData.date ? initBriefData.date.split('T')[0] : new Date().toISOString().split('T')[0];
    const todayDateObj = new Date(todayStr + 'T12:00:00Z');
    const dayOfWeek = todayDateObj.getUTCDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday

    const dishwasherTask = embeddedPage.locator('[data-testid="kiosk-todo-item-clean_dishwasher_filter"]');
    const dishwasherLabel = embeddedPage.locator('[data-testid="task-label-clean_dishwasher_filter"]');
    const dishwasherCheckbox = embeddedPage.locator('[data-testid="task-checkbox-clean_dishwasher_filter"]');

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      // It's a weekday: task must be displayed on dashboard
      await expect(dishwasherTask).toBeVisible();
      await expect(dishwasherLabel).toHaveText('Spülmaschine - Filter reinigen');
      await expect(dishwasherTask).toHaveClass(/kiosk-todo-dishwasher/);
      await expect(dishwasherCheckbox).toBeVisible();
      await expect(dishwasherCheckbox).not.toHaveClass(/checked/);

      // Complete the task
      await dishwasherCheckbox.click();

      const confirmModal = page.locator('[data-testid="task-confirm-modal"]');
      await expect(confirmModal).toBeVisible();
      await expect(confirmModal.locator('[data-testid="task-confirm-modal-title"]')).toHaveText(
        'Spülmaschine - Filter reinigen abhaken?'
      );

      await confirmModal.locator('[data-testid="task-confirm-confirm-btn"]').click();
      await expect(confirmModal).not.toBeVisible();

      // Verify task is marked as done
      await expect(dishwasherTask).toHaveClass(/kiosk-todo-completed/);
      await expect(dishwasherCheckbox).toHaveClass(/checked/);
      await expect(dishwasherLabel).toHaveCSS('text-decoration-line', 'line-through');

      // Verify backend state
      const updatedBriefRes = await request.get(`/api/dashboard/daily-brief?date=${todayStr}`, {
        headers: authHeaders,
      });
      expect(updatedBriefRes.ok()).toBeTruthy();
      const updatedData = await updatedBriefRes.json();
      expect(updatedData.completed_task_ids).toContain('clean_dishwasher_filter');

      // Uncomplete the task
      await dishwasherTask.click();
      await expect(dishwasherTask).not.toHaveClass(/kiosk-todo-completed/);
      await expect(dishwasherCheckbox).not.toHaveClass(/checked/);
    } else {
      // Weekend: task should not be displayed
      await expect(dishwasherTask).toHaveCount(0);
    }
  });

  test('displays daily mon-fri serving TODOs with clickable info (i-in-a-circle) popup and allows checking off', async ({ request, page }) => {
    page.on('dialog', (dialog) => dialog.accept());

    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    await seedDeveloperCookingDutyToday(request, 'Sabine', 'Koch', 'Milchreis');

    const authHeaders = {
      Authorization: 'Bearer developer@example.com',
      'Content-Type': 'application/json',
    };

    // 2. Verify serving tasks presence on Mon-Fri vs Sat-Sun via backend daily-brief API
    const weekdayDates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
    for (const dateStr of weekdayDates) {
      const briefRes = await request.get(`/api/dashboard/daily-brief?date=${dateStr}`, {
        headers: authHeaders,
      });
      expect(briefRes.ok()).toBeTruthy();
      const briefData = await briefRes.json();
      expect(briefData.tasks_and_info).toContain('serve_small_group');
      expect(briefData.tasks_and_info).toContain('serve_large_group');
      expect(briefData.tasks_and_info).toContain('serve_hort');
    }

    const weekendDates = ['2026-11-21', '2026-11-22'];
    for (const dateStr of weekendDates) {
      const briefRes = await request.get(`/api/dashboard/daily-brief?date=${dateStr}`, {
        headers: authHeaders,
      });
      expect(briefRes.ok()).toBeTruthy();
      const briefData = await briefRes.json();
      expect(briefData.tasks_and_info).not.toContain('serve_small_group');
      expect(briefData.tasks_and_info).not.toContain('serve_large_group');
      expect(briefData.tasks_and_info).not.toContain('serve_hort');
    }

    // 3. Open dashboard and switch to TODOs tab
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();
    await embeddedPage.getByTestId('kiosk-todos-btn').click();

    const initialBriefRes = await request.get('/api/dashboard/daily-brief');
    expect(initialBriefRes.ok()).toBeTruthy();
    const initBriefData = await initialBriefRes.json();
    const todayStr = initBriefData.date ? initBriefData.date.split('T')[0] : new Date().toISOString().split('T')[0];
    const todayDateObj = new Date(todayStr + 'T12:00:00Z');
    const dayOfWeek = todayDateObj.getUTCDay();

    const servingDefs = [
      { key: 'serve_small_group', label: 'Kleine Gruppe servieren (auf 11:45)', name: 'Kleine Gruppe servieren' },
      { key: 'serve_large_group', label: 'Große Gruppe servieren (auf 12:00)', name: 'Große Gruppe servieren' },
      { key: 'serve_hort', label: 'Hort servieren (meist auf 13:00)', name: 'Hort servieren' },
    ];

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      // Verify all 3 tasks are visible, styled, ordered properly, and have clickable info icons
      const taskIds = await embeddedPage.locator('.kiosk-todo-item').evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-testid'))
      );
      const smallIdx = taskIds.indexOf('kiosk-todo-item-serve_small_group');
      const largeIdx = taskIds.indexOf('kiosk-todo-item-serve_large_group');
      const hortIdx = taskIds.indexOf('kiosk-todo-item-serve_hort');
      expect(smallIdx).toBeGreaterThanOrEqual(0);
      expect(smallIdx).toBeLessThan(largeIdx);
      expect(largeIdx).toBeLessThan(hortIdx);

      for (const def of servingDefs) {
        const item = embeddedPage.getByTestId(`kiosk-todo-item-${def.key}`);
        const label = embeddedPage.getByTestId(`task-label-${def.key}`);
        const infoBtn = embeddedPage.getByTestId(`task-info-btn-${def.key}`);
        const checkbox = embeddedPage.getByTestId(`task-checkbox-${def.key}`);

        await expect(item).toBeVisible();
        await expect(item).toHaveClass(/kiosk-todo-serving/);
        await expect(label).toHaveText(def.label);
        await expect(checkbox).toBeVisible();
        await expect(infoBtn).toBeVisible();
        await expect(infoBtn.locator('svg')).toBeVisible();

        // Clicking info icon opens popup with further information placeholder without opening check-off modal
        await infoBtn.click();
        await expect(page.getByTestId('task-confirm-modal')).toHaveCount(0);

        const infoModal = page.getByTestId('task-info-modal');
        await expect(infoModal).toBeVisible();
        await expect(infoModal.getByTestId('task-info-modal-title')).toHaveText(def.name);
        await expect(infoModal.getByTestId('task-info-modal-body')).toContainText('Weitere Informationen');

        await infoModal.getByTestId('task-info-close-btn').click();
        await expect(infoModal).toHaveCount(0);
        await expect(item).toHaveAttribute('data-completed', 'false');
      }

      // Verify Escape and overlay click also close the info popup
      await embeddedPage.getByTestId('task-info-btn-serve_large_group').click();
      await expect(page.getByTestId('task-info-modal')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('task-info-modal')).toHaveCount(0);

      await embeddedPage.getByTestId('task-info-btn-serve_hort').click();
      await expect(page.getByTestId('task-info-modal')).toBeVisible();
      await page.getByTestId('task-info-modal-overlay').click({ position: { x: 10, y: 10 } });
      await expect(page.getByTestId('task-info-modal')).toHaveCount(0);

      // Verify checking off and unchecking a serving task works normally
      const largeCheckbox = embeddedPage.getByTestId('task-checkbox-serve_large_group');
      const largeItem = embeddedPage.getByTestId('kiosk-todo-item-serve_large_group');
      await largeCheckbox.click();

      const confirmModal = page.getByTestId('task-confirm-modal');
      await expect(confirmModal).toBeVisible();
      await expect(confirmModal.getByTestId('task-confirm-modal-title')).toHaveText(
        'Große Gruppe servieren abhaken?'
      );
      await confirmModal.getByTestId('task-confirm-confirm-btn').click();
      await expect(confirmModal).toHaveCount(0);

      await expect(largeItem).toHaveClass(/kiosk-todo-completed/);
      await expect(largeCheckbox).toHaveClass(/checked/);

      // Uncomplete the task
      await largeItem.click();
      await expect(largeItem).not.toHaveClass(/kiosk-todo-completed/);
    } else {
      // If today happens to be weekend, navigate to Monday to verify UI rendering and info popup
      for (const def of servingDefs) {
        await expect(embeddedPage.getByTestId(`kiosk-todo-item-${def.key}`)).toHaveCount(0);
      }
      await embeddedPage.getByTestId('kiosk-home-btn').click();
      const nextBtn = embeddedPage.locator('.kiosk-header-nav-btn.right');
      await nextBtn.click();
      if (dayOfWeek === 6) {
        await page.waitForTimeout(200);
        await nextBtn.click();
      }
      await page.waitForTimeout(300);
      await embeddedPage.getByTestId('kiosk-todos-btn').click();

      for (const def of servingDefs) {
        const item = embeddedPage.getByTestId(`kiosk-todo-item-${def.key}`);
        const infoBtn = embeddedPage.getByTestId(`task-info-btn-${def.key}`);
        await expect(item).toBeVisible();
        await expect(embeddedPage.getByTestId(`task-label-${def.key}`)).toHaveText(def.label);
        await infoBtn.click();
        const infoModal = page.getByTestId('task-info-modal');
        await expect(infoModal).toBeVisible();
        await expect(infoModal.getByTestId('task-info-modal-title')).toHaveText(def.name);
        await infoModal.getByTestId('task-info-close-btn').click();
        await expect(infoModal).toHaveCount(0);
      }
    }
  });

  test('prefixes meal component 3 with "Vesper: " when given, and shows "Vesper: Noch keines eingetragen!" when missing on Wednesday and Thursday only if another meal plan entry exists', async ({
    request,
    page,
  }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const authHeaders = {
      Authorization: 'Bearer developer@example.com',
      'Content-Type': 'application/json',
    };

    const briefRes = await request.get('/api/dashboard/daily-brief', { headers: authHeaders });
    expect(briefRes.ok()).toBeTruthy();
    const briefData = await briefRes.json();
    const todayStr: string = briefData.date
      ? briefData.date.split('T')[0]
      : new Date().toISOString().split('T')[0];

    const parts = todayStr.split('-').map(Number);
    const todayDate = new Date(parts[0], parts[1] - 1, parts[2]);

    const fmtDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // Find upcoming or current week days starting from today (7 consecutive days)
    const weekEntries: { date: string; weekday: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + i);
      weekEntries.push({ date: fmtDate(d), weekday: d.getDay() });
    }

    // Seed:
    // - Wednesday: comp1 + comp2, NO comp3 -> should show "Vesper: Noch keines eingetragen!"
    // - Thursday: comp1 + comp3 ("Obst & Rohkost"), NO comp2 -> should show "Vesper: Obst & Rohkost"
    // - Tuesday: comp1 + comp2 + comp3 ("Kräuterquark & Brot") -> should show "Vesper: Kräuterquark & Brot"
    // - Friday: comp1 + comp2, NO comp3 -> non-vesper day, should NOT show any Vesper line
    const seedPayload = weekEntries.map((entry) => {
      if (entry.weekday === 3) {
        // Wednesday: missing Vesper
        return {
          date: entry.date,
          cook_name: 'Maria',
          food_component_1: 'Linsensuppe',
          food_component_2: 'Salat',
          food_component_3: '',
        };
      }
      if (entry.weekday === 4) {
        // Thursday: Vesper given (even without comp2)
        return {
          date: entry.date,
          cook_name: 'Stefan',
          food_component_1: 'Käsespätzle',
          food_component_2: '',
          food_component_3: 'Obst & Rohkost',
        };
      }
      if (entry.weekday === 2) {
        // Tuesday: Vesper given with all 3 components
        return {
          date: entry.date,
          cook_name: 'Anna',
          food_component_1: 'Kartoffelsuppe',
          food_component_2: 'Baguette',
          food_component_3: 'Kräuterquark & Brot',
        };
      }
      return {
        date: entry.date,
        cook_name: 'Thomas',
        food_component_1: 'Gemüsecurry',
        food_component_2: 'Reis',
        food_component_3: '',
      };
    });

    const seedRes = await request.post('/api/test/meal-plan', {
      headers: authHeaders,
      data: seedPayload,
    });
    expect(seedRes.ok()).toBeTruthy();

    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    const mealCard = embeddedPage.locator('.kiosk-card-meal');
    const nextBtn = embeddedPage.locator('.kiosk-header-nav-btn.right');

    for (let i = 0; i < 7; i++) {
      const entry = weekEntries[i];
      if (entry.weekday === 3) {
        // Wednesday without comp3
        await expect(mealCard).toContainText('Linsensuppe');
        await expect(mealCard).toContainText('Salat');
        await expect(mealCard.getByTestId('kiosk-meal-vesper-line')).toHaveText(
          'Vesper: Noch keines eingetragen!'
        );
      } else if (entry.weekday === 4) {
        // Thursday with comp3
        await expect(mealCard).toContainText('Käsespätzle');
        await expect(mealCard.getByTestId('kiosk-meal-vesper-line')).toHaveText(
          'Vesper: Obst & Rohkost'
        );
      } else if (entry.weekday === 2) {
        // Tuesday with comp3
        await expect(mealCard).toContainText('Kartoffelsuppe');
        await expect(mealCard).toContainText('Baguette');
        await expect(mealCard.getByTestId('kiosk-meal-vesper-line')).toHaveText(
          'Vesper: Kräuterquark & Brot'
        );
      } else {
        // Other days without comp3
        await expect(mealCard).toContainText('Gemüsecurry');
        await expect(mealCard).toContainText('Reis');
        await expect(mealCard.getByTestId('kiosk-meal-vesper-line')).toHaveCount(0);
        await expect(mealCard).not.toContainText('Vesper');
      }

      if (i < 6) {
        await nextBtn.click();
        await page.waitForTimeout(200);
      }
    }

    // Also verify Thursday when NO comp3 is given shows "Vesper: Noch keines eingetragen!"
    const thuEntry = weekEntries.find((e) => e.weekday === 4)!;
    const clearThuVesperRes = await request.post('/api/test/meal-plan', {
      headers: authHeaders,
      data: [
        {
          date: thuEntry.date,
          cook_name: 'Stefan',
          food_component_1: 'Käsespätzle',
          food_component_2: 'Beilagensalat',
          food_component_3: '',
        },
      ],
    });
    expect(clearThuVesperRes.ok()).toBeTruthy();

    await embeddedPage.getByTestId('kiosk-home-btn').click();
    await page.waitForTimeout(200);
    const thuOffset = weekEntries.findIndex((e) => e.weekday === 4);
    for (let j = 0; j < thuOffset; j++) {
      await nextBtn.click();
      await page.waitForTimeout(200);
    }
    await expect(mealCard.getByTestId('kiosk-meal-vesper-line')).toHaveText(
      'Vesper: Noch keines eingetragen!'
    );

    // Verify that when NO meal plan entries exist for a Vesper day (Thursday), the Vesper note is NOT shown
    const clearAllThuMealsRes = await request.post('/api/test/meal-plan', {
      headers: authHeaders,
      data: [
        {
          date: thuEntry.date,
          cook_name: '',
          food_component_1: '',
          food_component_2: '',
          food_component_3: '',
        },
      ],
    });
    expect(clearAllThuMealsRes.ok()).toBeTruthy();

    await page.reload();
    await page.waitForLoadState('networkidle');
    for (let j = 0; j < thuOffset; j++) {
      await nextBtn.click();
      await page.waitForTimeout(200);
    }
    await expect(mealCard.getByTestId('kiosk-meal-vesper-line')).toHaveCount(0);
    await expect(mealCard).not.toContainText('Vesper');
    await expect(mealCard).toContainText('Kein Speiseplan für heute vorhanden');
  });

  test('Kochansicht-TODOs admin page allows editing Markdown info and creating/deleting custom TODOs', async ({
    request,
    page,
  }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    await seedDeveloperCookingDutyToday(request, 'Sabine', 'Koch', 'Milchreis');

    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboardTodos');
    await page.waitForLoadState('networkidle');

    const adminPage = page.getByTestId('dashboard-todos-admin-page');
    await expect(adminPage).toBeVisible();
    await expect(adminPage.getByTestId('admin-todo-row-serve_small_group')).toBeVisible();

    // 1. Edit serve_small_group to update its Markdown description
    await adminPage.getByTestId('edit-todo-btn-serve_small_group').click();
    const editModal = page.getByTestId('todo-edit-modal');
    await expect(editModal).toBeVisible();

    const mdText = '## Servierwagen Kleine Gruppe\n- **Schüsseln** bereitstellen\n- Besteck abzählen';
    await editModal.getByTestId('todo-description-markdown').fill(mdText);
    await expect(editModal.getByTestId('todo-markdown-preview')).toContainText('Servierwagen Kleine Gruppe');
    await editModal.getByTestId('todo-modal-save-btn').click();
    await expect(editModal).toHaveCount(0);

    // Verify preview info button on admin row opens modal with rendered Markdown
    await adminPage.getByTestId('admin-todo-preview-info-btn-serve_small_group').click();
    const infoModal = page.getByTestId('task-info-modal');
    await expect(infoModal).toBeVisible();
    await expect(infoModal.getByTestId('task-info-modal-title')).toHaveText('Kleine Gruppe servieren');
    await expect(infoModal.locator('h4')).toHaveText('Servierwagen Kleine Gruppe');
    await expect(infoModal.locator('strong')).toHaveText('Schüsseln');
    await infoModal.getByTestId('task-info-close-btn').click();

    // 2. Create a new daily TODO (no weekday/condition filters => appears every day)
    await adminPage.getByTestId('create-dashboard-todo-btn').click();
    await expect(editModal).toBeVisible();
    await editModal.getByTestId('todo-id-input').fill('kaffeemaschine_ausschalten');
    await editModal.getByTestId('todo-name-input').fill('Abends: Kaffeemaschine ausschalten');
    await editModal.getByTestId('todo-short-name-input').fill('Kaffeemaschine ausschalten');
    await editModal.getByTestId('todo-sort-order-input').fill('900');
    await editModal.getByTestId('todo-color-option-dishwasher').click();
    await editModal.getByTestId('todo-icon-option-sparkles').click();
    await editModal.getByTestId('todo-description-markdown').fill('Bitte **Hauptschalter** drücken.');
    await editModal.getByTestId('todo-modal-save-btn').click();
    await expect(editModal).toHaveCount(0);

    const customRow = adminPage.getByTestId('admin-todo-row-kaffeemaschine_ausschalten');
    await expect(customRow).toBeVisible();

    // 3. Switch to Kochansicht (#dashboard) -> TODOs and verify the new TODO appears with its info icon and short name in confirm modal
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');
    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await embeddedPage.getByTestId('kiosk-todos-btn').click();

    const customTodoItem = embeddedPage.getByTestId('kiosk-todo-item-kaffeemaschine_ausschalten');
    await expect(customTodoItem).toBeVisible();
    await expect(customTodoItem).toHaveClass(/kiosk-todo-dishwasher/);
    await expect(embeddedPage.getByTestId('task-label-kaffeemaschine_ausschalten')).toHaveText(
      'Abends: Kaffeemaschine ausschalten'
    );

    // Click info button on dashboard
    await embeddedPage.getByTestId('task-info-btn-kaffeemaschine_ausschalten').click();
    await expect(page.getByTestId('task-info-modal-title')).toHaveText('Kaffeemaschine ausschalten');
    await expect(page.getByTestId('task-info-modal-body').locator('strong')).toHaveText('Hauptschalter');
    await page.getByTestId('task-info-close-btn').click();

    // Click item to open confirm modal -> uses short_name!
    await customTodoItem.click();
    await expect(page.getByTestId('task-confirm-modal-title')).toHaveText('Kaffeemaschine ausschalten abhaken?');
    await page.getByTestId('task-confirm-cancel-btn').click();

    // 4. Delete custom TODO on admin page
    await page.goto('/#dashboardTodos');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('delete-todo-btn-kaffeemaschine_ausschalten').click();
    await page.getByTestId('confirm-delete-todo-btn').click();
    await expect(page.getByTestId('admin-todo-row-kaffeemaschine_ausschalten')).toHaveCount(0);

    // 5. Create a TODO with "Am letzten Kochtag der Woche" condition and verify it shows only on Friday
    await adminPage.getByTestId('create-dashboard-todo-btn').click();
    await expect(editModal).toBeVisible();
    await editModal.getByTestId('todo-id-input').fill('wochenabschluss_kueche');
    await editModal.getByTestId('todo-name-input').fill('Wochenabschluss Küche');
    await editModal.getByTestId('todo-cond-last-cooking-day-of-week').check();
    await editModal.getByTestId('todo-modal-save-btn').click();
    await expect(editModal).toHaveCount(0);

    const lastCookingRow = adminPage.getByTestId('admin-todo-row-wochenabschluss_kueche');
    await expect(lastCookingRow).toBeVisible();
    await expect(lastCookingRow).toContainText('Am letzten Kochtag der Woche');

    const friBriefRes = await request.get('/api/dashboard/daily-brief?date=2026-11-27', {
      headers: { Authorization: 'Bearer developer@example.com' },
    });
    expect(friBriefRes.ok()).toBeTruthy();
    const friBrief = await friBriefRes.json();
    expect(friBrief.tasks_and_info).toContain('wochenabschluss_kueche');

    const thuBriefRes = await request.get('/api/dashboard/daily-brief?date=2026-11-26', {
      headers: { Authorization: 'Bearer developer@example.com' },
    });
    expect(thuBriefRes.ok()).toBeTruthy();
    const thuBrief = await thuBriefRes.json();
    expect(thuBrief.tasks_and_info).not.toContain('wochenabschluss_kueche');
  });
});
