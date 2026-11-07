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
    await page.goto('/#families');
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
    const mgaTab = page.getByRole('button', { name: 'MGA', exact: true });
    if (await mgaTab.isVisible()) {
      await mgaTab.click();
    }
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

  test('displays details for UPDATE_ASSIGNEES when updating job assignees', async ({ page, request }) => {
    // 1. Create a parent (via family)
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Sabine',
            last_name: 'Koch',
            emails: [{ value: 'sabine@example.com' }],
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const fam = await famRes.json();
    const parentId = fam.parents[0].id;

    // 2. Create a job "Finanzen"
    const jobRes = await request.post('/api/jobs', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        name: 'Finanzen',
        description: 'Finanzverwaltung',
        contact_email: 'finanzen@example.com',
      },
    });
    expect(jobRes.ok()).toBeTruthy();
    const job = await jobRes.json();

    // 3. Assign Sabine Koch to the job
    const assignRes = await request.put(`/api/jobs/${job.id}/assignees`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parent_ids: [parentId],
        employee_ids: [],
      },
    });
    expect(assignRes.ok()).toBeTruthy();

    // 4. Remove Sabine Koch from the job
    const unassignRes = await request.put(`/api/jobs/${job.id}/assignees`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parent_ids: [],
        employee_ids: [],
      },
    });
    expect(unassignRes.ok()).toBeTruthy();

    // 5. Navigate to History tab
    const auditTabBtn = page.getByRole('button', { name: 'Historie' });
    await expect(auditTabBtn).toBeVisible();
    await auditTabBtn.click();

    const auditTable = page.locator('.data-table');
    await expect(auditTable).toBeVisible();

    // Verify row for assignee addition
    const addRow = auditTable.locator('tbody tr', { hasText: 'UPDATE_ASSIGNEES' }).filter({ hasText: 'Hinzugefügt: Sabine Koch' });
    await expect(addRow).toBeVisible();
    await expect(addRow).toContainText('Job: Finanzen');
    await expect(addRow).toContainText('Job');

    // Verify row for assignee removal
    const removeRow = auditTable.locator('tbody tr', { hasText: 'UPDATE_ASSIGNEES' }).filter({ hasText: 'Entfernt: Sabine Koch' });
    await expect(removeRow).toBeVisible();
    await expect(removeRow).toContainText('Job: Finanzen');

    // 6. Test searching for job name in history
    const searchInput = page.locator('input[placeholder="Historie durchsuchen..."]');
    await searchInput.fill('Finanzen');
    await expect(auditTable.locator('tbody tr', { hasText: 'UPDATE_ASSIGNEES' })).toHaveCount(2);

    // 7. Test searching for assignee name in history
    await searchInput.fill('Sabine Koch');
    await expect(auditTable.locator('tbody tr', { hasText: 'UPDATE_ASSIGNEES' })).toHaveCount(2);
  });
});
