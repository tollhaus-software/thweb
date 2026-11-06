import { test, expect } from '@playwright/test';

test.describe('Test Case 37: familiesOverview Jobs Grouping and Button Renaming', () => {
  test('verifies "Familien", "Gruppen", "Jobs" buttons, jobs grouping, multi-job assignment, and "Aktuell kein Tollhaus Job" section', async ({
    request,
    page,
  }) => {
    // Step 1: Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const authHeader = { Authorization: 'Bearer developer@example.com' };

    // Step 2: Create 2 jobs: "Hygiene" and "Garten"
    const gartenRes = await request.post('/api/jobs', {
      headers: authHeader,
      data: {
        name: 'Garten',
        description: 'Garten- und Außenbereichspflege',
      },
    });
    expect(gartenRes.ok()).toBeTruthy();
    const gartenJob = await gartenRes.json();

    const hygieneRes = await request.post('/api/jobs', {
      headers: authHeader,
      data: {
        name: 'Hygiene',
        description: 'Hygienemanagement und Belehrungen',
      },
    });
    expect(hygieneRes.ok()).toBeTruthy();
    const hygieneJob = await hygieneRes.json();

    // Step 3: Seed Family 1: Anna & Hans Schmidt (Child: Lukas, active in group 1)
    const fam1Res = await request.post('/api/families', {
      headers: authHeader,
      data: {
        parents: [
          {
            first_name: 'Anna',
            last_name: 'Schmidt',
            emails: [{ value: 'anna.schmidt@example.com', identifier_email: true, address_list: true }],
            phones: [{ value: '01711111111', address_list: true }],
            address: 'Rosenweg 1, 70173 Stuttgart',
          },
          {
            first_name: 'Hans',
            last_name: 'Schmidt',
            emails: [{ value: 'hans.schmidt@example.com', identifier_email: true, address_list: true }],
            phones: [{ value: '01722222222', address_list: true }],
            address: 'Rosenweg 1, 70173 Stuttgart',
          },
        ],
      },
    });
    expect(fam1Res.ok()).toBeTruthy();
    const fam1 = await fam1Res.json();
    const anna = fam1.parents.find((p: any) => p.first_name === 'Anna');
    const hans = fam1.parents.find((p: any) => p.first_name === 'Hans');

    // Add child Lukas to Family 1
    const lukasId = crypto.randomUUID();
    const lukasRes = await request.post(`/api/families/${fam1.id}/children`, {
      headers: authHeader,
      data: {
        id: lukasId,
        family_id: fam1.id,
        first_name: 'Lukas',
        last_name: 'Schmidt',
        birth_date: '2020-05-10',
      },
    });
    expect(lukasRes.ok()).toBeTruthy();

    // Enrol Lukas into group 1
    await request.post(`/api/children/${lukasId}/group_changes`, {
      headers: authHeader,
      data: { child_id: lukasId, change_date: '2024-01-01', target_group: 1 },
    });

    // Assign jobs to Anna (both Garten & Hygiene)
    const setAnnaJobs = await request.put(`/api/parents/${anna.id}/jobs`, {
      headers: authHeader,
      data: { job_ids: [gartenJob.id, hygieneJob.id] },
    });
    expect(setAnnaJobs.ok()).toBeTruthy();

    // Assign jobs to Hans (Garten only)
    const setHansJobs = await request.put(`/api/parents/${hans.id}/jobs`, {
      headers: authHeader,
      data: { job_ids: [gartenJob.id] },
    });
    expect(setHansJobs.ok()).toBeTruthy();

    // Step 4: Seed Family 2: Bernd & Clara Becker (Child: Mia, active in group 2) - neither has jobs
    const fam2Res = await request.post('/api/families', {
      headers: authHeader,
      data: {
        parents: [
          {
            first_name: 'Bernd',
            last_name: 'Becker',
            emails: [{ value: 'bernd.becker@example.com', identifier_email: true, address_list: true }],
            phones: [{ value: '01733333333', address_list: true }],
            address: 'Tulpenweg 2, 70173 Stuttgart',
          },
          {
            first_name: 'Clara',
            last_name: 'Becker',
            emails: [{ value: 'clara.becker@example.com', identifier_email: true, address_list: true }],
            phones: [{ value: '01744444444', address_list: true }],
            address: 'Tulpenweg 2, 70173 Stuttgart',
          },
        ],
      },
    });
    expect(fam2Res.ok()).toBeTruthy();
    const fam2 = await fam2Res.json();

    // Add child Mia to Family 2
    const miaId = crypto.randomUUID();
    const miaRes = await request.post(`/api/families/${fam2.id}/children`, {
      headers: authHeader,
      data: {
        id: miaId,
        family_id: fam2.id,
        first_name: 'Mia',
        last_name: 'Becker',
        birth_date: '2021-03-15',
      },
    });
    expect(miaRes.ok()).toBeTruthy();

    // Enrol Mia into group 2
    await request.post(`/api/children/${miaId}/group_changes`, {
      headers: authHeader,
      data: { child_id: miaId, change_date: '2024-01-01', target_group: 2 },
    });

    // =========================================================================
    // Part 1: Verify Toggle Buttons on familiesOverview
    // =========================================================================
    await page.goto('/');

    const overviewTab = page.locator('.sidebar-nav-item', { hasText: 'Familien' });
    await expect(overviewTab).toBeVisible();
    await overviewTab.click();

    // Verify the 3 grouping buttons exist in the toolbar
    const groupingToggle = page.locator('.overview-grouping-toggle');
    await expect(groupingToggle).toBeVisible();

    const familienBtn = groupingToggle.locator('.overview-grouping-btn', { hasText: 'Familien' });
    const gruppenBtn = groupingToggle.locator('.overview-grouping-btn', { hasText: 'Gruppen' });
    const jobsBtn = groupingToggle.locator('.overview-grouping-btn', { hasText: 'Jobs' });

    await expect(familienBtn).toBeVisible();
    await expect(gruppenBtn).toBeVisible();
    await expect(jobsBtn).toBeVisible();

    // Default grouping is "Gruppen"
    await expect(gruppenBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(jobsBtn).toHaveAttribute('aria-pressed', 'false');

    // =========================================================================
    // Part 2: Switch to "Jobs" grouping mode
    // =========================================================================
    await jobsBtn.click();
    await expect(jobsBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(gruppenBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(familienBtn).toHaveAttribute('aria-pressed', 'false');

    // =========================================================================
    // Part 3: Verify Section Headers and Placement
    // =========================================================================
    // Group header blocks in overview
    const groupHeaderRows = page.locator('tr.family-group-row');
    await expect(groupHeaderRows).toHaveCount(3);

    // Section 1: "Garten" (alphabetical order)
    await expect(groupHeaderRows.nth(0)).toContainText('Garten');
    // Section 2: "Hygiene" (alphabetical order)
    await expect(groupHeaderRows.nth(1)).toContainText('Hygiene');
    // Section 3: "Aktuell kein Tollhaus Job" (MUST be placed after the job sections!)
    await expect(groupHeaderRows.nth(2)).toContainText('Aktuell kein Tollhaus Job');

    // =========================================================================
    // Part 4: Verify Content in Each Section (Only Parents, No Children)
    // =========================================================================
    // 1. In "Garten" section: Anna Schmidt and Hans Schmidt
    // Verify children Lukas and Mia are NOT shown anywhere in the table in jobs mode!
    await expect(page.locator('tr.overview-child-row')).toHaveCount(0);

    // Locate the sections by their tbody header blocks
    const gartenBlock = page.locator('tbody.overview-group-header-block', { hasText: 'Garten' });
    await expect(gartenBlock).toBeVisible();

    // Find rows after Garten header block until the next header block
    // Both Anna and Hans should be in the Garten section
    const annaGartenRow = page.locator('tr.overview-parent-row', { hasText: 'Anna Schmidt' });
    const hansGartenRow = page.locator('tr.overview-parent-row', { hasText: 'Hans Schmidt' });

    // Anna has both Garten and Hygiene, so she appears under Garten AND under Hygiene (count = 2)
    await expect(annaGartenRow).toHaveCount(2);
    // Hans only has Garten, so he appears once (count = 1)
    await expect(hansGartenRow).toHaveCount(1);

    // Parents without jobs (Bernd and Clara Becker) appear only in "Aktuell kein Tollhaus Job"
    const berndRow = page.locator('tr.overview-parent-row', { hasText: 'Bernd Becker' });
    const claraRow = page.locator('tr.overview-parent-row', { hasText: 'Clara Becker' });
    await expect(berndRow).toHaveCount(1);
    await expect(claraRow).toHaveCount(1);

    // =========================================================================
    // Part 5: Search and Filtering
    // =========================================================================
    const searchInput = page.locator('.overview-search-input');
    await searchInput.fill('Hygiene');

    // With query "Hygiene", only Hygiene section should be visible
    await expect(page.locator('tr.family-group-row', { hasText: 'Hygiene' })).toBeVisible();
    await expect(page.locator('tr.family-group-row', { hasText: 'Garten' })).toHaveCount(0);
    await expect(page.locator('tr.family-group-row', { hasText: 'Aktuell kein Tollhaus Job' })).toHaveCount(0);
    // In Hygiene section, only Anna Schmidt should be shown
    await expect(page.locator('tr.overview-parent-row', { hasText: 'Anna Schmidt' })).toHaveCount(1);
    await expect(page.locator('tr.overview-parent-row', { hasText: 'Hans Schmidt' })).toHaveCount(0);

    // Search for a person in "Aktuell kein Tollhaus Job"
    await searchInput.fill('Bernd');
    await expect(page.locator('tr.family-group-row', { hasText: 'Aktuell kein Tollhaus Job' })).toBeVisible();
    await expect(page.locator('tr.family-group-row', { hasText: 'Garten' })).toHaveCount(0);
    await expect(page.locator('tr.family-group-row', { hasText: 'Hygiene' })).toHaveCount(0);
    await expect(page.locator('tr.overview-parent-row', { hasText: 'Bernd Becker' })).toHaveCount(1);
    await expect(page.locator('tr.overview-parent-row', { hasText: 'Anna Schmidt' })).toHaveCount(0);

    // Clear search
    await searchInput.fill('');
    await expect(page.locator('tr.family-group-row')).toHaveCount(3);

    // =========================================================================
    // Part 6: Responsive Mobile Card Layout
    // =========================================================================
    await page.setViewportSize({ width: 500, height: 800 });

    // Grouping toggle buttons are visible on mobile
    await expect(jobsBtn).toBeVisible();
    await expect(jobsBtn).toHaveAttribute('aria-pressed', 'true');

    // All 3 section headers are visible on mobile
    await expect(page.locator('tr.family-group-row', { hasText: 'Garten' })).toBeVisible();
    await expect(page.locator('tr.family-group-row', { hasText: 'Hygiene' })).toBeVisible();
    await expect(page.locator('tr.family-group-row', { hasText: 'Aktuell kein Tollhaus Job' })).toBeVisible();

    // Verify parents are rendered as cards
    const mobileAnnaCard = page.locator('tr.overview-parent-row', { hasText: 'Anna Schmidt' }).first();
    await expect(mobileAnnaCard).toBeVisible();
    const mobileAnnaDisplay = await mobileAnnaCard.evaluate((el) => getComputedStyle(el).display);
    expect(mobileAnnaDisplay).toBe('flex');
  });
});
