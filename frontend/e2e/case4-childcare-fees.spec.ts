import { test, expect } from '@playwright/test';

test.describe('Test Case 4: Childcare Fees Tooltips & Translations', () => {
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

  test('verifies translation, tooltip portal positioning, and hiding of info icon with no details', async ({ page }) => {
    // Step 1: Add a Family without children (fee will be 0.00 across all months)
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();
    await page.locator('#f-p1-first').fill('Maria');
    await page.locator('#f-p1-last').fill('Muster');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    // Verify family row is rendered
    const familyRow1 = page.locator('tr.family-group-row', { hasText: 'Muster' });
    await expect(familyRow1).toBeVisible();

    // Step 2: Add a second Family with a child that is enrolled in Gruppe 1
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();
    await page.locator('#f-p1-first').fill('Stefan');
    await page.locator('#f-p1-last').fill('Bauer');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    const familyRow2 = page.locator('tr.family-group-row', { hasText: 'Bauer' });
    await expect(familyRow2).toBeVisible();

    // Add Child (Lukas) to Bauer family
    await familyRow2.locator('.family-add-button').click();
    await page.locator('#c-first-name').fill('Lukas');
    await page.locator('#c-last-name').fill('Bauer');
    await page.locator('#c-birth-date').fill('01.05.2021');
    await page.locator('form').getByRole('button', { name: 'Kind hinzufügen' }).click();

    // Set group change for Lukas to Gruppe 1 as of 01.01.2025
    const lukasRow = page.locator('tr', { hasText: 'Lukas' });
    await expect(lukasRow).toBeVisible();
    await lukasRow.locator('button[title="Gruppenwechsel verwalten"]').click();

    const popover = page.locator('div[style*="position: fixed"]');
    const lukasDateInput = popover.locator('input[type="text"]').first();
    await expect(lukasDateInput).toBeVisible();
    await lukasDateInput.fill('01.01.2025');
    await popover.locator('button:has(svg.lucide-check)').click();
    await page.keyboard.press('Escape');

    // Step 3: Switch to Betreuungsgebühren tab
    await page.getByRole('button', { name: 'Betreuungsgebühren' }).click();
    await expect(page.getByRole('heading', { name: 'Monatliche Gebühren pro Familie' })).toBeVisible();

    // 1. Verify translation for fee changes section
    const feeChangesHeading = page.getByRole('heading', { name: 'Gebührenänderungen' });
    await expect(feeChangesHeading).toBeVisible();

    // The text must be "Keine Gebührenänderungen in diesem Zeitraum" without "erfasst"
    await expect(page.locator('text=Keine Gebührenänderungen in diesem Zeitraum')).toBeVisible();
    await expect(page.locator('text=Keine Gebührenänderungen in diesem Zeitraum erfasst')).toHaveCount(0);

    // 2. Check the table grid
    const table = page.locator('table.data-table').first();
    await expect(table).toBeVisible();

    // Find the row for Muster (has no children, fee 0.00)
    const musterRow = table.locator('tbody tr', { hasText: 'Muster' });
    await expect(musterRow).toBeVisible();

    // In musterRow, fee cells have 0.00 and no details/change, so the "i" symbol should be hidden
    const musterCell = musterRow.locator('td', { hasText: '0.00' }).first();
    await expect(musterCell).toBeVisible();

    const hiddenInfoContainer = musterCell.locator('div[aria-hidden="true"]');
    await expect(hiddenInfoContainer).toBeAttached();
    await expect(hiddenInfoContainer).toHaveCSS('visibility', 'hidden');

    // Check that layout space is preserved (width and height > 0)
    const hiddenBox = await hiddenInfoContainer.boundingBox();
    expect(hiddenBox).not.toBeNull();
    if (hiddenBox) {
      expect(hiddenBox.width).toBeGreaterThan(0);
      expect(hiddenBox.height).toBeGreaterThan(0);
    }

    // Hovering over the hidden container must NOT open any tooltip
    await hiddenInfoContainer.hover({ force: true });
    await page.waitForTimeout(150);
    const orphanTooltips = page.locator('body > div[style*="z-index: 9999"]:not([style*="visibility: hidden"])');
    await expect(orphanTooltips).toHaveCount(0);

    // 3. Find the row for Bauer (has child Lukas in Gruppe 1, fee > 0)
    const bauerRow = table.locator('tbody tr', { hasText: 'Bauer' });
    await expect(bauerRow).toBeVisible();

    // Find cell with fee > 0 in bauerRow
    const bauerCellWithFee = bauerRow.locator('td').filter({ hasText: /^(?!0\.00)[0-9]+\.[0-9]{2}/ }).first();
    await expect(bauerCellWithFee).toBeVisible();

    // The info icon must be visible
    const infoIconBtn = bauerCellWithFee.locator('div:not([aria-hidden="true"]) > svg.lucide-info');
    await expect(infoIconBtn).toBeVisible();

    // Click the info icon in the table
    await infoIconBtn.click();

    // Verify the tooltip is rendered via portal as a DIRECT child of document.body
    const portalTooltip = page.locator('body > div[style*="z-index: 9999"]').first();
    await expect(portalTooltip).toBeVisible();

    // Confirm that the tooltip is NOT inside the table
    const tableContainsTooltip = await table.evaluate((tbl, tip) => {
      return tbl.contains(tip as Node);
    }, await portalTooltip.elementHandle());
    expect(tableContainsTooltip).toBe(false);

    // Verify tooltip contents (fee breakdown)
    await expect(portalTooltip).toContainText('Lukas');
    await expect(portalTooltip).toContainText('Gruppe 1');

    // Verify tooltip positioning within viewport (not clipped)
    const tooltipBox = await portalTooltip.boundingBox();
    expect(tooltipBox).not.toBeNull();
    if (tooltipBox) {
      expect(tooltipBox.y).toBeGreaterThanOrEqual(0);
      expect(tooltipBox.x).toBeGreaterThanOrEqual(0);
      expect(tooltipBox.width).toBeGreaterThan(200);
    }

    // Close tooltip by pressing Escape
    await page.keyboard.press('Escape');
    await expect(portalTooltip).toBeHidden();
  });
});
