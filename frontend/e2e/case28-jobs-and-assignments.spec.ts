import { test, expect } from '@playwright/test';

test.describe('Test Case 28: Jobs and Assignments (MGA)', () => {
  test('verifies jobs CRUD, parent/employee assignments, familiesOverview hammer icons, and delete protection', async ({
    request,
    page,
  }) => {
    // Step 1: Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // Step 2: Seed a user with jobs.all.read ONLY
    const readerUserRes = await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'jobs-reader@example.com',
        roles: [],
        permissions: ['jobs.all.read', 'families.all.read', 'employees.all.read'],
      },
    });
    expect(readerUserRes.ok()).toBeTruthy();

    // Step 3: Seed families with parents using admin
    const familyRes = await request.post('/api/families', {
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
    expect(familyRes.ok()).toBeTruthy();

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

    // Step 4: Seed an employee using admin
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

    // =========================================================================
    // Part 1: Verify as Restricted User (viewer@example.com - no jobs permissions)
    // =========================================================================
    const unauthorizedPage = await page.context().newPage();
    await unauthorizedPage.addInitScript(() => {
      localStorage.setItem('token', 'viewer@example.com');
    });
    await unauthorizedPage.goto('/');
    // Check that 'Jobs' tab button is NOT visible
    await expect(unauthorizedPage.getByRole('button', { name: 'Jobs(MGA)' })).toBeHidden();
    await unauthorizedPage.close();

    // =========================================================================
    // Part 2: Verify as Reader User (jobs.all.read ONLY)
    // =========================================================================
    const readerPage = await page.context().newPage();
    await readerPage.addInitScript(() => {
      localStorage.setItem('token', 'jobs-reader@example.com');
    });
    await readerPage.goto('/');

    // Jobs tab button should be visible in MGA section
    const readerJobsTabBtn = readerPage.getByRole('button', { name: 'Jobs(MGA)' });
    await expect(readerJobsTabBtn).toBeVisible();
    await readerJobsTabBtn.click();

    // Reader should NOT see the '+ Job' button
    await expect(readerPage.locator('.controls-row .add-job-button')).toBeHidden();
    await readerPage.close();

    // =========================================================================
    // Part 3: Verify as Admin (developer@example.com - full permissions)
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

    // Verify search input in controls-row has "Jobs suchen..." placeholder
    const searchInput = page.locator('.controls-row .search-input');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('placeholder', 'Jobs suchen...');

    // Verify Add Job button is visible with exactly one '+' (SVG plus and 'Job' text)
    const addJobBtn = page.locator('.controls-row .add-job-button');
    await expect(addJobBtn).toBeVisible();
    await expect(addJobBtn).toHaveText('Job');
    await expect(addJobBtn.locator('svg')).toBeVisible();

    // 1. Create Job 1: "Hygiene"
    await addJobBtn.click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('#job-name').fill('Hygiene');
    await page.locator('#job-desc').fill('Hygienemanagement und Belehrungen');
    await page.locator('#job-email').fill('hygiene@example.com');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('.modal-overlay')).toBeHidden();

    // Verify Hygiene appears in table
    const hygieneRow = page.locator('tr', { hasText: 'Hygiene' });
    await expect(hygieneRow).toBeVisible();
    await expect(hygieneRow.locator('td', { hasText: 'Hygienemanagement und Belehrungen' })).toBeVisible();
    await expect(hygieneRow.locator('td', { hasText: 'hygiene@example.com' })).toBeVisible();

    // In-Table inline editing test: edit description and email in the table
    const descCell = hygieneRow.locator('td').nth(1);
    await descCell.locator('.easy-edit-button').click();
    await descCell.locator('.easy-edit-input').fill('In-Table Hygiene Tasks');
    await descCell.locator('.easy-edit-input').press('Enter');
    await expect(descCell).toContainText('In-Table Hygiene Tasks');

    const emailCell = hygieneRow.locator('td').nth(2);
    await emailCell.locator('.easy-edit-button').click();
    await emailCell.locator('.easy-edit-input').fill('hygiene@example.com');
    await emailCell.locator('.easy-edit-input').press('Enter');
    await expect(emailCell).toContainText('hygiene@example.com');

    // 2. Create Job 2: "Garten"
    await addJobBtn.click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('#job-name').fill('Garten');
    await page.locator('#job-desc').fill('Garten- und Spielplatzpflege');
    await page.locator('#job-email').fill('garten@example.com');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('.modal-overlay')).toBeHidden();

    // Verify Garten appears in table
    const gartenRow = page.locator('tr', { hasText: 'Garten' });
    await expect(gartenRow).toBeVisible();

    // 3. Edit Job 2: Garten -> Update description via modal edit button
    await gartenRow.locator('button[title="Job bearbeiten"]').click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('#job-desc').fill('Pflege der Außenanlagen und Spielgeräte');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('.modal-overlay')).toBeHidden();
    await expect(page.locator('tr', { hasText: 'Garten' }).locator('td', { hasText: 'Pflege der Außenanlagen und Spielgeräte' })).toBeVisible();

    // 3b. Test assigning to a newly created job with 0 assignees directly from #jobs
    await addJobBtn.click();
    await page.locator('#job-name').fill('Finanzen');
    await page.getByRole('button', { name: 'Speichern' }).click();
    const finanzenRow = page.locator('tr', { hasText: 'Finanzen' });
    await expect(finanzenRow).toBeVisible();

    // Verify assigned persons displays "-" and a pencil button
    const finanzenAssigneesCell = finanzenRow.locator('.job-assignees-cell-wrapper');
    await expect(finanzenAssigneesCell).toContainText('-');
    const finanzenPencil = finanzenAssigneesCell.locator('.cell-edit-pencil-btn');
    await expect(finanzenPencil).toBeVisible();

    // Open popover, assign Sabine Koch, and verify badge appears
    await finanzenPencil.click();
    const finanzenPopover = page.locator('.job-assignees-popover');
    await expect(finanzenPopover).toBeVisible();
    await finanzenPopover.locator('[data-testid="job-assignees-employees-section"] input[type="checkbox"]').first().check();
    await finanzenPopover.locator('button', { hasText: 'Fertig' }).click();
    await expect(finanzenPopover).toBeHidden();
    await expect(finanzenRow.locator('.person-badge', { hasText: 'Sabine Koch' })).toBeVisible();

    // Clean up Finanzen: remove Sabine Koch and delete job
    await finanzenPencil.click();
    await expect(finanzenPopover).toBeVisible();
    await finanzenPopover.locator('[data-testid="job-assignees-employees-section"] input[type="checkbox"]').first().uncheck();
    await finanzenPopover.locator('button', { hasText: 'Fertig' }).click();
    await expect(finanzenPopover).toBeHidden();
    await expect(finanzenRow.locator('.person-badge', { hasText: 'Sabine Koch' })).toBeHidden();

    const finanzenDeleteBtn = finanzenRow.locator('button[aria-label="Job löschen Finanzen"]');
    await expect(finanzenDeleteBtn).toBeEnabled();
    await finanzenDeleteBtn.click();
    await page.locator('.modal-overlay #confirm-delete-name-input').fill('Finanzen');
    await page.locator('.modal-overlay').getByRole('button', { name: 'Löschen' }).click();
    await expect(page.locator('tr', { hasText: 'Finanzen' })).toBeHidden();

    // =========================================================================
    // Part 4: Assign Jobs to Parent in Eltern(MGA)
    // =========================================================================
    const parentsTabBtn = page.getByRole('button', { name: 'Eltern(MGA)' });
    await expect(parentsTabBtn).toBeVisible();
    await parentsTabBtn.click();

    const parentRow = page.locator('tr', { hasText: 'Anna' }).filter({ hasText: 'Schmidt' });
    await expect(parentRow).toBeVisible();

    // Click jobs cell in Anna Schmidt's row
    const parentJobsCell = parentRow.locator('.jobs-cell-wrapper');
    await expect(parentJobsCell).toBeVisible();
    await parentJobsCell.click();

    // JobsPopover opens
    const jobsPopover = page.locator('.jobs-popover');
    await expect(jobsPopover).toBeVisible();

    // Select "Hygiene" and click "Zuordnen"
    await jobsPopover.locator('select').selectOption({ label: 'Hygiene' });
    await jobsPopover.getByRole('button', { name: 'Zuordnen' }).click();

    // Also select "Garten" and click "Zuordnen"
    await jobsPopover.locator('select').selectOption({ label: 'Garten' });
    await jobsPopover.getByRole('button', { name: 'Zuordnen' }).click();

    // Close the popover
    await jobsPopover.locator('button[title="Schließen"]').click();
    await expect(jobsPopover).toBeHidden();

    // Verify both jobs appear in Anna Schmidt's cell as stacked rows (not chips)
    await expect(parentRow.locator('.job-item-row', { hasText: 'Hygiene' })).toBeVisible();
    await expect(parentRow.locator('.job-item-row', { hasText: 'Garten' })).toBeVisible();
    await expect(parentRow.locator('.job-item-row')).toHaveCount(2);

    // Verify pencil button has standard .cell-edit-pencil-btn class with size 13
    const parentJobPencil = parentJobsCell.locator('.cell-edit-pencil-btn');
    await expect(parentJobPencil).toBeVisible();
    await expect(parentJobPencil.locator('svg')).toHaveAttribute('width', '13');

    // =========================================================================
    // Part 5: Assign Job to Employee in Mitarbeitende(PA)
    // =========================================================================
    const paSidebarBtn = page.getByRole('button', { name: 'PA', exact: true });
    await expect(paSidebarBtn).toBeVisible();
    await paSidebarBtn.click();

    const employeeRow = page.locator('tr', { hasText: 'Sabine' }).filter({ hasText: 'Koch' });
    await expect(employeeRow).toBeVisible();

    // Click jobs cell in Sabine Koch's row
    const empJobsCell = employeeRow.locator('.jobs-cell-wrapper');
    await expect(empJobsCell).toBeVisible();
    await empJobsCell.click();

    await expect(jobsPopover).toBeVisible();
    // Select "Hygiene" and click "Zuordnen"
    await jobsPopover.locator('select').selectOption({ label: 'Hygiene' });
    await jobsPopover.getByRole('button', { name: 'Zuordnen' }).click();
    await jobsPopover.locator('button[title="Schließen"]').click();
    await expect(jobsPopover).toBeHidden();

    // Verify badge appears in Sabine Koch's row with standard edit button
    await expect(employeeRow.locator('.job-item-row', { hasText: 'Hygiene' })).toBeVisible();
    const empJobPencil = empJobsCell.locator('.cell-edit-pencil-btn');
    await expect(empJobPencil).toBeVisible();
    await expect(empJobPencil.locator('svg')).toHaveAttribute('width', '13');

    // =========================================================================
    // Part 6: Check Jobs Tab for Associated Persons and Delete Lock
    // =========================================================================
    await mgaSidebarBtn.click();
    await jobsTabBtn.click();

    // Check Hygiene row: should list Anna Schmidt and Sabine Koch WITHOUT "Elternteil:" or "Erzieher(in):" prefixes
    const hygieneRowUpdated = page.locator('tr', { hasText: 'Hygiene' });
    const annaBadge = hygieneRowUpdated.locator('.person-badge', { hasText: 'Anna Schmidt' });
    await expect(annaBadge).toBeVisible();
    await expect(annaBadge).not.toContainText('Elternteil:');

    const sabineBadge = hygieneRowUpdated.locator('.person-badge', { hasText: 'Sabine Koch' });
    await expect(sabineBadge).toBeVisible();
    await expect(sabineBadge).not.toContainText('Erzieher');
    await expect(sabineBadge).not.toContainText('Koch:');

    // Check Garten row: should list Anna Schmidt without prefix
    const gartenRowUpdated = page.locator('tr', { hasText: 'Garten' });
    const annaGartenBadge = gartenRowUpdated.locator('.person-badge', { hasText: 'Anna Schmidt' });
    await expect(annaGartenBadge).toBeVisible();
    await expect(annaGartenBadge).not.toContainText('Elternteil:');

    // Verify delete button is disabled for Hygiene (has assignees)
    const hygieneDeleteBtn = hygieneRowUpdated.locator('button[aria-label="Job löschen Hygiene"]');
    await expect(hygieneDeleteBtn).toBeDisabled();

    // Verify delete button is disabled for Garten (has assignees)
    const gartenDeleteBtn = gartenRowUpdated.locator('button[aria-label="Job löschen Garten"]');
    await expect(gartenDeleteBtn).toBeDisabled();

    // =========================================================================
    // Part 6b: Edit Job Assignees directly in #jobs via the edit icon (pencil)
    // =========================================================================
    const hygieneAssigneesCell = hygieneRowUpdated.locator('.job-assignees-cell-wrapper');
    await expect(hygieneAssigneesCell).toBeVisible();

    // Pencil button in assigned persons cell
    const hygienePencilBtn = hygieneAssigneesCell.locator('.cell-edit-pencil-btn');
    await expect(hygienePencilBtn).toBeVisible();
    await expect(hygienePencilBtn.locator('svg')).toHaveAttribute('width', '13');

    // Click the pencil button to open the large popover
    await hygienePencilBtn.click();

    // Verify large popover and backdrop appear
    const assigneesPopover = page.locator('.job-assignees-popover');
    await expect(assigneesPopover).toBeVisible();
    await expect(page.locator('.large-popover-desktop-backdrop')).toBeVisible();

    // Verify title mentions job name
    await expect(assigneesPopover.locator('.large-popover-title')).toContainText('Hygiene');

    // Verify Quick Filter textbox is present
    const quickFilterInput = assigneesPopover.locator('input[placeholder="Schnellfilter..."]');
    await expect(quickFilterInput).toBeVisible();

    // Verify parents section first, employees section second
    const parentsSection = assigneesPopover.locator('[data-testid="job-assignees-parents-section"]');
    const employeesSection = assigneesPopover.locator('[data-testid="job-assignees-employees-section"]');
    await expect(parentsSection).toBeVisible();
    await expect(employeesSection).toBeVisible();

    // Verify parents are sorted by family alphabetically (Familie Becker before Familie Schmidt)
    // and presented one person per line
    const parentLabels = parentsSection.locator('.job-assignee-label');
    await expect(parentLabels).toHaveCount(2);
    await expect(parentLabels.nth(0)).toContainText('Bernd Becker');
    await expect(parentLabels.nth(0)).toContainText('Familie Becker');
    await expect(parentLabels.nth(1)).toContainText('Anna Schmidt');
    await expect(parentLabels.nth(1)).toContainText('Familie Schmidt');

    // Anna Schmidt and Sabine Koch checkboxes should be checked; Bernd Becker unchecked
    const berndCheckbox = parentsSection.locator('input[type="checkbox"]').nth(0);
    await expect(berndCheckbox).not.toBeChecked();
    const annaCheckbox = parentsSection.locator('input[type="checkbox"]').nth(1);
    await expect(annaCheckbox).toBeChecked();
    const sabineCheckbox = employeesSection.locator('input[type="checkbox"]').first();
    await expect(sabineCheckbox).toBeChecked();

    // Test Quick Filter filtering by family name
    await quickFilterInput.fill('Becker');
    await expect(parentsSection.locator('.job-assignee-name', { hasText: 'Bernd Becker' })).toBeVisible();
    await expect(parentsSection.locator('.job-assignee-name', { hasText: 'Anna Schmidt' })).toBeHidden();

    // Test Quick Filter filtering by employee name
    await quickFilterInput.fill('Sabine');
    // Parents should be filtered out
    await expect(parentsSection).toContainText('Keine passenden Personen');
    // Sabine Koch should still be visible
    await expect(employeesSection.locator('.job-assignee-name', { hasText: 'Sabine Koch' })).toBeVisible();

    // Clear filter
    await quickFilterInput.fill('');
    await expect(parentsSection.locator('.job-assignee-name', { hasText: 'Bernd Becker' })).toBeVisible();
    await expect(parentsSection.locator('.job-assignee-name', { hasText: 'Anna Schmidt' })).toBeVisible();

    // Disassociate Sabine Koch from Hygiene by unchecking
    await sabineCheckbox.uncheck();
    await expect(sabineCheckbox).not.toBeChecked();

    // Close the popover via Fertig button
    await assigneesPopover.locator('button', { hasText: 'Fertig' }).click();
    await expect(assigneesPopover).toBeHidden();

    // Verify Hygiene row in #jobs now only has Anna Schmidt (Sabine Koch removed)
    await expect(hygieneRowUpdated.locator('.person-badge', { hasText: 'Anna Schmidt' })).toBeVisible();
    await expect(hygieneRowUpdated.locator('.person-badge', { hasText: 'Sabine Koch' })).toBeHidden();

    // Re-associate Sabine Koch to Hygiene via the popover again
    await hygienePencilBtn.click();
    await expect(assigneesPopover).toBeVisible();
    const sabineCheckboxAgain = assigneesPopover.locator('[data-testid="job-assignees-employees-section"] input[type="checkbox"]').first();
    await expect(sabineCheckboxAgain).not.toBeChecked();
    await sabineCheckboxAgain.check();
    await expect(sabineCheckboxAgain).toBeChecked();

    // Close via 'X' close button
    await assigneesPopover.locator('button[title="Schließen"]').click();
    await expect(assigneesPopover).toBeHidden();

    // Verify Sabine Koch is associated again
    await expect(hygieneRowUpdated.locator('.person-badge', { hasText: 'Sabine Koch' })).toBeVisible();

    // =========================================================================
    // Part 7: Check familiesOverview: Hammer icon and multiple rows
    // =========================================================================
    const overviewTabBtn = page.getByRole('button', { name: 'Familien', exact: true });
    await expect(overviewTabBtn).toBeVisible();
    await overviewTabBtn.click();

    // In Overview table, find Anna Schmidt's parent row
    const overviewAnnaRow = page.locator('.overview-table tr', { hasText: 'Anna Schmidt' });
    await expect(overviewAnnaRow).toBeVisible();

    // Verify hammer icons appear for Anna Schmidt's jobs
    const hammerSymbols = overviewAnnaRow.locator('.job-type-symbol', { hasText: '🔨' });
    await expect(hammerSymbols).toHaveCount(2);

    // Verify the cell contains both job names
    const jobsCell = overviewAnnaRow.locator('td').nth(4);
    await expect(jobsCell).toContainText('Hygiene');
    await expect(jobsCell).toContainText('Garten');

    // =========================================================================
    // Part 8: Unassign Job and Delete Job
    // =========================================================================
    // Go to Eltern tab to remove "Garten" from Anna Schmidt
    await mgaSidebarBtn.click();
    await parentsTabBtn.click();
    const parentRow2 = page.locator('tr', { hasText: 'Anna' }).filter({ hasText: 'Schmidt' });
    await parentRow2.locator('.jobs-cell-wrapper').click();

    await expect(jobsPopover).toBeVisible();
    // Remove "Garten"
    const removeGartenBtn = jobsPopover.getByRole('button', { name: 'Garten entfernen' });
    await removeGartenBtn.click();
    await jobsPopover.locator('button[title="Schließen"]').click();
    await expect(jobsPopover).toBeHidden();

    // Verify Garten badge is gone from Anna Schmidt
    await expect(parentRow2.locator('.job-badge', { hasText: 'Garten' })).toBeHidden();

    // Return to Jobs tab: Garten should now have 0 assignees and delete button enabled
    await jobsTabBtn.click();
    const gartenRowAfterUnassign = page.locator('tr', { hasText: 'Garten' });
    const gartenDeleteBtnAfter = gartenRowAfterUnassign.locator('button[aria-label="Job löschen Garten"]');
    await expect(gartenDeleteBtnAfter).toBeEnabled();

    // Delete Garten
    await gartenDeleteBtnAfter.click();
    // Confirm delete modal appears
    const confirmModal = page.locator('.modal-overlay');
    await expect(confirmModal).toBeVisible();
    await confirmModal.locator('#confirm-delete-name-input').fill('Garten');
    await confirmModal.getByRole('button', { name: 'Löschen' }).click();
    await expect(confirmModal).toBeHidden();

    // Garten should be gone from the jobs table
    await expect(page.locator('tr', { hasText: 'Garten' })).toBeHidden();

    // Hygiene remains
    await expect(page.locator('tr', { hasText: 'Hygiene' })).toBeVisible();
  });
});
