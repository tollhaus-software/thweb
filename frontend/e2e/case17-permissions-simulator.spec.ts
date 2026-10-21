import { test, expect } from '@playwright/test';

test.describe('Test Case 17: Role and Permissions Simulator', () => {
  test('allows admin to simulate user and custom permissions, displays header indicator and button to leave', async ({ request, page }) => {
    // 1. Reset DB state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Create family with identifier email
    const createFamRes = await request.post('/api/families', {
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
            ],
            phones: [{ value: '0171 1234567', address_list: true }],
          },
        ],
      },
    });
    expect(createFamRes.ok()).toBeTruthy();
    const fam = await createFamRes.json();

    const childId = crypto.randomUUID();
    const createChildRes = await request.post(`/api/families/${fam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: childId,
        family_id: fam.id,
        first_name: 'Mia',
        last_name: 'Schmidt',
        birth_date: '2021-04-10',
      },
    });
    expect(createChildRes.ok()).toBeTruthy();

    // 3. Authenticate as developer (admin)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/');

    // 4. Verify initial admin view
    const adminTab = page.getByRole('button', { name: 'Admin', exact: true });
    await expect(adminTab).toBeVisible();
    await expect(page.getByRole('button', { name: 'Familien(MGA)', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Eltern(MGA)', exact: true })).toBeVisible();

    // 5. Open simulator via 3-dots overflow menu
    const threeDotsBtn = page.locator('button.header-overflow-btn');
    await expect(threeDotsBtn).toBeVisible();
    await threeDotsBtn.click();

    const simMenuItem = page.getByTestId('overflow-simulate-button');
    await expect(simMenuItem).toBeVisible();
    await expect(simMenuItem).toHaveText(/Berechtigungen simulieren|Simulate permissions/i);
    await simMenuItem.click();

    const modal = page.getByTestId('simulator-modal');
    await expect(modal).toBeVisible();

    // Verify User mode tab is active
    const candidateItem = page.getByTestId('simulator-candidate-hans.schmidt@tollhaus-stuttgart.de');
    await expect(candidateItem).toBeVisible();
    await candidateItem.click();

    // Click "Simulation starten"
    const startSimBtn = page.getByTestId('start-simulation-button');
    await startSimBtn.click();
    await expect(modal).toHaveCount(0);

    // 6. Verify header indicates simulation mode
    const simBanner = page.getByTestId('simulation-banner');
    await expect(simBanner).toBeVisible();
    await expect(simBanner).toContainText('Berechtigungssimulation aktiv:');
    await expect(simBanner).toContainText('hans.schmidt@tollhaus-stuttgart.de');

    // Small (roles/permissions) button must be present in banner
    const viewRolesBtn = page.getByTestId('view-simulated-roles-btn');
    await expect(viewRolesBtn).toBeVisible();
    await expect(viewRolesBtn).toHaveText(/(\(Rollen\/Berechtigungen\)|\(roles\/permissions\))/);

    // Clicking (roles/permissions) opens dialog showing simulated roles and permissions
    await viewRolesBtn.click();
    const rolesModal = page.getByTestId('simulated-roles-modal');
    await expect(rolesModal).toBeVisible();
    await expect(page.getByTestId('simulated-user-display')).toHaveText('hans.schmidt@tollhaus-stuttgart.de');
    await expect(page.getByTestId('simulated-roles-list')).toContainText('restricted');
    await page.getByTestId('close-simulated-roles-modal').click();
    await expect(rolesModal).toHaveCount(0);

    // Verify that when simulating a user without permissions.simulate, "Simulate permissions" is NOT present in the overflow menu
    await threeDotsBtn.click();
    await expect(page.getByTestId('overflow-simulate-button')).toHaveCount(0);
    await page.keyboard.press('Escape');

    const leaveBtn = page.getByTestId('leave-simulation-button');
    await expect(leaveBtn).toBeVisible();

    // 7. Verify system behaves as restricted parent (intersection with admin = restricted permissions)
    // "Familien" overview tab is visible
    await expect(page.getByRole('button', { name: 'Familien', exact: true })).toBeVisible();
    // "Betreuungsgebühren" is visible
    await expect(page.getByRole('button', { name: 'Betreuungsgebühren', exact: true })).toBeVisible();
    // MGA and Admin tabs must NOT be visible
    await expect(page.getByRole('button', { name: 'Familien(MGA)', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eltern(MGA)', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kinder(MGA)', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);

    // 8. Leave simulation via the header button
    await leaveBtn.click();
    await expect(simBanner).toHaveCount(0);

    // Verify normal Admin view is restored
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Familien(MGA)', exact: true })).toBeVisible();

    // 9. Enter simulator via Mode 2: Custom Roles & Direct Permissions
    await threeDotsBtn.click();
    await page.getByTestId('overflow-simulate-button').click();
    await expect(modal).toBeVisible();

    // Switch to Custom mode tab
    await page.getByTestId('simulator-tab-custom').click();

    // Select viewer role
    const viewerCard = page.getByTestId('role-card-viewer');
    await expect(viewerCard).toBeVisible();
    await viewerCard.click();

    // Select mealplan.view permission
    const mealPlanCheckbox = page.getByTestId('perm-checkbox-mealplan.view');
    await expect(mealPlanCheckbox).toBeVisible();
    await mealPlanCheckbox.click();

    // Start custom simulation
    await page.getByTestId('start-simulation-button').click();
    await expect(modal).toHaveCount(0);

    // 10. Verify custom simulation state in header:
    // Does NOT display roles inline in header banner, only the small (roles/permissions) button
    await expect(simBanner).toBeVisible();
    await expect(simBanner).toContainText('Berechtigungssimulation aktiv:');
    await expect(page.locator('.simulation-target')).toHaveCount(0);
    await expect(viewRolesBtn).toBeVisible();

    // Open roles dialog and verify viewer role & mealplan.view permission are displayed
    await viewRolesBtn.click();
    await expect(rolesModal).toBeVisible();
    await expect(page.getByTestId('simulated-roles-list')).toContainText('viewer');
    await expect(page.getByTestId('simulated-permissions-list')).toContainText('mealplan.view');
    await page.getByTestId('close-simulated-roles-modal').click();
    await expect(rolesModal).toHaveCount(0);

    // Verify viewer has mealplan tab
    await expect(page.getByRole('button', { name: 'Essen/Wochenplan', exact: true })).toBeVisible();
    // Verify viewer cannot see Admin tab
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);

    // 11. Leave simulation
    await page.getByTestId('leave-simulation-button').click();
    await expect(simBanner).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toBeVisible();
  });

  test('verifies that modifying actions during simulation are logged under the actual user name and denied when write perms are absent', async ({ request, page }) => {
    // 1. Reset DB
    await request.post('/api/test/reset');

    // 2. Create family with identifier email
    const createFamRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Max',
            last_name: 'SimulatedParent',
            emails: [
              {
                value: 'max.simulated@tollhaus-stuttgart.de',
                identifier_email: true,
                address_list: true,
              },
            ],
            phones: [],
          },
        ],
      },
    });
    expect(createFamRes.ok()).toBeTruthy();
    const fam = await createFamRes.json();
    const parentId = fam.parents[0].id;

    // 3. Login as developer@example.com
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // 4. Open simulator and simulate read-only viewer (NO families.all.write)
    await page.locator('button.header-overflow-btn').click();
    await page.getByTestId('overflow-simulate-button').click();
    await page.getByTestId('simulator-tab-custom').click();
    await page.getByTestId('role-card-viewer').click();
    await page.getByTestId('start-simulation-button').click();

    await expect(page.getByTestId('simulation-banner')).toBeVisible();

    // 5. Attempt modifying action via page.request (which carries the browser's simulation cookie)
    const deniedUpdateRes = await page.request.put(`/api/families/${fam.id}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            id: parentId,
            family_id: fam.id,
            first_name: 'ShouldFail',
            last_name: 'SimulatedParent',
          },
        ],
      },
    });
    // Must be 403 Forbidden because simulated viewer does not have write permissions
    expect(deniedUpdateRes.status()).toBe(403);

    // 6. Leave viewer simulation and switch to custom role with write permissions
    await page.getByTestId('leave-simulation-button').click();
    await page.locator('button.header-overflow-btn').click();
    await page.getByTestId('overflow-simulate-button').click();
    await page.getByTestId('simulator-tab-custom').click();
    // Select write permission
    await page.getByTestId('perm-checkbox-families.all.write').click();
    await page.getByTestId('start-simulation-button').click();
    await expect(page.getByTestId('simulation-banner')).toBeVisible();

    // 7. Perform modifying action (now permitted by simulated write permission)
    const allowedUpdateRes = await page.request.put(`/api/families/${fam.id}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            id: parentId,
            family_id: fam.id,
            first_name: 'MaximilianEdited',
            last_name: 'SimulatedParent',
            emails: [
              {
                value: 'max.simulated@tollhaus-stuttgart.de',
                identifier_email: true,
              },
            ],
          },
        ],
      },
    });
    expect(allowedUpdateRes.ok()).toBeTruthy();

    // 8. Query audit logs: MUST BE LOGGED UNDER REAL USER (developer@example.com)
    const auditRes = await page.request.get('/api/audit-logs', {
      headers: { Authorization: 'Bearer developer@example.com' },
    });
    expect(auditRes.ok()).toBeTruthy();
    const auditLogs = await auditRes.json();
    const updateLog = auditLogs.find((l: any) => l.entity_id === parentId && l.operation === 'UPDATE');
    expect(updateLog).toBeDefined();
    expect(updateLog.changed_by_email).toBe('developer@example.com');

    // 9. Leave simulation
    await page.getByTestId('leave-simulation-button').click();
    await expect(page.getByTestId('simulation-banner')).toHaveCount(0);
  });
});
