import { test, expect } from '@playwright/test';

test.describe('Test Case 26: Allergies Selection, Lebensmittel vs Andere, Icons & Text Representation', () => {
  test('allows selecting Lebensmittel allergens (with symbols & custom) and Andere allergens, showing text-only in table and symbols on dashboard', async ({
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

    // 3. Authenticate as developer (full permissions)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 4. Navigate to Children tab
    await page.goto('/#children');
    await page.waitForLoadState('networkidle');

    // Find the child row (Leo Mustermann)
    const childRow = page.locator('tr').filter({ hasText: 'Leo' }).first();
    await expect(childRow).toBeVisible();

    // Find the allergies cell in that row
    const allergyCell = childRow.locator('.allergies-cell-wrapper');
    await expect(allergyCell).toBeVisible();

    // Double click to open the allergies popover
    await allergyCell.dblclick();

    // Verify popover is open
    const popover = page.locator('.allergies-popover');
    await expect(popover).toBeVisible();

    // Verify the top-level choice between "Lebensmittel" and "Andere"
    const lebensmittelChoice = page.getByTestId('allergy-choice-lebensmittel');
    const andereChoice = page.getByTestId('allergy-choice-andere');
    await expect(lebensmittelChoice).toBeVisible();
    await expect(andereChoice).toBeVisible();

    // 4. Click "Lebensmittel"
    // Choice cards should disappear, and only back button + Lebensmittel panel appear
    await lebensmittelChoice.click();
    await expect(lebensmittelChoice).toHaveCount(0);
    await expect(andereChoice).toHaveCount(0);

    // Verify Lebensmittel panel is open with main allergen options
    const lebensmittelPanel = page.getByTestId('allergies-panel-lebensmittel');
    await expect(lebensmittelPanel).toBeVisible();

    // While adding, current list of already added allergies is hidden
    await expect(page.getByTestId('allergies-current-list')).toHaveCount(0);

    // Check that icons and options for main allergens are visible
    const glutenOption = page.getByTestId('allergen-option-allergy-gluten');
    const laktoseOption = page.getByTestId('allergen-option-allergy-laktose');
    const erdnuesseOption = page.getByTestId('allergen-option-allergy-erdnuesse');

    await expect(glutenOption).toBeVisible();
    await expect(laktoseOption).toBeVisible();
    await expect(erdnuesseOption).toBeVisible();

    // Verify checkboxes are NOT present
    await expect(laktoseOption.locator('input[type="checkbox"]')).toHaveCount(0);

    // Test back button returns to Lebensmittel vs Andere choice
    const backBtn = page.getByTestId('allergies-back-to-category-choice-btn');
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(lebensmittelChoice).toBeVisible();
    await expect(andereChoice).toBeVisible();

    // Click Lebensmittel again
    await lebensmittelChoice.click();

    // Clicking "Milch/Laktose" should IMMEDIATELY add the allergy and exit edit mode to show already added allergies
    await laktoseOption.click();

    // Verify edit mode exited: current list is now visible with Milch/Laktose, and add section is hidden
    const currentList = page.getByTestId('allergies-current-list');
    await expect(currentList).toBeVisible();
    await expect(currentList).toContainText('Milch/Laktose');
    await expect(page.getByTestId('allergies-add-section')).toHaveCount(0);

    // Click '+' to add another allergy
    const startAddBtn = page.getByTestId('allergies-start-add-btn');
    await expect(startAddBtn).toBeVisible();
    await startAddBtn.click();

    // Verify current list is hidden again while in adding mode
    await expect(page.getByTestId('allergies-current-list')).toHaveCount(0);
    await expect(lebensmittelChoice).toBeVisible();

    // Select Lebensmittel -> add custom food allergen "Tomaten"
    await lebensmittelChoice.click();
    const customFoodInput = page.getByTestId('custom-allergen-input-allergy');
    const customFoodBtn = page.getByTestId('custom-allergen-add-btn-allergy');
    await customFoodInput.fill('Tomaten');
    await customFoodBtn.click();

    // After adding custom food allergen, edit mode exits and current list is visible
    await expect(currentList).toBeVisible();
    await expect(currentList).toContainText('Milch/Laktose');
    await expect(currentList).toContainText('Tomaten');

    // Click '+' to add a non-food allergy
    await startAddBtn.click();
    await expect(andereChoice).toBeVisible();
    await andereChoice.click();

    const anderePanel = page.getByTestId('allergies-panel-andere');
    await expect(anderePanel).toBeVisible();

    // Add a custom non-food allergy: "Wespenstich"
    const otherInput = page.getByTestId('allergy-other-input');
    const otherAddBtn = page.getByTestId('allergy-other-add-btn');
    await otherInput.fill('Wespenstich');
    await otherAddBtn.click();

    // Popover remains open, edit mode exits, and all 3 allergies are shown in current list
    await expect(popover).toBeVisible();
    await expect(currentList).toBeVisible();
    await expect(currentList).toContainText('Wespenstich');

    // Verify ordering and symbols:
    // Known food allergies come first and have their icon.
    // Other allergies come after that and have no symbol.
    const rows = currentList.locator('tr.allergies-current-row');
    await expect(rows).toHaveCount(3);
    // Row 0: Milch/Laktose (known food allergen, first, has icon)
    await expect(rows.nth(0)).toContainText('Milch/Laktose');
    await expect(rows.nth(0).locator('.meal-allergen-icon-wrap svg')).toBeVisible();

    // Rows 1 & 2: other allergies (come after known food, NO symbol)
    await expect(rows.nth(1)).toContainText('Tomaten');
    await expect(rows.nth(1).locator('.meal-allergen-icon-wrap')).toHaveCount(0);
    await expect(rows.nth(1)).not.toContainText('🏷️');

    await expect(rows.nth(2)).toContainText('Wespenstich');
    await expect(rows.nth(2).locator('.meal-allergen-icon-wrap')).toHaveCount(0);
    await expect(rows.nth(2)).not.toContainText('🏷️');

    // Close the popover by clicking outside or using the close 'X' button
    const closeBtn = page.getByTestId('allergies-popover-close-btn');
    await closeBtn.click();
    await expect(popover).toHaveCount(0);

    // 6. Verify table view on Children tab:
    // "When showing the allergens on the card/table view on the children tab, we would only show a text representation."
    await expect(allergyCell).toContainText('Milch/Laktose');
    await expect(allergyCell).toContainText('Tomaten');
    await expect(allergyCell).toContainText('Wespenstich');
    // Ensure ordering: known food allergies first, other allergies after
    const childCellLines = allergyCell.locator('div[style*="justify-content: space-between"]');
    await expect(childCellLines.nth(0)).toContainText('Milch/Laktose');
    await expect(childCellLines.nth(1)).toContainText('Tomaten');
    await expect(childCellLines.nth(2)).toContainText('Wespenstich');
    // Ensure no allergen icon SVG is rendered inside the table cell (only the pencil edit button SVG exists)
    await expect(allergyCell.locator('.meal-allergen-icon-wrap')).toHaveCount(0);
    await expect(allergyCell.locator('.cell-edit-pencil-btn svg')).toHaveCount(1);

    // 7. Check Dashboard per-group aggregated allergens:
    // "When showing the per-group aggregated allergens on the dashboard, for the "lebensmittel" allergens, we would show the icons too."
    const dashboardTab = page.locator('.tabs').getByRole('button', { name: 'Dashboard' });
    await dashboardTab.click();
    await expect(dashboardTab).toHaveClass(/active/);

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    // Toggle to Allergies view on the dashboard
    const toggleAllergiesBtn = embeddedPage.locator('.kiosk-nav-btn', { hasText: 'Allergien' });
    await expect(toggleAllergiesBtn).toBeVisible();
    await toggleAllergiesBtn.click();

    const allergiesView = embeddedPage.locator('.kiosk-allergies-view');
    await expect(allergiesView).toBeVisible();

    // Verify the group containing Leo (Gruppe 1 / Kleine Gruppe) has the allergens
    const group1Section = allergiesView.locator('.kiosk-card-allergies-group').first();
    await expect(group1Section).toBeVisible();

    // Milch/Laktose badge should have an icon
    const laktoseBadge = group1Section.locator('.kiosk-allergy-badge', { hasText: 'Milch/Laktose' });
    await expect(laktoseBadge).toBeVisible();
    await expect(laktoseBadge.locator('.kiosk-allergy-icon svg')).toBeVisible();

    // Tomaten badge (custom food) should have an icon
    const tomatenBadge = group1Section.locator('.kiosk-allergy-badge', { hasText: 'Tomaten' });
    await expect(tomatenBadge).toBeVisible();
    await expect(tomatenBadge.locator('.kiosk-allergy-icon svg')).toBeVisible();

    // Wespenstich badge (Andere) should NOT have an icon
    const wespenstichBadge = group1Section.locator('.kiosk-allergy-badge', { hasText: 'Wespenstich' });
    await expect(wespenstichBadge).toBeVisible();
    await expect(wespenstichBadge.locator('.kiosk-allergy-icon')).toHaveCount(0);

    // 8. Test Employee Allergies: add "Hausstaub" (Andere) first, then "Erdnüsse" (Lebensmittel) second
    const empRes = await request.post('/api/employees', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        first_name: 'Sarah',
        last_name: 'Pflege',
        employee_type: 'caregiver',
        allergies: [],
      },
    });
    expect(empRes.ok()).toBeTruthy();

    await page.goto('/#employees');
    await page.waitForLoadState('networkidle');

    const empRow = page.locator('tr').filter({ hasText: 'Sarah' }).filter({ hasText: 'Pflege' });
    await expect(empRow).toBeVisible();
    const empAllergyCell = empRow.locator('.allergies-cell-wrapper');
    await expect(empAllergyCell).toBeVisible();

    await empAllergyCell.dblclick();
    const empPopover = page.locator('.allergies-popover');
    await expect(empPopover).toBeVisible();

    // First add "Hausstaub" under Andere
    await page.getByTestId('allergy-choice-andere').click();
    await page.getByTestId('allergy-other-input').fill('Hausstaub');
    await page.getByTestId('allergy-other-add-btn').click();

    const empList = page.getByTestId('allergies-current-list');
    await expect(empList).toBeVisible();
    await expect(empList).toContainText('Hausstaub');

    let empRows = empList.locator('tr.allergies-current-row');
    await expect(empRows).toHaveCount(1);
    await expect(empRows.nth(0)).toContainText('Hausstaub');
    await expect(empRows.nth(0).locator('.meal-allergen-icon-wrap')).toHaveCount(0);
    await expect(empRows.nth(0)).not.toContainText('🏷️');

    // Second: click '+' to add "Erdnüsse" under Lebensmittel
    await page.getByTestId('allergies-start-add-btn').click();
    await page.getByTestId('allergy-choice-lebensmittel').click();
    await page.getByTestId('allergen-option-allergy-erdnuesse').click();

    // Verify popover ordering: Erdnüsse (known food) must come FIRST with its icon,
    // and Hausstaub (other) must come SECOND with NO symbol
    await expect(empList).toBeVisible();
    empRows = empList.locator('tr.allergies-current-row');
    await expect(empRows).toHaveCount(2);

    await expect(empRows.nth(0)).toContainText('Erdnüsse');
    await expect(empRows.nth(0).locator('.meal-allergen-icon-wrap svg')).toBeVisible();

    await expect(empRows.nth(1)).toContainText('Hausstaub');
    await expect(empRows.nth(1).locator('.meal-allergen-icon-wrap')).toHaveCount(0);
    await expect(empRows.nth(1)).not.toContainText('🏷️');

    // Verify text-only representation in employees table (close popover)
    await page.getByTestId('allergies-popover-close-btn').click();
    await expect(empAllergyCell).toContainText('Erdnüsse');
    await expect(empAllergyCell).toContainText('Hausstaub');
    // Ensure ordering: Erdnüsse (known food) must be listed first even though Hausstaub was added first
    const empCellLines = empAllergyCell.locator('div[style*="justify-content: space-between"]');
    await expect(empCellLines.nth(0)).toContainText('Erdnüsse');
    await expect(empCellLines.nth(1)).toContainText('Hausstaub');
    await expect(empAllergyCell.locator('.meal-allergen-icon-wrap')).toHaveCount(0);

    // Check on Dashboard
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');
    const dbToggleBtn = page.locator('.kiosk-tablet-page.embedded .kiosk-nav-btn', { hasText: 'Allergien' });
    await expect(dbToggleBtn).toBeVisible();
    await dbToggleBtn.click();

    const empSection = page.locator('.kiosk-card-allergies-employees');
    await expect(empSection).toBeVisible();
    const empBadge = empSection.locator('.kiosk-allergy-badge-employee', { hasText: 'Erdnüsse' });
    await expect(empBadge).toBeVisible();
    await expect(empBadge.locator('.kiosk-allergy-icon svg')).toBeVisible();

    const empHausstaubBadge = empSection.locator('.kiosk-allergy-badge-employee', { hasText: 'Hausstaub' });
    await expect(empHausstaubBadge).toBeVisible();
    await expect(empHausstaubBadge.locator('.kiosk-allergy-icon')).toHaveCount(0);
  });
});
