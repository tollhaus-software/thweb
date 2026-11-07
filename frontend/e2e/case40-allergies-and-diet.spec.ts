import { test, expect } from '@playwright/test';

test.describe('Test Case 40: Allergies & Dietary Preferences (Vegetarisch / Vegan)', () => {
  test('persists dietary preference, provides 3 editor categories, declutters bottom bar, and displays aggregate counts on dashboard', async ({
    request,
    page,
  }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Create family and child in database
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Max',
            last_name: 'Mustermann',
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const createdFam = await famRes.json();
    const familyId = createdFam.id;

    const childId = crypto.randomUUID();
    const childRes = await request.put(`/api/children/${childId}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: childId,
        family_id: familyId,
        first_name: 'Leo',
        last_name: 'Mustermann',
        birth_date: '2021-03-15',
        allergies: [],
      },
    });
    expect(childRes.ok()).toBeTruthy();

    // Add group change so Leo belongs to Gruppe 1
    const todayStr = new Date().toISOString().slice(0, 10);
    const addGcRes = await request.post(`/api/children/${childId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        child_id: childId,
        change_date: todayStr,
        target_group: 1,
      },
    });
    expect(addGcRes.ok()).toBeTruthy();

    // Create a second child in Group 1 who is also Vegan
    const child2Id = crypto.randomUUID();
    const child2Res = await request.put(`/api/children/${child2Id}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: child2Id,
        family_id: familyId,
        first_name: 'Mia',
        last_name: 'Mustermann',
        birth_date: '2021-06-20',
        allergies: [{ name: 'Vegan', category: 'ernaehrung' }],
      },
    });
    expect(child2Res.ok()).toBeTruthy();

    const addGc2Res = await request.post(`/api/children/${child2Id}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        child_id: child2Id,
        change_date: todayStr,
        target_group: 1,
      },
    });
    expect(addGc2Res.ok()).toBeTruthy();

    // Create an employee
    const empRes = await request.post('/api/employees', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        first_name: 'Anna',
        last_name: 'Betreuerin',
        employee_type: 'caregiver',
        allergies: [],
      },
    });
    expect(empRes.ok()).toBeTruthy();

    // 3. Authenticate as developer (full permissions)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 4. Navigate to Children tab
    await page.goto('/#children');
    await page.waitForLoadState('networkidle');

    // Verify table header is renamed to "Allergien/Ernährung"
    const allergyHeader = page.locator('th', { hasText: 'Allergien/Ernährung' });
    await expect(allergyHeader).toBeVisible();

    // Open allergies editor for Leo
    const childRow = page.locator('tr', { hasText: 'Leo' }).first();
    await expect(childRow).toBeVisible();
    const allergyCell = childRow.locator('.allergies-cell-wrapper');
    await expect(allergyCell).toBeVisible();
    await allergyCell.dblclick();

    // Verify popover title is "Allergien/Ernährung"
    const popover = page.locator('.allergies-popover');
    await expect(popover).toBeVisible();
    await expect(popover.locator('.allergies-popover-title')).toHaveText('Allergien/Ernährung');

    // Verify all 3 top-level choice categories are present
    const dietChoice = page.getByTestId('allergy-choice-ernaehrung');
    const foodChoice = page.getByTestId('allergy-choice-lebensmittel');
    const otherChoice = page.getByTestId('allergy-choice-andere');
    await expect(dietChoice).toBeVisible();
    await expect(foodChoice).toBeVisible();
    await expect(otherChoice).toBeVisible();

    // 5. Select "Ernährungstyp" -> "Vegetarisch"
    await dietChoice.click();
    const dietPanel = page.getByTestId('allergies-panel-ernaehrung');
    await expect(dietPanel).toBeVisible();

    const vegOption = page.getByTestId('diet-option-vegetarisch');
    const veganOption = page.getByTestId('diet-option-vegan');
    await expect(vegOption).toBeVisible();
    await expect(veganOption).toBeVisible();

    await vegOption.click();

    // Verify returned to current list with "Vegetarisch"
    const currentList = page.getByTestId('allergies-current-list');
    await expect(currentList).toBeVisible();
    await expect(currentList).toContainText('Vegetarisch');

    // 6. Test mutual exclusivity: Selecting "Vegan" replaces "Vegetarisch"
    const startAddBtn = page.getByTestId('allergies-start-add-btn');
    await startAddBtn.click();
    await dietChoice.click();
    await veganOption.click();

    await expect(currentList).toBeVisible();
    await expect(currentList).toContainText('Vegan');
    await expect(currentList).not.toContainText('Vegetarisch');

    // 6b. Re-selecting "Vegan" does NOT remove it (leaves it unchanged)
    await startAddBtn.click();
    await dietChoice.click();
    await expect(veganOption).toHaveClass(/selected/);
    await veganOption.click();

    await expect(currentList).toBeVisible();
    await expect(currentList).toContainText('Vegan');

    // 6c. Selecting "Keine Besonderheit" removes "Vegan"
    await startAddBtn.click();
    await dietChoice.click();
    const noneOption = page.getByTestId('diet-option-none');
    await expect(noneOption).toBeVisible();
    await noneOption.click();

    await expect(currentList).toBeVisible();
    await expect(currentList).not.toContainText('Vegan');

    // Restore "Vegan" for the subsequent dashboard tests
    await startAddBtn.click();
    await dietChoice.click();
    await veganOption.click();
    await expect(currentList).toContainText('Vegan');

    // 7. Add a food allergy: Milch/Laktose
    await startAddBtn.click();
    await foodChoice.click();
    const laktoseOption = page.getByTestId('allergen-option-allergy-laktose');
    await laktoseOption.click();

    // Verify both Vegan (diet) and Milch/Laktose (food) are in the list
    await expect(currentList).toContainText('Vegan');
    await expect(currentList).toContainText('Milch/Laktose');

    // Close the popover
    await page.getByTestId('allergies-popover-close-btn').click();
    await expect(popover).toHaveCount(0);

    // Verify cell shows both values
    await expect(allergyCell).toContainText('Vegan');
    await expect(allergyCell).toContainText('Milch/Laktose');

    // 8. Go to Employees tab and set Vegetarisch for employee
    await page.goto('/#employees');
    await page.waitForLoadState('networkidle');

    const empRow = page.locator('tr', { hasText: 'Anna' }).first();
    await expect(empRow).toBeVisible();
    const empAllergyCell = empRow.locator('.allergies-cell-wrapper');
    await empAllergyCell.dblclick();

    await expect(popover).toBeVisible();
    await page.getByTestId('allergy-choice-ernaehrung').click();
    await page.getByTestId('diet-option-vegetarisch').click();
    await expect(currentList).toContainText('Vegetarisch');
    await page.getByTestId('allergies-popover-close-btn').click();
    await expect(empAllergyCell).toContainText('Vegetarisch');

    // 9. Navigate to Dashboard tab
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    // Verify bottom navigation bar buttons:
    // - Home button is icon-only
    const homeBtn = embeddedPage.locator('.kiosk-nav-home-btn');
    await expect(homeBtn).toBeVisible();
    await expect(homeBtn.locator('span')).toHaveCount(0);

    // - Anleitungen button is icon-only
    const infoPagesBtn = embeddedPage.locator('[data-testid="kiosk-info-pages-btn"]');
    await expect(infoPagesBtn).toBeVisible();
    await expect(infoPagesBtn.locator('span')).toHaveCount(0);

    // - Feedback button is icon-only
    const feedbackBtn = embeddedPage.locator('[data-testid="kiosk-feedback-btn"]');
    await expect(feedbackBtn).toBeVisible();
    await expect(feedbackBtn.locator('span')).toHaveCount(0);

    // - Allergien/Ernährung button has icon AND text
    const allergiesBtn = embeddedPage.locator('.kiosk-nav-btn', { hasText: 'Allergien/Ernährung' });
    await expect(allergiesBtn).toBeVisible();
    await expect(allergiesBtn.locator('span')).toHaveText('Allergien/Ernährung');

    // 10. Open Allergien/Ernährung popup
    await allergiesBtn.click();
    const allergiesPopup = embeddedPage.locator('[data-testid="kiosk-allergies-popup"]');
    await expect(allergiesPopup).toBeVisible();

    // Verify popup header title is "Allergien/Ernährung"
    const popupTitle = allergiesPopup.locator('.kiosk-allergies-popup-title');
    await expect(popupTitle).toHaveText('Allergien/Ernährung');

    // 11. Verify Group 1 (Kleine Gruppe) shows Vegan (1) and Milch/Laktose (1)
    const allergiesView = allergiesPopup.locator('.kiosk-allergies-view');
    await expect(allergiesView).toBeVisible();

    const group1 = allergiesView.locator('.kiosk-card-allergies-group').first();
    await expect(group1).toBeVisible();

    // Check Vegan badge has diet icon and count (2)
    const veganBadge = group1.locator('.kiosk-allergy-badge', { hasText: 'Vegan' });
    await expect(veganBadge).toBeVisible();
    await expect(veganBadge.locator('.kiosk-diet-icon')).toBeVisible();
    await expect(veganBadge.locator('.kiosk-allergy-count')).toHaveText('(2)');

    // Check Milch/Laktose badge has count (1)
    const laktoseBadge = group1.locator('.kiosk-allergy-badge', { hasText: 'Milch/Laktose' });
    await expect(laktoseBadge).toBeVisible();
    await expect(laktoseBadge.locator('.kiosk-allergy-count')).toHaveText('(1)');

    // 12. Verify Employees section shows Vegetarisch (1)
    const empSection = allergiesView.locator('.kiosk-card-allergies-employees');
    await expect(empSection).toBeVisible();

    const vegBadge = empSection.locator('.kiosk-allergy-badge', { hasText: 'Vegetarisch' });
    await expect(vegBadge).toBeVisible();
    await expect(vegBadge.locator('.kiosk-diet-icon')).toBeVisible();
    await expect(vegBadge.locator('.kiosk-allergy-count')).toHaveText('(1)');
  });
});
