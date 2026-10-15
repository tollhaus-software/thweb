import { test, expect } from '@playwright/test';

test.describe('Test Case 5: Restricted Users Support', () => {
  test('verifies restricted user access, overview tab, read-only group changes, and scoped childcare fees', async ({ request, page }) => {
    // Step 1: Reset database
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // Step 2: Use admin (developer@example.com) to seed families and parents with identifier email
    const createFam1Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Hans',
            last_name: 'Schmidt',
            emails: [
              {
                value: 'hans.schmidt@tollhaus-stuttgart.de',
                identifier_email: true,
                address_list: true,
              },
              {
                value: 'secret.hans@example.com',
                identifier_email: false,
                address_list: false,
              },
            ],
            phones: [
              {
                value: '0171 1234567',
                address_list: true,
              },
            ],
          },
        ],
      },
    });
    expect(createFam1Res.ok()).toBeTruthy();
    const fam1 = await createFam1Res.json();
    const miaChildId = crypto.randomUUID();

    const createMiaRes = await request.post(`/api/families/${fam1.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: miaChildId,
        family_id: fam1.id,
        first_name: 'Mia',
        last_name: 'Schmidt',
        birth_date: '2021-04-10',
      },
    });
    expect(createMiaRes.ok()).toBeTruthy();

    // Add group change for Mia (Gruppe 1 starting today)
    const todayStr = new Date().toISOString().split('T')[0];
    const addGcRes = await request.post(`/api/children/${miaChildId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        child_id: miaChildId,
        change_date: todayStr,
        target_group: 1,
      },
    });
    expect(addGcRes.ok()).toBeTruthy();

    // Create a second family: Müller with child Tom
    const createFam2Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Lisa',
            last_name: 'Müller',
            emails: [
              {
                value: 'lisa.mueller@example.com',
                identifier_email: true,
                address_list: true,
              },
            ],
            phones: [
              {
                value: '0172 9876543',
                address_list: true,
              },
            ],
          },
        ],
      },
    });
    expect(createFam2Res.ok()).toBeTruthy();
    const fam2 = await createFam2Res.json();
    const tomChildId = crypto.randomUUID();

    const createTomRes = await request.post(`/api/families/${fam2.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: tomChildId,
        family_id: fam2.id,
        first_name: 'Tom',
        last_name: 'Müller',
        birth_date: '2020-02-15',
      },
    });
    expect(createTomRes.ok()).toBeTruthy();

    // Add group change for Tom as well
    await request.post(`/api/children/${tomChildId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        child_id: tomChildId,
        change_date: todayStr,
        target_group: 2,
      },
    });

    // Step 3: Authenticate as the restricted user (hans.schmidt@tollhaus-stuttgart.de)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'hans.schmidt@tollhaus-stuttgart.de');
    });

    // Step 4: Load application
    await page.goto('/');

    // Verify Tab visibility:
    // - "Familien" (familiesOverview) must be visible
    const familiesOverviewTab = page.getByRole('button', { name: 'Familien', exact: true });
    await expect(familiesOverviewTab).toBeVisible();

    // - MGA tabs must NOT be visible
    await expect(page.getByRole('button', { name: 'Familien(MGA)' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eltern(MGA)' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kinder(MGA)' })).toHaveCount(0);

    // - "Betreuungsgebühren" must be visible
    const feesTab = page.getByRole('button', { name: 'Betreuungsgebühren' });
    await expect(feesTab).toBeVisible();

    // - Admin and audit tabs must NOT be visible
    await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Audit' })).toHaveCount(0);

    // Verify no "Familie hinzufügen" button
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toHaveCount(0);

    // Verify families are rendered in overview
    const schmidtRow = page.locator('tr.family-group-row', { hasText: 'Schmidt' });
    await expect(schmidtRow).toBeVisible();
    await expect(schmidtRow).toContainText('Hans Schmidt');
    await expect(schmidtRow).toContainText('hans.schmidt@tollhaus-stuttgart.de');
    await expect(schmidtRow).toContainText('0171 1234567');
    // Secret non-address-list email must NOT be shown
    await expect(schmidtRow).not.toContainText('secret.hans@example.com');

    // Verify NO jump links to parent or child tabs exist
    await expect(page.locator('.family-parent-link')).toHaveCount(0);
    await expect(page.locator('.family-child-link')).toHaveCount(0);

    // Verify NO "+ Kind" or "+ Elternteil" buttons
    await expect(page.getByRole('button', { name: '+ Kind' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Elternteil' })).toHaveCount(0);

    // Check Mia Schmidt's row (own family child)
    const miaRow = page.locator('tr', { hasText: 'Mia' });
    await expect(miaRow).toBeVisible();
    // For own child, current group is displayed simply as "<group name>" (e.g. "Kleine Gr.")
    await expect(miaRow).toContainText('Kleine Gr.');
    // Must NOT contain extended duration/date text like "seit" or "(1J"
    await expect(miaRow).not.toContainText('seit');

    // Clicking does NOT open any popover editor
    await miaRow.click();
    await expect(page.locator('div[style*="position: fixed"]')).toHaveCount(0);

    // Check Tom Müller's row (other family child)
    const tomRow = page.locator('tr', { hasText: 'Tom' });
    await expect(tomRow).toBeVisible();
    // For other family child, group is NOT exposed: shows '-'
    await expect(tomRow.locator('td').last()).toHaveText('-');

    // Step 5: Switch to "Betreuungsgebühren" tab
    await feesTab.click();

    // In restricted mode:
    // - Family selection accordion must NOT be visible
    await expect(page.getByText('Familienauswahl')).toHaveCount(0);

    // - Table header must be "Monatliche Betreuungsgebühren"
    await expect(page.getByRole('heading', { name: 'Monatliche Betreuungsgebühren' })).toBeVisible();

    // - Fees table displays fees for Schmidt only
    const feesTable = page.locator('table').first();
    await expect(feesTable).toBeVisible();
    await expect(feesTable).toContainText('Schmidt');
    await expect(feesTable).not.toContainText('Müller');
  });
});
