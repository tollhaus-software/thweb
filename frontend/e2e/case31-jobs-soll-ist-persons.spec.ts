import { test, expect } from '@playwright/test';

test.describe('Test Case 31: Jobs Soll/Ist Personen and Difference Coloring', () => {
  test('verifies configuring Soll Personen, displaying Ist Personen with signed difference and colored background', async ({
    request,
    page,
  }) => {
    // Step 1: Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // Step 2: Seed reader user with jobs.all.read
    const readerUserRes = await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'jobs-reader@example.com',
        roles: [],
        permissions: ['jobs.all.read', 'families.all.read', 'employees.all.read'],
      },
    });
    expect(readerUserRes.ok()).toBeTruthy();

    // Step 3: Seed 2 parents and 1 employee
    const familyRes1 = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Anna',
            last_name: 'Schmidt',
            emails: [{ value: 'anna.schmidt@example.com', identifier_email: true, address_list: true }],
            phones: [{ value: '01719876543', address_list: true }],
            address: 'Blumenstraße 10, 70173 Stuttgart',
          },
        ],
        children: [
          {
            first_name: 'Lukas',
            last_name: 'Schmidt',
            birth_date: '2020-04-12',
          },
        ],
      },
    });
    expect(familyRes1.ok()).toBeTruthy();

    const familyRes2 = await request.post('/api/families', {
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
    expect(familyRes2.ok()).toBeTruthy();

    const empRes = await request.post('/api/employees', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        first_name: 'Sabine',
        last_name: 'Koch',
        employee_type: 'cook',
        emails: [{ value: 'sabine.koch@example.com', identifier_email: false, address_list: true }],
        phones: [{ value: '01511234567', address_list: true }],
        address: 'Kuchenweg 12, 70173 Stuttgart',
      },
    });
    expect(empRes.ok()).toBeTruthy();

    // Step 4: Create a job via API with soll_persons = 2
    const jobRes = await request.post('/api/jobs', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        name: 'Gartenpflege',
        description: 'Pflege des Außengeländes',
        contact_email: 'garten@example.com',
        soll_persons: 2,
      },
    });
    expect(jobRes.ok()).toBeTruthy();
    const createdJob = await jobRes.json();
    expect(createdJob.soll_persons).toBe(2);

    // =========================================================================
    // Part 1: Verify as Reader User (read-only view)
    // =========================================================================
    const readerPage = await page.context().newPage();
    await readerPage.addInitScript(() => {
      localStorage.setItem('token', 'jobs-reader@example.com');
    });
    await readerPage.goto('/');

    const readerMgaBtn = readerPage.getByRole('button', { name: 'MGA', exact: true });
    if (await readerMgaBtn.isVisible()) {
      await readerMgaBtn.click();
    }
    const readerJobsTabBtn = readerPage.getByRole('button', { name: 'Jobs(MGA)' });
    await expect(readerJobsTabBtn).toBeVisible();
    await readerJobsTabBtn.click();

    // Column headers should be visible
    await expect(readerPage.getByRole('columnheader', { name: 'Soll Personen' })).toBeVisible();
    await expect(readerPage.getByRole('columnheader', { name: 'Ist Personen' })).toBeVisible();

    const readerRow = readerPage.locator('tr', { hasText: 'Gartenpflege' });
    await expect(readerRow).toBeVisible();
    // Reader sees Soll Personen value 2 without pencil edit button
    await expect(readerRow.getByTestId(`job-soll-persons-${createdJob.id}`)).toHaveText('2');
    await expect(readerRow.locator('.cell-edit-pencil-btn')).toBeHidden();

    // Ist count is 0, difference is 0 - 2 = -2
    await expect(readerRow.getByTestId(`job-ist-count-${createdJob.id}`)).toHaveText('0');
    const readerDiffBadge = readerRow.getByTestId(`job-diff-badge-${createdJob.id}`);
    await expect(readerDiffBadge).toHaveText('( -2 )');
    await expect(readerDiffBadge).toHaveClass(/job-diff-negative/);

    await readerPage.close();

    // =========================================================================
    // Part 2: Verify as Admin (interactive editing & color changes)
    // =========================================================================
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await page.goto('/');

    // Navigate to MGA -> Jobs tab
    const mgaSidebarBtn = page.getByRole('button', { name: 'MGA', exact: true });
    await expect(mgaSidebarBtn).toBeVisible();
    await mgaSidebarBtn.click();

    const jobsTabBtn = page.getByRole('button', { name: 'Jobs(MGA)' });
    await expect(jobsTabBtn).toBeVisible();
    await jobsTabBtn.click();

    // Verify row
    const jobRow = page.locator('tr', { hasText: 'Gartenpflege' });
    await expect(jobRow).toBeVisible();

    // 1. Initial State: Soll=2, Ist=0 => Diff = -2 (negative -> red-ish background)
    await expect(jobRow.getByTestId(`job-soll-persons-${createdJob.id}`)).toHaveText('2');
    await expect(jobRow.getByTestId(`job-ist-count-${createdJob.id}`)).toHaveText('0');
    const diffBadge = jobRow.getByTestId(`job-diff-badge-${createdJob.id}`);
    await expect(diffBadge).toHaveText('( -2 )');
    await expect(diffBadge).toHaveClass(/job-diff-negative/);

    // 2. Assign 1 Person: Bernd Becker => Ist=1, Diff = -1 (negative -> red-ish background)
    await jobRow.getByTestId(`edit-job-assignees-btn-${createdJob.id}`).click();
    const assigneesPopup = page.locator('.glass-popup');
    await expect(assigneesPopup).toBeVisible();
    await assigneesPopup.getByText('Bernd Becker').click();
    await assigneesPopup.getByTestId('job-assignees-done-btn').click();
    await expect(assigneesPopup).toBeHidden();

    await expect(jobRow.getByTestId(`job-ist-count-${createdJob.id}`)).toHaveText('1');
    await expect(diffBadge).toHaveText('( -1 )');
    await expect(diffBadge).toHaveClass(/job-diff-negative/);

    // 3. Assign 2nd Person: Anna Schmidt => Ist=2, Diff = 0 (zero -> green-ish background)
    await jobRow.getByTestId(`edit-job-assignees-btn-${createdJob.id}`).click();
    await expect(assigneesPopup).toBeVisible();
    await assigneesPopup.getByText('Anna Schmidt').click();
    await assigneesPopup.getByTestId('job-assignees-done-btn').click();
    await expect(assigneesPopup).toBeHidden();

    await expect(jobRow.getByTestId(`job-ist-count-${createdJob.id}`)).toHaveText('2');
    await expect(diffBadge).toHaveText('( 0 )');
    await expect(diffBadge).toHaveClass(/job-diff-zero/);

    // 4. Assign 3rd Person: Sabine Koch (Employee) => Ist=3, Diff = +1 (positive -> yellow-ish background)
    await jobRow.getByTestId(`edit-job-assignees-btn-${createdJob.id}`).click();
    await expect(assigneesPopup).toBeVisible();
    await assigneesPopup.getByText('Sabine Koch').click();
    await assigneesPopup.getByTestId('job-assignees-done-btn').click();
    await expect(assigneesPopup).toBeHidden();

    await expect(jobRow.getByTestId(`job-ist-count-${createdJob.id}`)).toHaveText('3');
    await expect(diffBadge).toHaveText('( +1 )');
    await expect(diffBadge).toHaveClass(/job-diff-positive/);

    // 5. In-Column Configuration: Edit Soll Personen directly in the column to 4
    const sollCell = jobRow.locator('td').nth(3);
    const sollEditBtn = sollCell.locator('.easy-edit-button');
    await expect(sollEditBtn).toBeVisible();
    await sollEditBtn.click();

    // Fill new target number 4
    const sollInput = sollCell.locator('.easy-edit-input');
    await expect(sollInput).toBeVisible();
    await sollInput.fill('4');
    await sollInput.press('Enter');

    // Verify updated: Soll=4, Ist=3 => Diff = -1 (negative -> red-ish background)
    await expect(jobRow.getByTestId(`job-soll-persons-${createdJob.id}`)).toHaveText('4');
    await expect(jobRow.getByTestId(`job-ist-count-${createdJob.id}`)).toHaveText('3');
    await expect(diffBadge).toHaveText('( -1 )');
    await expect(diffBadge).toHaveClass(/job-diff-negative/);

    // 6. Reload page to verify persistence in database
    await page.reload();
    await expect(page.locator('tr', { hasText: 'Gartenpflege' })).toBeVisible();
    const reloadedRow = page.locator('tr', { hasText: 'Gartenpflege' });
    await expect(reloadedRow.getByTestId(`job-soll-persons-${createdJob.id}`)).toHaveText('4');
    await expect(reloadedRow.getByTestId(`job-ist-count-${createdJob.id}`)).toHaveText('3');
    const reloadedDiffBadge = reloadedRow.getByTestId(`job-diff-badge-${createdJob.id}`);
    await expect(reloadedDiffBadge).toHaveText('( -1 )');
    await expect(reloadedDiffBadge).toHaveClass(/job-diff-negative/);

    // 7. Test Add Job Modal with Soll Personen
    const addJobBtn = page.locator('.controls-row .add-job-button');
    await expect(addJobBtn).toBeVisible();
    await addJobBtn.click();
    await expect(page.locator('.modal-overlay')).toBeVisible();

    await page.locator('#job-name').fill('Festkomitee');
    await page.locator('#job-desc').fill('Organisation von Sommerfest und Feiern');
    await page.locator('#job-email').fill('fest@tollhaus.de');
    await page.locator('#job-soll-persons').fill('3');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('.modal-overlay')).toBeHidden();

    // Verify Festkomitee appears with Soll=3, Ist=0, Diff = -3 (red-ish)
    const festRow = page.locator('tr', { hasText: 'Festkomitee' });
    await expect(festRow).toBeVisible();
    await expect(festRow.locator('td').nth(3)).toContainText('3');
    await expect(festRow.locator('td').nth(4)).toContainText('0');
    await expect(festRow.locator('.job-diff-badge')).toHaveText('( -3 )');
    await expect(festRow.locator('.job-diff-badge')).toHaveClass(/job-diff-negative/);

    // 8. Verify Historie tab shows concrete changes for Soll Personen update (2 → 4)
    const auditTabBtn = page.getByRole('button', { name: 'Historie' });
    await expect(auditTabBtn).toBeVisible();
    await auditTabBtn.click();

    // The audit table should contain a row for Job Gartenpflege with concrete change "Soll Personen: 2 → 4"
    const auditRow = page.locator('tr', { hasText: 'Gartenpflege' }).first();
    await expect(auditRow).toBeVisible();
    await expect(auditRow).toContainText('Soll Personen: 2 → 4');
  });
});
