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
    await page.getByRole('button', { name: 'Familien(MGA)' }).click();
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();
  });

  test('verifies translation, tooltip portal positioning, and hiding of info icon with no details', async ({ page }) => {
    // Step 1: Add a Family without children (fee will be 0.00 across all months)
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();
    await page.locator('#f-p1-first').fill('Maria');
    await page.locator('#f-p1-last').fill('Muster');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    // Verify family row is rendered
    const familyRow1 = page.locator('.families-table tbody tr', { hasText: 'Muster' });
    await expect(familyRow1).toBeVisible();

    // Step 2: Add a second Family with a child that is enrolled in Gruppe 1
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();
    await page.locator('#f-p1-first').fill('Stefan');
    await page.locator('#f-p1-last').fill('Bauer');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    const familyRow2 = page.locator('.families-table tbody tr', { hasText: 'Bauer' });
    await expect(familyRow2).toBeVisible();

    // Add Child (Lukas) to Bauer family
    const childrenCell = familyRow2.locator('td[data-column-id="children"]');
    await childrenCell.locator('button.family-add-button').click();
    await page.locator('#c-first-name').fill('Lukas');
    await page.locator('#c-last-name').fill('Bauer');
    await page.locator('#c-birth-date').fill('01.05.2021');
    await page.locator('form').getByRole('button', { name: 'Kind hinzufügen' }).click();

    // Set group change for Lukas to Gruppe 1 as of 01.01.2025
    await page.getByRole('button', { name: 'Kinder(MGA)', exact: true }).click();
    const lukasRow = page.locator('tr', { hasText: 'Lukas' });
    await expect(lukasRow).toBeVisible();
    await lukasRow.locator('button[title="Gruppenwechsel verwalten"]').first().click();

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
    await expect(portalTooltip).toContainText('Kleine Gruppe');

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

  test('renders mobile layout with single-family selector, vertical months+fees table, and fee change cards for regular and restricted users', async ({ request, page }) => {
    const currentYear = new Date().getFullYear();

    // Seed Family 1 (Muster - no children)
    const fam1Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Maria',
            last_name: 'Muster',
          },
        ],
      },
    });
    expect(fam1Res.ok()).toBeTruthy();

    // Seed Family 2 (Bauer - with identifier email for restricted user test, and child Lukas with a mid-year group change)
    const fam2Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Stefan',
            last_name: 'Bauer',
            emails: [
              {
                value: 'stefan.bauer@tollhaus-stuttgart.de',
                identifier_email: true,
                address_list: true,
              },
            ],
          },
        ],
      },
    });
    expect(fam2Res.ok()).toBeTruthy();
    const fam2 = await fam2Res.json();

    const lukasId = crypto.randomUUID();
    const childRes = await request.post(`/api/families/${fam2.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: lukasId,
        family_id: fam2.id,
        first_name: 'Lukas',
        last_name: 'Bauer',
        birth_date: `${currentYear - 4}-05-01`,
      },
    });
    expect(childRes.ok()).toBeTruthy();

    // Enroll Lukas in Gruppe 1 starting June of currentYear so there is a fee change in Jun <currentYear>
    const gcRes = await request.post(`/api/children/${lukasId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        child_id: lukasId,
        change_date: `${currentYear}-06-01`,
        target_group: 1,
      },
    });
    expect(gcRes.ok()).toBeTruthy();

    // Switch to mobile viewport and reload
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');

    // Open Betreuungsgebühren tab (open mobile drawer if on mobile)
    const toggleSidebarBtn = page.getByRole('button', { name: 'Seitenleiste umschalten' });
    if (await toggleSidebarBtn.isVisible()) {
      await toggleSidebarBtn.click();
    }
    await page.getByRole('button', { name: 'Betreuungsgebühren' }).click();
    await expect(page.getByRole('heading', { name: 'Monatliche Gebühren pro Familie' })).toBeVisible();
    await expect(page.locator('.fees-month-range-row')).toContainText('Von');
    await expect(page.locator('.fees-month-range-row')).toContainText('Bis');

    // Desktop multi-family checklist must NOT be visible on mobile
    await expect(page.getByRole('button', { name: /Familien auswählen/i })).toHaveCount(0);

    // Mobile single-family selector (dropdown + prev/next) must be visible
    const familySelect = page.locator('#mobile-family-select');
    const prevBtn = page.locator('.fees-family-prev-btn');
    const nextBtn = page.locator('.fees-family-next-btn');
    await expect(familySelect).toBeVisible();
    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();

    // Initially first family (Bauer or Muster depending on order) is selected; prevBtn is disabled
    await expect(prevBtn).toBeDisabled();
    await expect(nextBtn).toBeEnabled();

    // Select Muster first to verify 0 fees and no fee changes
    await familySelect.selectOption({ label: 'Muster' });
    const verticalTable = page.locator('table.fees-mobile-vertical-table');
    await expect(verticalTable).toBeVisible();
    await expect(verticalTable.locator('thead')).toContainText('Monat');
    await expect(verticalTable.locator('thead')).toContainText('Gebühr (Muster)');
    await expect(verticalTable.locator('tbody tr')).toHaveCount(12);
    await expect(page.locator('text=Keine Gebührenänderungen in diesem Zeitraum')).toBeVisible();

    // Now switch to Bauer using dropdown or prev/next
    await familySelect.selectOption({ label: 'Bauer' });
    await expect(verticalTable.locator('thead')).toContainText('Gebühr (Bauer)');

    // Check vertical rows: Jan has 0.00 EUR, Jun has > 0.00 EUR and highlighted background
    const janRow = verticalTable.locator(`tbody tr[data-month="${currentYear}-01"]`);
    const junRow = verticalTable.locator(`tbody tr[data-month="${currentYear}-06"]`);
    await expect(janRow.locator('td').first()).toHaveText(`Jan ${currentYear}`);
    await expect(janRow.locator('td').nth(1)).toContainText('0.00 EUR');
    await expect(junRow.locator('td').first()).toHaveText(`Jun ${currentYear}`);
    await expect(junRow.locator('td').nth(1)).not.toContainText('0.00 EUR');

    // Verify Fee Changes section renders cards instead of a table on mobile
    const feeChangeCards = page.locator('.fee-change-card');
    await expect(feeChangeCards).toHaveCount(1);
    const junCard = feeChangeCards.first();
    await expect(junCard.locator('.fee-change-card-header')).toHaveText(`Jun ${currentYear}`);
    // Header does NOT repeat family name
    await expect(junCard.locator('.fee-change-card-header')).not.toContainText('Bauer');
    await expect(junCard.locator('[data-field="previous_fee"]')).toContainText('Vorherige Gebühr');
    await expect(junCard.locator('[data-field="previous_fee"]')).toContainText('0.00 EUR');
    await expect(junCard.locator('[data-field="new_fee"]')).toContainText('Neue Gebühr');
    await expect(junCard.locator('[data-field="reason"]')).toContainText('Grund');
    await expect(junCard.locator('[data-field="reason"]')).toContainText('Lukas');

    // Now test restricted user on mobile viewport
    await page.addInitScript(() => {
      localStorage.setItem('token', 'stefan.bauer@tollhaus-stuttgart.de');
    });
    await page.goto('/');
    if (await toggleSidebarBtn.isVisible()) {
      await toggleSidebarBtn.click();
    }
    await page.getByRole('button', { name: 'Betreuungsgebühren' }).click();
    await expect(page.getByRole('heading', { name: 'Monatliche Betreuungsgebühren' })).toBeVisible();

    // Restricted user with 1 family should NOT see the family selector dropdown
    await expect(page.locator('#mobile-family-select')).toHaveCount(0);

    // Vertical table and fee change card are displayed for restricted user's family (Bauer)
    await expect(verticalTable).toBeVisible();
    await expect(verticalTable.locator('thead')).toContainText('Gebühr (Bauer)');
    await expect(verticalTable.locator('tbody tr')).toHaveCount(12);
    await expect(page.locator('.fee-change-card')).toHaveCount(1);
    await expect(page.locator('.fee-change-card-header').first()).toHaveText(`Jun ${currentYear}`);
  });

  test('sorts multiple families alphabetically by canonical family name and provides single-family quick selection', async ({ request, page }) => {
    const authHeaders = { Authorization: 'Bearer developer@example.com' };
    // Create 3 families out of alphabetical order: Zimmermann, Aalberg, Bauer
    await request.post('/api/families', {
      headers: authHeaders,
      data: {
        parents: [{ first_name: 'Stefan', last_name: 'Zimmermann' }],
      },
    });
    await request.post('/api/families', {
      headers: authHeaders,
      data: {
        parents: [
          { first_name: 'Zachary', last_name: 'Aalberg' },
          { first_name: 'Benjamin', last_name: 'Aalberg' },
        ],
      },
    });
    await request.post('/api/families', {
      headers: authHeaders,
      data: {
        parents: [{ first_name: 'Maria', last_name: 'Bauer' }],
      },
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Betreuungsgebühren' }).click();
    await expect(page.getByRole('heading', { name: 'Monatliche Gebühren pro Familie' })).toBeVisible();

    const table = page.locator('table.data-table').first();
    await expect(table).toBeVisible();

    // Verify desktop table rows are sorted alphabetically: Aalberg, Bauer, Zimmermann
    const familyNames = await table.locator('tbody tr td.sticky-col').allTextContents();
    expect(familyNames).toEqual(['Aalberg', 'Bauer', 'Zimmermann']);

    // Expand the "Familien auswählen" checklist
    const expandBtn = page.getByRole('button', { name: /Familien auswählen/i });
    await expandBtn.click();
    await expect(expandBtn).toContainText('(3 Familien ausgewählt)');

    // Verify checklist items are also in alphabetical order
    const checklistFamilyNames = await page.locator('.fees-family-checkbox-row span').allTextContents();
    expect(checklistFamilyNames).toEqual(['Aalberg', 'Bauer', 'Zimmermann']);

    // Test "Nur diese" button on a row (e.g. click "Nur diese" on Zimmermann)
    const zimmermannRow = page.locator('.fees-family-checkbox-row', { hasText: 'Zimmermann' });
    await zimmermannRow.locator('button.fees-select-only-btn').click();

    // Now only Zimmermann is selected
    await expect(expandBtn).toContainText('(1 Familie ausgewählt)');
    const tableAfterSelectOnly = await table.locator('tbody tr td.sticky-col').allTextContents();
    expect(tableAfterSelectOnly).toEqual(['Zimmermann']);

    // Restore all families
    await page.getByRole('button', { name: 'Alle auswählen' }).click();
    await expect(expandBtn).toContainText('(3 Familien ausgewählt)');
    expect(await table.locator('tbody tr td.sticky-col').allTextContents()).toEqual(['Aalberg', 'Bauer', 'Zimmermann']);

    // Test search filter with Enter key
    const searchInput = page.locator('.search-input');
    await searchInput.fill('Bauer');
    // Button "Nur diese" should appear next to the search box since exactly 1 match
    const filterSelectBtn = page.locator('button.fees-select-only-filtered-btn');
    await expect(filterSelectBtn).toBeVisible();
    await expect(filterSelectBtn).toHaveText('Nur diese');

    // Press Enter to select only the matching family
    await searchInput.press('Enter');
    await expect(expandBtn).toContainText('(1 Familie ausgewählt)');
    expect(await table.locator('tbody tr td.sticky-col').allTextContents()).toEqual(['Bauer']);

    // Clear search and restore all
    await searchInput.fill('');
    await page.getByRole('button', { name: 'Alle auswählen' }).click();
    await expect(expandBtn).toContainText('(3 Familien ausgewählt)');

    // Test toolbar "Nur diese" / "Nur Treffer" button click
    await searchInput.fill('Aal');
    await expect(filterSelectBtn).toBeVisible();
    await filterSelectBtn.click();
    await expect(expandBtn).toContainText('(1 Familie ausgewählt)');
    expect(await table.locator('tbody tr td.sticky-col').allTextContents()).toEqual(['Aalberg']);
  });
});

