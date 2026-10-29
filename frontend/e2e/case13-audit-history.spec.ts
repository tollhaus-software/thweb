import { test, expect } from '@playwright/test';

test.describe('Test Case 13: Audit Log and History Tracking', () => {
  test.beforeEach(async ({ request, page }) => {
    // 1. Reset database state
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

  test('neatly displays what changed when modifying elements and excludes vaccination modifications', async ({ page, request }) => {
    // Step 1: Create a family with Johannes Bauer
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();
    await page.locator('#f-p1-first').fill('Johannes');
    await page.locator('#f-p1-last').fill('Bauer');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();
    // Wait until the family was created and the add-family form closed
    await expect(page.locator('#f-p1-first')).toBeHidden();

    // Step 2: Navigate to Parents tab ("Eltern(MGA)")
    const parentsTabBtn = page.getByRole('button', { name: 'Eltern(MGA)' });
    await expect(parentsTabBtn).toBeVisible();
    await parentsTabBtn.click();

    const johannesRow = page.locator('tr', { hasText: 'Johannes' }).filter({ hasText: 'Bauer' });
    await expect(johannesRow).toBeVisible();

    // Step 3: Edit Johannes's address by double-clicking the address cell
    // Retry the double-click: right after family creation the table may still be
    // re-rendering due to concurrent refetches, which can swallow the dblclick.
    const addrCell = johannesRow.locator('td').filter({ hasText: /Adresse hinzufügen/i }).first();
    const popover = page.locator('.glass-popup');
    await expect(async () => {
      if (!(await popover.isVisible())) {
        await addrCell.dblclick();
      }
      await expect(popover).toBeVisible({ timeout: 1000 });
    }).toPass();
    const sharedInput = popover.getByRole('textbox').first();
    await sharedInput.fill('Königstraße 10');
    await popover.getByRole('button', { name: 'Speichern' }).click();
    await expect(popover).toBeHidden();
    await expect(johannesRow.locator('td', { hasText: 'Königstraße 10' })).toBeVisible();

    // Step 4: Verify audit log shows the modification neatly
    const auditTabBtn = page.getByRole('button', { name: 'Historie' });
    await expect(auditTabBtn).toBeVisible();
    await auditTabBtn.click();

    const auditTable = page.locator('.data-table');
    await expect(auditTable).toBeVisible();

    // Verify row for parent modification
    const johannesUpdateRow = auditTable.locator('tbody tr', { hasText: 'Johannes Bauer' }).filter({ hasText: 'UPDATE' });
    await expect(johannesUpdateRow).toBeVisible();
    await expect(johannesUpdateRow).toContainText('Änderungen:');
    await expect(johannesUpdateRow).toContainText('Adresse: "" → "Königstraße 10"');
    // Verify element type is "Elternteil"
    await expect(johannesUpdateRow).toContainText('Elternteil');

    // Step 5: Count audit rows before vaccination change
    const initialRowsCount = await auditTable.locator('tbody tr').count();

    // Step 6: Make a vaccination status modification on Johannes Bauer via API
    // First get family ID
    const famsRes = await request.get('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
    });
    const families = await famsRes.json();
    const fam = families.find((f: any) => f.parents?.some((p: any) => p.last_name === 'Bauer'));
    expect(fam).toBeTruthy();
    const parent = fam.parents.find((p: any) => p.last_name === 'Bauer');
    expect(parent).toBeTruthy();

    const updateVacRes = await request.put(`/api/families/${fam.id}/parents`, {
      headers: {
        Authorization: 'Bearer developer@example.com',
        'X-KMS-Access-Token': 'mock-kms-token',
        'Content-Type': 'application/json',
      },
      data: {
        parents: [
          {
            ...parent,
            vaccination_checks: [
              {
                vaccination_type: 'Masern',
                vaccination_status: 'immunized',
                checked_by: 'doctor@example.com',
                checked_on: '2026-05-01',
                proof_seen: 'impfpass',
              },
            ],
          },
        ],
      },
    });
    expect(updateVacRes.ok()).toBeTruthy();

    // Step 7: Refresh audit logs (switch away and back to Audit tab)
    await parentsTabBtn.click();
    const auditRespPromise = page.waitForResponse((resp) => resp.url().includes('/api/audit-logs') && resp.status() === 200);
    await auditTabBtn.click();
    await auditRespPromise;
    await expect(auditTable).toBeVisible();

    // Verify that NO new audit log entry was added for vaccination modification!
    const rowsCountAfterVac = await auditTable.locator('tbody tr').count();
    expect(rowsCountAfterVac).toBe(initialRowsCount);

    // Step 8: Search filtering in Audit log
    const searchInput = page.locator('input[placeholder="Historie durchsuchen..."]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Königstraße');
    await expect(auditTable.locator('tbody tr')).toHaveCount(1);
    await expect(auditTable.locator('tbody tr')).toContainText('Königstraße 10');

    await searchInput.fill('NonExistentTermXYZ');
    await expect(auditTable.locator('tbody tr')).toContainText('Keine Einträge vorhanden');

    // Step 9: Search filtering by user who performed the action
    await searchInput.fill('developer');
    await expect(auditTable.locator('tbody tr')).toHaveCount(initialRowsCount);

    // Step 10: Verify backend request receives search query parameter
    const [auditSearchRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/api/audit-logs') && req.url().includes('q=K%C3%B6nigstra%C3%9Fe')),
      searchInput.fill('Königstraße'),
    ]);
    expect(auditSearchRequest.url()).toContain('q=K%C3%B6nigstra%C3%9Fe');
    await expect(auditTable.locator('tbody tr')).toHaveCount(1);

    // Step 11: Verify pagination controls are present
    const prevBtn = page.getByRole('button', { name: 'Vorherige Seite' }).first();
    const nextBtn = page.getByRole('button', { name: 'Nächste Seite' }).first();
    const refreshBtn = page.getByRole('button', { name: 'Aktualisieren' }).first();

    await expect(prevBtn).toBeVisible();
    await expect(prevBtn).toBeDisabled(); // On first page, Prev is disabled
    await expect(nextBtn).toBeVisible();
    await expect(refreshBtn).toBeVisible();

    // Clear search and refresh
    await searchInput.fill('');
    await refreshBtn.click();
    await expect(auditTable.locator('tbody tr')).toHaveCount(initialRowsCount);
  });
});
