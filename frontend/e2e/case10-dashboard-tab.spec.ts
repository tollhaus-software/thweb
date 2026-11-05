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

    // Calculate dates
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

    // Seed yellow bag for tomorrow so today has task "yellow_bin_put_out" ("Gelbe Tonne rausstellen")
    const seedYellowRes = await request.post('/api/test/yellow-bag', {
      headers: authHeaders,
      data: { dates: [tomorrowStr] },
    });
    expect(seedYellowRes.ok()).toBeTruthy();

    // Seed meal plan with cook for today and tomorrow
    const seedPlanRes = await request.post('/api/test/meal-plan', {
      headers: authHeaders,
      data: [
        {
          date: todayStr,
          cook_name: 'Küchenchef Anton',
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

    const todosCard = embeddedPage.locator('.kiosk-card-todos');
    await expect(todosCard).toBeVisible();

    // Verify task items exist: yellow_bin_put_out and enter_allergens
    const yellowTask = todosCard.locator('[data-testid="kiosk-todo-item-yellow_bin_put_out"]');
    const allergenTask = todosCard.locator('[data-testid="kiosk-todo-item-enter_allergens"]');
    await expect(yellowTask).toBeVisible();
    await expect(allergenTask).toBeVisible();

    // Verify:
    // - yellow_bin_put_out is checkable today -> has checkbox, initially not checked
    // - enter_allergens is NOT checkable directly -> has NO checkbox!
    const yellowCheckbox = yellowTask.locator('[data-testid="task-checkbox-yellow_bin_put_out"]');
    const allergenCheckbox = allergenTask.locator('[data-testid="task-checkbox-enter_allergens"]');
    await expect(yellowCheckbox).toBeVisible();
    await expect(allergenCheckbox).toHaveCount(0);

    await expect(yellowTask).toHaveAttribute('data-completed', 'false');
    await expect(allergenTask).toHaveAttribute('data-completed', 'false');
    await expect(yellowCheckbox).not.toHaveClass(/checked/);

    // 2. Check yellow_bin_put_out task on today
    await yellowCheckbox.click();

    // Verify it is now marked as done:
    // - striked through in smaller font
    // - check mark in todo box
    // - placed at bottom of list
    await expect(yellowTask).toHaveAttribute('data-completed', 'true');
    await expect(yellowTask).toHaveClass(/kiosk-todo-completed/);
    await expect(yellowCheckbox).toHaveClass(/checked/);
    await expect(yellowCheckbox.locator('.kiosk-todo-check-icon')).toBeVisible();

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

    // 4. Verify date restriction: navigate to previous day (yesterday)
    const prevDayBtn = embeddedPage.locator('.kiosk-header-nav-btn.left');
    await prevDayBtn.click();
    await page.waitForTimeout(300);

    // On non-today date, tasks that are not checkable do NOT have a checkbox
    const pastYellowCheckbox = todosCard.locator('[data-testid="task-checkbox-yellow_bin_put_out"]');
    await expect(pastYellowCheckbox).toHaveCount(0);

    const pastAttempt = await request.post(
      `/api/dashboard/tasks/yellow_bin_put_out/complete?date=2026-01-01`,
      { headers: authHeaders }
    );
    expect(pastAttempt.status()).toBe(400);

    // Return to today via Home button
    const homeBtn = embeddedPage.locator('.kiosk-nav-home-btn');
    await homeBtn.click();
    await page.waitForTimeout(300);

    // 5. "Allergene eintragen...": "Komponenten und Allergene öffnen" button is always displayed!
    const allergenLabel = allergenTask.locator('[data-testid="task-label-enter_allergens"]');
    await expect(allergenLabel).toHaveText('Allergene eintragen...');

    const openAllergensBtn = allergenTask.locator('[data-testid="open-allergens-editor-btn"]');
    await expect(openAllergensBtn).toBeVisible();
    await expect(openAllergensBtn).toHaveText('Komponenten und Allergene öffnen');

    // Clicking the task row outside of the button highlights/flashes the button twice, does NOT open editor
    await allergenLabel.click();
    await expect(openAllergensBtn).toHaveClass(/flash/);
    const editor = embeddedPage.locator('[data-testid="meal-allergens-editor"]');
    await expect(editor).toHaveCount(0);

    // Clicking the "Komponenten und Allergene öffnen" button directly opens the allergens editor!
    await openAllergensBtn.click();
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('data-loaded', 'true');

    // Cook is already matched from meal plan (Küchenchef Anton). Add a component, then finalize
    await editor.locator('[data-testid="add-meal-component-btn"]').first().click();
    const compInput = page.getByTestId('meal-component-name-input-0');
    await expect(compInput).toBeVisible();
    await compInput.fill('Gemüsesuppe');
    await page.getByTestId('popover-done-btn').click();

    // Click finalize in editor
    const finalizeBtn = editor.locator('[data-testid="finalize-allergens-btn"]');
    await expect(finalizeBtn).toBeEnabled();
    await finalizeBtn.click();

    // Wait for finalization and return back to dashboard
    await expect(editor.locator('[data-testid="allergens-editor-status"]')).toContainText('Abgeschlossen');

    const backBtn = editor.locator('[data-testid="allergens-editor-back-btn"]');
    await backBtn.click();
    await expect(editor).toHaveCount(0);

    // 6. Verify "Allergene eintragen" is now marked done on the dashboard!
    const allergenTaskAfter = todosCard.locator('[data-testid="kiosk-todo-item-enter_allergens"]');
    await expect(allergenTaskAfter).toBeVisible();
    await expect(allergenTaskAfter).toHaveAttribute('data-completed', 'true');
    await expect(allergenTaskAfter).toHaveClass(/kiosk-todo-completed/);

    const allergenCheckboxAfter = allergenTaskAfter.locator('[data-testid="task-checkbox-enter_allergens"]');
    await expect(allergenCheckboxAfter).toBeVisible();
    await expect(allergenCheckboxAfter).toHaveClass(/checked/);
    await expect(allergenCheckboxAfter.locator('.kiosk-todo-check-icon')).toBeVisible();

    const allergenLabelAfter = allergenTaskAfter.locator('.kiosk-todo-label');
    await expect(allergenLabelAfter).toHaveCSS('text-decoration-line', 'line-through');

    // The open button remains displayed, and clicking the completed task row flashes the button
    const openAllergensBtnAfter = allergenTaskAfter.locator('[data-testid="open-allergens-editor-btn"]');
    await expect(openAllergensBtnAfter).toBeVisible();
    await allergenCheckboxAfter.click();
    await expect(openAllergensBtnAfter).toHaveClass(/flash/);
    await expect(allergenTaskAfter).toHaveAttribute('data-completed', 'true');

    // 7. Verify future date restriction: only allow editing allergens for current day or past days!
    const nextDayBtn = embeddedPage.locator('.kiosk-header-nav-btn.right');
    await nextDayBtn.click();
    await page.waitForTimeout(300);

    // On tomorrow (future date):
    // - Card 3 pencil edit button is not visible
    const tomorrowEditPencil = embeddedPage.locator('[data-testid="kiosk-edit-meal-allergens-btn"]');
    await expect(tomorrowEditPencil).toHaveCount(0);

    // - Card 4 allergen task button is disabled on future date
    const futureAllergenTask = todosCard.locator('[data-testid="kiosk-todo-item-enter_allergens"]');
    await expect(futureAllergenTask).toBeVisible();
    await expect(futureAllergenTask.locator('[data-testid="task-checkbox-enter_allergens"]')).toHaveCount(0);

    const futureOpenBtn = futureAllergenTask.locator('[data-testid="open-allergens-editor-btn"]');
    await expect(futureOpenBtn).toBeVisible();
    await expect(futureOpenBtn).toBeDisabled();

    // Clicking it on the future date does NOT open editor
    await futureAllergenTask.click();
    await expect(embeddedPage.locator('[data-testid="meal-allergens-editor"]')).toHaveCount(0);

    // 8. Verify past days ALLOW editing allergens from the dashboard!
    // Navigate from tomorrow back to today, then to yesterday
    const prevDayBtn2 = embeddedPage.locator('.kiosk-header-nav-btn.left');
    await prevDayBtn2.click(); // back to today
    await page.waitForTimeout(200);
    await prevDayBtn2.click(); // to yesterday
    await page.waitForTimeout(300);

    // On yesterday (past day):
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
    await yesterdayEditor.locator('[data-testid="allergens-editor-back-btn"]').click();
    await expect(yesterdayEditor).toHaveCount(0);
  });

  test('opens Allergies button in a modal popover with group allergies, and allows going back via back arrow on top or clicking outside', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

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

    // Verify main dashboard cards (cook, meal, todos) are visible
    await expect(embeddedPage.locator('.kiosk-card-cook')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-meal')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-todos')).toBeVisible();

    // Modal is initially not present
    const allergiesPopup = page.locator('[data-testid="kiosk-allergies-popup"]');
    const allergiesOverlay = page.locator('[data-testid="kiosk-allergies-overlay"]');
    await expect(allergiesPopup).toHaveCount(0);

    // 4. Click the Allergies ("Allergien") button in the bottom navigation
    const allergiesBtn = embeddedPage.locator('.kiosk-nav-btn', { hasText: 'Allergien' });
    await expect(allergiesBtn).toBeVisible();
    await allergiesBtn.click();

    // 5. Verify the modal-ish popover/popup appears
    await expect(allergiesPopup).toBeVisible();
    await expect(allergiesOverlay).toBeVisible();

    // Verify group allergies are displayed inside the popup
    const allergiesView = allergiesPopup.locator('.kiosk-allergies-view');
    await expect(allergiesView).toBeVisible();
    const group1 = allergiesView.locator('.kiosk-card-allergies-group').first();
    await expect(group1).toBeVisible();
    await expect(group1.locator('.kiosk-allergy-badge', { hasText: 'Milch/Laktose' })).toBeVisible();

    // 6. Verify small "back" arrow on top
    const backBtn = allergiesPopup.locator('[data-testid="kiosk-allergies-back-btn"]');
    await expect(backBtn).toBeVisible();

    // 7. Click the small "back" arrow on top to go back
    await backBtn.click();
    await expect(allergiesPopup).toHaveCount(0);
    await expect(allergiesOverlay).toHaveCount(0);

    // Main dashboard cards remain visible
    await expect(embeddedPage.locator('.kiosk-card-cook')).toBeVisible();

    // 8. Re-open Allergies popover, and go back by clicking OUTSIDE of the popup (on the backdrop overlay)
    await allergiesBtn.click();
    await expect(allergiesPopup).toBeVisible();

    // Click outside of the popup content card (e.g. at top-left corner of the overlay)
    await allergiesOverlay.click({ position: { x: 10, y: 10 } });
    await expect(allergiesPopup).toHaveCount(0);
    await expect(allergiesOverlay).toHaveCount(0);

    // 9. Re-open Allergies popover, and verify pressing Escape also goes back
    await allergiesBtn.click();
    await expect(allergiesPopup).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(allergiesPopup).toHaveCount(0);
  });
});
