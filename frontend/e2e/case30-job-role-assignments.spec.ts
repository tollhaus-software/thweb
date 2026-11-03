import { test, expect } from '@playwright/test';

test.describe('Test Case 30: Job Role Assignments', () => {
  test('verifies job role assignments, visibility restrictions, and effective permissions resolution', async ({
    request,
    page,
  }) => {
    // Step 1: Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // Step 2: Seed users
    // Reader user: jobs.all.read ONLY (cannot view job role assignments)
    const readerUserRes = await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'jobs-reader@example.com',
        roles: [],
        permissions: ['jobs.all.read', 'families.all.read'],
      },
    });
    expect(readerUserRes.ok()).toBeTruthy();

    // Role-Reader user: jobs.all.read + job.role_assignment.read (can read but not edit roles)
    const roleReaderUserRes = await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'jobs-role-reader@example.com',
        roles: [],
        permissions: ['jobs.all.read', 'job.role_assignment.read', 'families.all.read'],
      },
    });
    expect(roleReaderUserRes.ok()).toBeTruthy();

    // Seed Family with parent Bernd Becker
    const familyRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Bernd',
            last_name: 'Becker',
            emails: [{ value: 'bernd.becker@example.com', identifier_email: true, address_list: true }],
            phones: [{ value: '01711122334', address_list: true }],
            address: 'Ahornweg 5, 70173 Stuttgart',
          },
        ],
        children: [
          {
            first_name: 'Mia',
            last_name: 'Becker',
            birth_date: '2021-02-10',
          },
        ],
      },
    });
    expect(familyRes.ok()).toBeTruthy();

    // Seed Bernd Becker as a user with basic parent permissions (no mga or admin roles)
    const berndUserRes = await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'bernd.becker@example.com',
        roles: [],
        permissions: ['families.all.restrictedread'],
      },
    });
    expect(berndUserRes.ok()).toBeTruthy();

    // Bernd initially cannot edit families (does not have families.all.write)
    const initialBerndMe = await request.get('/api/me', {
      headers: { Authorization: 'Bearer bernd.becker@example.com' },
    });
    expect(initialBerndMe.ok()).toBeTruthy();
    const initialBerndData = await initialBerndMe.json();
    expect(initialBerndData.roles || []).not.toContain('mga');
    expect(initialBerndData.roles || []).not.toContain('viewer');
    expect(initialBerndData.effective_permissions || []).not.toContain('families.all.write');

    // =========================================================================
    // Part 1: Verify as Restricted Reader (jobs.all.read ONLY)
    // =========================================================================
    const readerPage = await page.context().newPage();
    await readerPage.addInitScript(() => {
      localStorage.setItem('token', 'jobs-reader@example.com');
    });
    await readerPage.goto('/');

    const readerJobsTabBtn = readerPage.getByRole('button', { name: 'Jobs(MGA)' });
    await expect(readerJobsTabBtn).toBeVisible();
    await readerJobsTabBtn.click();

    // Roles column header must NOT be visible to standard job reader
    await expect(readerPage.locator('th', { hasText: 'Rollen' })).toBeHidden();

    // Verify GET /api/jobs redacts roles
    const readerJobsApi = await request.get('/api/jobs', {
      headers: { Authorization: 'Bearer jobs-reader@example.com' },
    });
    expect(readerJobsApi.ok()).toBeTruthy();
    const readerJobsData = await readerJobsApi.json();
    for (const j of readerJobsData) {
      expect(j.roles || []).toEqual([]);
    }
    await readerPage.close();

    // =========================================================================
    // Part 2: Verify as Job Roles Reader (job.role_assignment.read)
    // =========================================================================
    const roleReaderPage = await page.context().newPage();
    await roleReaderPage.addInitScript(() => {
      localStorage.setItem('token', 'jobs-role-reader@example.com');
    });
    await roleReaderPage.goto('/');

    const roleReaderJobsBtn = roleReaderPage.getByRole('button', { name: 'Jobs(MGA)' });
    await expect(roleReaderJobsBtn).toBeVisible();
    await roleReaderJobsBtn.click();

    // Roles column header IS visible
    await expect(roleReaderPage.locator('th', { hasText: 'Rollen' })).toBeVisible();

    // But pencil buttons to edit roles are NOT visible
    await expect(roleReaderPage.locator('.job-roles-cell-wrapper .cell-edit-pencil-btn')).toBeHidden();
    await roleReaderPage.close();

    // =========================================================================
    // Part 3: Verify Admin (developer@example.com) can configure job roles
    // =========================================================================
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await page.goto('/');

    const adminJobsTabBtn = page.getByRole('button', { name: 'Jobs(MGA)' });
    await expect(adminJobsTabBtn).toBeVisible();
    await adminJobsTabBtn.click();

    // Roles column header is visible for admin
    await expect(page.locator('th', { hasText: 'Rollen' })).toBeVisible();

    // Create a new job with role 'mga' via modal
    await page.locator('.controls-row .add-job-button').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('#job-name').fill('Vorstand MGA');
    await page.locator('#job-desc').fill('Vorstand des Mitgliederausschusses');
    await page.locator('#job-email').fill('mga-vorstand@example.com');

    // Select role mga in the modal
    const mgaCheckbox = page.locator('[data-testid="job-modal-role-checkbox-mga"]');
    await expect(mgaCheckbox).toBeVisible();
    await mgaCheckbox.check();

    // Save job
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('.modal-overlay')).toBeHidden();

    // Locate the newly created row in the jobs table
    const jobRow = page.locator('tr', { hasText: 'Vorstand MGA' });
    await expect(jobRow).toBeVisible();

    // Verify role 'mga' badge is displayed in the row
    const rolesCell = jobRow.locator('.job-roles-cell-wrapper');
    await expect(rolesCell).toContainText('MGA');

    // Edit roles using the inline popover pencil
    const rolesPencil = rolesCell.locator('.cell-edit-pencil-btn');
    await expect(rolesPencil).toBeVisible();
    await rolesPencil.click();

    const rolesPopover = page.locator('.job-roles-popover');
    await expect(rolesPopover).toBeVisible();

    // Filter roles and also check 'viewer'
    const popoverSearch = rolesPopover.locator('[data-testid="job-roles-filter-input"]');
    await popoverSearch.fill('viewer');
    await rolesPopover.locator('[data-testid="job-role-checkbox-viewer"]').check();
    await rolesPopover.locator('[data-testid="job-roles-done-btn"]').click();
    await expect(rolesPopover).toBeHidden();

    // Verify both roles appear in the cell
    await expect(rolesCell).toContainText('MGA');
    await expect(rolesCell).toContainText('Viewer');

    // Assign Bernd Becker to Vorstand MGA job
    const assigneesCell = jobRow.locator('.job-assignees-cell-wrapper');
    const assigneesPencil = assigneesCell.locator('.cell-edit-pencil-btn');
    await assigneesPencil.click();

    const assigneesPopover = page.locator('.job-assignees-popover');
    await expect(assigneesPopover).toBeVisible();
    await assigneesPopover.locator('[data-testid="job-assignees-parents-section"] input[type="checkbox"]').first().check();
    await assigneesPopover.locator('button', { hasText: 'Fertig' }).click();
    await expect(assigneesPopover).toBeHidden();

    await expect(jobRow.locator('.person-badge', { hasText: 'Bernd Becker' })).toBeVisible();

    // Verify contrast of assigned parents and roles in light and dark mode
    const parentBadge = jobRow.locator('.job-parent-badge', { hasText: 'Bernd Becker' });
    const roleBadge = jobRow.locator('.job-role-badge', { hasText: 'MGA' });
    await expect(parentBadge).toBeVisible();
    await expect(roleBadge).toBeVisible();

    // Light mode: dark blue colors as originally designed
    const lightParentColor = await parentBadge.evaluate((el) => window.getComputedStyle(el).color);
    const lightRoleColor = await roleBadge.evaluate((el) => window.getComputedStyle(el).color);
    expect(lightParentColor).toBe('rgb(29, 78, 216)'); // #1d4ed8
    expect(lightRoleColor).toBe('rgb(37, 99, 235)'); // #2563eb

    // Switch to dark mode and verify contrast color
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const darkParentColor = await parentBadge.evaluate((el) => window.getComputedStyle(el).color);
    const darkRoleColor = await roleBadge.evaluate((el) => window.getComputedStyle(el).color);
    expect(darkParentColor).toBe('rgb(147, 197, 253)'); // #93c5fd - high contrast on dark gray
    expect(darkRoleColor).toBe('rgb(147, 197, 253)'); // #93c5fd - high contrast on dark gray

    // Reset back to light mode for subsequent steps
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

    // =========================================================================
    // Part 4: Verify Bernd Becker receives effective roles & permissions from job
    // =========================================================================
    const berndMeRes = await request.get('/api/me', {
      headers: { Authorization: 'Bearer bernd.becker@example.com' },
    });
    expect(berndMeRes.ok()).toBeTruthy();
    const berndMeData = await berndMeRes.json();
    expect(berndMeData.roles).toContain('mga');
    expect(berndMeData.roles).toContain('viewer');
    // Role 'mga' grants families.all.write and vaccination.status.manage
    expect(berndMeData.effective_permissions).toContain('families.all.write');

    // Verify Bernd can access UI and has MGA write privileges (e.g. Familie hinzufügen button)
    const berndPage = await page.context().newPage();
    await berndPage.addInitScript(() => {
      localStorage.setItem('token', 'bernd.becker@example.com');
    });
    await berndPage.goto('/');

    const addFamilyBtn = berndPage.getByRole('button', { name: 'Familie hinzufügen' });
    await expect(addFamilyBtn).toBeVisible();
    await berndPage.close();

    // =========================================================================
    // Part 5: Verify Revocation removes effective roles and permissions
    // =========================================================================
    // Remove Bernd Becker from Vorstand MGA job
    await assigneesPencil.click();
    await expect(assigneesPopover).toBeVisible();
    await assigneesPopover.locator('[data-testid="job-assignees-parents-section"] input[type="checkbox"]').first().uncheck();
    await assigneesPopover.locator('button', { hasText: 'Fertig' }).click();
    await expect(assigneesPopover).toBeHidden();
    await expect(jobRow.locator('.person-badge', { hasText: 'Bernd Becker' })).toBeHidden();

    // Verify Bernd's /api/me no longer has 'mga' or 'viewer'
    const berndRevokedRes = await request.get('/api/me', {
      headers: { Authorization: 'Bearer bernd.becker@example.com' },
    });
    expect(berndRevokedRes.ok()).toBeTruthy();
    const berndRevokedData = await berndRevokedRes.json();
    expect(berndRevokedData.roles).not.toContain('mga');
    expect(berndRevokedData.roles).not.toContain('viewer');
    expect(berndRevokedData.effective_permissions).not.toContain('families.all.write');

    // Verify Bernd's UI also loses Familie hinzufügen button
    const berndRevokedPage = await page.context().newPage();
    await berndRevokedPage.addInitScript(() => {
      localStorage.setItem('token', 'bernd.becker@example.com');
    });
    await berndRevokedPage.goto('/');
    await expect(berndRevokedPage.getByRole('button', { name: 'Familie hinzufügen' })).toBeHidden();
    await berndRevokedPage.close();
  });
});
