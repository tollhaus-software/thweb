import { test, expect } from '@playwright/test';

test.describe('Test Case 2: Inferred Default Start Date from Oldest Group Change', () => {
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

  test('pre-fills membership start date with the oldest group change date across the family', async ({ page }) => {
    // --- Step 1: Add a Parent (Family with Parent) ---
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();
    await page.locator('#f-p1-first').fill('Maximilian');
    await page.locator('#f-p1-last').fill('Bauer');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    // Switch to Eltern (Parents) tab and verify parent row is rendered
    await page.getByRole('button', { name: 'Eltern' }).click();
    const parentRow = page.locator('tr', { hasText: 'Maximilian' }).filter({ hasText: 'Bauer' });
    await expect(parentRow).toBeVisible();

    // --- Step 2: Switch to Familien tab to add children ---
    await page.getByRole('button', { name: 'Familien' }).click();

    // Find the family row for Bauer
    const familyRow = page.locator('tr.family-group-row', { hasText: 'Bauer' });
    await expect(familyRow).toBeVisible();

    // Add Child 1 (Lukas)
    await familyRow.locator('.family-add-button').click();
    await page.locator('#c-first-name').fill('Lukas');
    await page.locator('#c-last-name').fill('Bauer');
    await page.locator('#c-birth-date').fill('01.05.2021');
    await page.locator('form').getByRole('button', { name: 'Kind hinzufügen' }).click();

    // Find Lukas's row and open group change editor
    const lukasRow = page.locator('tr', { hasText: 'Lukas' });
    await expect(lukasRow).toBeVisible();
    await lukasRow.locator('button[title="Gruppenwechsel verwalten"]').click();

    // Add group change with date 01.09.2024
    const popover = page.locator('div[style*="position: fixed"]');
    const lukasDateInput = popover.locator('input[type="text"]').first();
    await expect(lukasDateInput).toBeVisible();
    await lukasDateInput.fill('01.09.2024');
    await popover.locator('button:has(svg.lucide-check)').click();

    // Close the popover by pressing Escape
    await page.keyboard.press('Escape');

    // Add Child 2 (Sophie) with an older date (15.03.2023)
    await familyRow.locator('.family-add-button').click();
    await page.locator('#c-first-name').fill('Sophie');
    await page.locator('#c-last-name').fill('Bauer');
    await page.locator('#c-birth-date').fill('10.02.2020');
    await page.locator('form').getByRole('button', { name: 'Kind hinzufügen' }).click();

    const sophieRow = page.locator('tr', { hasText: 'Sophie' });
    await expect(sophieRow).toBeVisible();
    await sophieRow.locator('button[title="Gruppenwechsel verwalten"]').click();

    const sophieDateInput = popover.locator('input[type="text"]').first();
    await expect(sophieDateInput).toBeVisible();
    await sophieDateInput.fill('15.03.2023');
    await popover.locator('button:has(svg.lucide-check)').click();

    await page.keyboard.press('Escape');

    // --- Step 3: Switch back to Parents tab & open membership dialog ---
    await page.getByRole('button', { name: 'Eltern' }).click();
    const parentRowAgain = page.locator('tr', { hasText: 'Maximilian' }).filter({ hasText: 'Bauer' });
    await expect(parentRowAgain).toBeVisible();

    // Clicking membership cell opens the membership popover
    await parentRowAgain.locator('[id^="cell-membership-"]').click();

    const membershipPopover = page.locator('.memberships-popover');
    await expect(membershipPopover).toBeVisible();

    // --- Step 4: Verify the proposed "start date" matches the older group change date (15.03.2023) ---
    const startDateInput = membershipPopover.locator('td').locator('input[type="text"]').first();
    await expect(startDateInput).toBeVisible();
    await expect(startDateInput).toHaveValue('15.03.2023');

    // --- Step 5: Confirm / Save ---
    const saveBtn = membershipPopover.locator('button:has(svg.lucide-check)');
    await saveBtn.click();
    await expect(saveBtn).toBeHidden();

    // Close popover via Escape
    await page.keyboard.press('Escape');
    await expect(membershipPopover).toBeHidden();

    // Verify parent row displays "Voll"
    await expect(parentRowAgain).toContainText('Voll');
  });
});
