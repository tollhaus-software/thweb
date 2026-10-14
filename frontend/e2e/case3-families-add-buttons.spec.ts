import { test, expect } from '@playwright/test';

test.describe('Test Case 3: Families View Add Buttons (+ Kind and + Elternteil)', () => {
  test.beforeEach(async ({ request, page }) => {
    // 1. Reset database state to ensure clean environment
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Mock authenticate as admin user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Load application
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();
  });

  test('displays + Kind and + Elternteil buttons on the right side of the table and allows adding both', async ({ page }) => {
    // --- Step 1: Create a family "Mustermann" with Parent 1 "Erika" ---
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();
    await page.locator('#f-p1-first').fill('Erika');
    await page.locator('#f-p1-last').fill('Mustermann');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    // Verify family row appears on default Familien tab
    const familyRow = page.locator('tr.family-group-row', { hasText: 'Mustermann' });
    await expect(familyRow).toBeVisible();

    // Verify Erika is displayed in the family sub-header
    await expect(familyRow.locator('.family-sub-header-parents')).toContainText('Erika Mustermann');

    // --- Step 2: Verify both buttons exist on the right side of the family row ---
    const actionsContainer = familyRow.locator('.family-group-actions');
    await expect(actionsContainer).toBeVisible();

    const addChildBtn = familyRow.getByRole('button', { name: '+ Kind' });
    const addParentBtn = familyRow.getByRole('button', { name: '+ Elternteil' });

    await expect(addChildBtn).toBeVisible();
    await expect(addParentBtn).toBeVisible();

    // Verify position: actions container is on the right of the row
    const rowBox = await familyRow.boundingBox();
    const actionsBox = await actionsContainer.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    // The right edge of the actions box should be near the right edge of the visible table
    expect(actionsBox!.x).toBeGreaterThan(rowBox!.x + rowBox!.width * 0.5);

    // --- Step 3: Add a Child via + Kind button ---
    await addChildBtn.click();

    // Verify Add Child modal opened with correct title and prefilled last name
    const childModal = page.locator('.modal-container');
    await expect(childModal).toBeVisible();
    await expect(childModal).toContainText('Kind hinzufügen zu Mustermann');
    await expect(page.locator('#c-last-name')).toHaveValue('Mustermann');

    // Fill child details
    await page.locator('#c-first-name').fill('Felix');
    await page.locator('form').getByRole('button', { name: 'Kind hinzufügen' }).click();
    await expect(childModal).toBeHidden();

    // Verify Felix appears as a child in the table under Mustermann
    const felixRow = page.locator('tr', { hasText: 'Felix Mustermann' });
    await expect(felixRow).toBeVisible();

    // --- Step 4: Add a Parent via + Elternteil button ---
    await addParentBtn.click();

    // Verify Add Parent modal opened with correct title and prefilled last name
    const parentModal = page.locator('.modal-container');
    await expect(parentModal).toBeVisible();
    await expect(parentModal).toContainText('Elternteil hinzufügen zu Mustermann');
    await expect(page.locator('#p-last-name')).toHaveValue('Mustermann');

    // Fill second parent details
    await page.locator('#p-first-name').fill('Markus');
    await page.locator('form').getByRole('button', { name: 'Elternteil hinzufügen' }).click();
    await expect(parentModal).toBeHidden();

    // Verify Markus appears in the family sub-header alongside Erika
    await expect(familyRow.locator('.family-sub-header-parents')).toContainText('Markus Mustermann');
    await expect(familyRow.locator('.family-sub-header-parents')).toContainText('Erika Mustermann');

    // Take a screenshot of the families view for visual verification
    await page.screenshot({ path: 'test-results/families-view-buttons.png' });
  });
});
