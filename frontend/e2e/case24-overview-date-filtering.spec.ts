import { test, expect } from '@playwright/test';

test.describe('Test Case 24: Families Overview Date-based Filtering', () => {
  test('filters out families whose children left > 1 year ago and new families planned > 12 weeks ahead', async ({ request, page }) => {
    // 1. Reset DB
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const now = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    // Helper to add days
    const addDays = (d: Date, days: number) => {
      const copy = new Date(d);
      copy.setDate(copy.getDate() + days);
      return copy;
    };

    const date400DaysAgo = formatDate(addDays(now, -400));
    const date500DaysAgo = formatDate(addDays(now, -500));
    const date180DaysAgo = formatDate(addDays(now, -180));
    const date300DaysAgo = formatDate(addDays(now, -300));
    const date140DaysFuture = formatDate(addDays(now, 140)); // 20 weeks
    const date28DaysFuture = formatDate(addDays(now, 28));   // 4 weeks
    const date60DaysAgo = formatDate(addDays(now, -60));

    // Seed Family 1: Exited > 1 year ago (should NOT be in familiesOverview)
    const fam1Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [{ first_name: 'Anna', last_name: 'Altexited', emails: [{ value: 'anna@example.com', identifier_email: true, address_list: true }] }],
      },
    });
    expect(fam1Res.ok()).toBeTruthy();
    const fam1 = await fam1Res.json();
    const child1Id = crypto.randomUUID();
    await request.post(`/api/families/${fam1.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: child1Id, family_id: fam1.id, first_name: 'ChildAlt', last_name: 'Altexited', birth_date: '2019-01-01' },
    });
    await request.post(`/api/children/${child1Id}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: child1Id, change_date: date500DaysAgo, target_group: 1 },
    });
    await request.post(`/api/children/${child1Id}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: child1Id, change_date: date400DaysAgo, target_group: 0 },
    });

    // Seed Family 2: Exited 6 months ago (<= 1 year, SHOULD be in familiesOverview)
    const fam2Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [{ first_name: 'Bernd', last_name: 'Neunexited', emails: [{ value: 'bernd@example.com', identifier_email: true, address_list: true }] }],
      },
    });
    expect(fam2Res.ok()).toBeTruthy();
    const fam2 = await fam2Res.json();
    const child2Id = crypto.randomUUID();
    await request.post(`/api/families/${fam2.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: child2Id, family_id: fam2.id, first_name: 'ChildNeun', last_name: 'Neunexited', birth_date: '2020-01-01' },
    });
    await request.post(`/api/children/${child2Id}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: child2Id, change_date: date300DaysAgo, target_group: 1 },
    });
    await request.post(`/api/children/${child2Id}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: child2Id, change_date: date180DaysAgo, target_group: 0 },
    });

    // Seed Family 3: New family, planned start in 20 weeks (> 12 weeks, should NOT be in familiesOverview)
    const fam3Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [{ first_name: 'Clara', last_name: 'Weitgeplant', emails: [{ value: 'clara@example.com', identifier_email: true, address_list: true }] }],
      },
    });
    expect(fam3Res.ok()).toBeTruthy();
    const fam3 = await fam3Res.json();
    const child3Id = crypto.randomUUID();
    await request.post(`/api/families/${fam3.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: child3Id, family_id: fam3.id, first_name: 'ChildWeit', last_name: 'Weitgeplant', birth_date: '2022-01-01' },
    });
    await request.post(`/api/children/${child3Id}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: child3Id, change_date: date140DaysFuture, target_group: 1 },
    });

    // Seed Family 4: New family, planned start in 4 weeks (<= 12 weeks, SHOULD be in familiesOverview)
    const fam4Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [{ first_name: 'David', last_name: 'Baldstart', emails: [{ value: 'david@example.com', identifier_email: true, address_list: true }] }],
      },
    });
    expect(fam4Res.ok()).toBeTruthy();
    const fam4 = await fam4Res.json();
    const child4Id = crypto.randomUUID();
    await request.post(`/api/families/${fam4.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: child4Id, family_id: fam4.id, first_name: 'ChildBald', last_name: 'Baldstart', birth_date: '2022-05-01' },
    });
    await request.post(`/api/children/${child4Id}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: child4Id, change_date: date28DaysFuture, target_group: 1 },
    });

    // Seed Family 5: Active child (enrolled 60 days ago, SHOULD be in familiesOverview)
    const fam5Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [{ first_name: 'Eva', last_name: 'Aktivfam', emails: [{ value: 'eva@example.com', identifier_email: true, address_list: true }] }],
      },
    });
    expect(fam5Res.ok()).toBeTruthy();
    const fam5 = await fam5Res.json();
    const child5Id = crypto.randomUUID();
    await request.post(`/api/families/${fam5.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: child5Id, family_id: fam5.id, first_name: 'ChildAktiv', last_name: 'Aktivfam', birth_date: '2021-03-01' },
    });
    await request.post(`/api/children/${child5Id}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: child5Id, change_date: date60DaysAgo, target_group: 1 },
    });

    // Seed Family 6: New family without configured group start date (MUST NOT be in familiesOverview)
    const fam6Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [{ first_name: 'Frank', last_name: 'Keinstart', emails: [{ value: 'frank@example.com', identifier_email: true, address_list: true }] }],
      },
    });
    expect(fam6Res.ok()).toBeTruthy();
    const fam6 = await fam6Res.json();
    const child6Id = crypto.randomUUID();
    await request.post(`/api/families/${fam6.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: child6Id, family_id: fam6.id, first_name: 'ChildKein', last_name: 'Keinstart', birth_date: '2022-08-01' },
    });

    // Seed Family 7: Multi-child family (1 active child, 1 unconfigured child)
    // The family must be in familiesOverview, showing the active child, but NOT the unconfigured child.
    const fam7Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [{ first_name: 'Gerda', last_name: 'Mischfam', emails: [{ value: 'gerda@example.com', identifier_email: true, address_list: true }] }],
      },
    });
    expect(fam7Res.ok()).toBeTruthy();
    const fam7 = await fam7Res.json();
    const child7ActiveId = crypto.randomUUID();
    await request.post(`/api/families/${fam7.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: child7ActiveId, family_id: fam7.id, first_name: 'KindAktiv', last_name: 'Mischfam', birth_date: '2020-04-01' },
    });
    await request.post(`/api/children/${child7ActiveId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: child7ActiveId, change_date: date60DaysAgo, target_group: 1 },
    });
    const child7UnconfId = crypto.randomUUID();
    await request.post(`/api/families/${fam7.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: child7UnconfId, family_id: fam7.id, first_name: 'KindOhneGruppe', last_name: 'Mischfam', birth_date: '2023-01-01' },
    });

    // Login as admin developer
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await page.goto('/');

    // 2. Navigate to Familien (familiesOverview)
    const overviewTab = page.getByRole('button', { name: 'Familien', exact: true });
    await expect(overviewTab).toBeVisible();
    await overviewTab.click();
    await expect(overviewTab).toHaveClass(/active/);

    // Switch to Family Grouping view on familiesOverview for easy family-row lookup
    const familyGroupingBtn = page.getByRole('button', { name: 'Nach Familie' });
    if (await familyGroupingBtn.isVisible()) {
      await familyGroupingBtn.click();
    }

    // Verify presence / absence in familiesOverview
    // Family 1 (Altexited: left > 1 year ago) MUST NOT be visible
    await expect(page.locator('tr.family-group-row', { hasText: 'Altexited' })).toHaveCount(0);

    // Family 2 (Neunexited: left 6 months ago) MUST be visible
    await expect(page.locator('tr.family-group-row', { hasText: 'Neunexited' })).toBeVisible();

    // Family 3 (Weitgeplant: planned in 20 weeks) MUST NOT be visible
    await expect(page.locator('tr.family-group-row', { hasText: 'Weitgeplant' })).toHaveCount(0);

    // Family 4 (Baldstart: planned in 4 weeks) MUST be visible
    await expect(page.locator('tr.family-group-row', { hasText: 'Baldstart' })).toBeVisible();

    // Family 5 (Aktivfam: currently active) MUST be visible
    await expect(page.locator('tr.family-group-row', { hasText: 'Aktivfam' })).toBeVisible();

    // Family 6 (Keinstart: no group start date configured) MUST NOT be visible
    await expect(page.locator('tr.family-group-row', { hasText: 'Keinstart' })).toHaveCount(0);

    // Family 7 (Mischfam: 1 active child, 1 unconfigured child)
    // The family must be visible, the active child must be visible, but the unconfigured child must not be visible
    await expect(page.locator('tr.family-group-row', { hasText: 'Mischfam' })).toBeVisible();
    await expect(page.locator('.data-table.overview-table tr.overview-child-row', { hasText: 'KindAktiv' })).toBeVisible();
    await expect(page.locator('.data-table.overview-table tr.overview-child-row', { hasText: 'KindOhneGruppe' })).toHaveCount(0);

    // Test "Nach Gruppe" grouping mode with upcoming planned child vs active child
    await page.setViewportSize({ width: 500, height: 800 });
    const groupByGroupBtn = page.getByRole('button', { name: 'Nach Gruppe' });
    await expect(groupByGroupBtn).toBeVisible();
    await groupByGroupBtn.click();

    // Group 1 header "Kleine Gruppe" should be visible
    const grp1Header = page.locator('tr.family-group-row', { hasText: 'Kleine Gruppe' });
    await expect(grp1Header).toBeVisible();

    // In "by group" display:
    // ChildAktiv (active in Group 1) is shown in Gruppe 1 section and HAS the group badge
    const childAktivRow = page.locator('tr.overview-child-row', { hasText: 'ChildAktiv' });
    await expect(childAktivRow).toBeVisible();
    const aktivBadge = childAktivRow.locator('.overview-child-group-badge');
    await expect(aktivBadge).toBeVisible();
    await expect(aktivBadge).toHaveText('Kleine Gr.');

    // ChildBald (planned start soon in Group 1, not in group yet) is also in Gruppe 1 section, but WITHOUT group badge
    const childBaldRow = page.locator('tr.overview-child-row', { hasText: 'ChildBald' });
    await expect(childBaldRow).toBeVisible();
    await expect(childBaldRow.locator('.overview-child-group-badge')).toHaveCount(0);

    // Reset viewport and switch back to desktop for step 3
    await page.setViewportSize({ width: 1280, height: 720 });
    const familyGroupingBtnBack = page.getByRole('button', { name: 'Nach Familie' });
    if (await familyGroupingBtnBack.isVisible()) {
      await familyGroupingBtnBack.click();
    }

    // 3. Switch to Familien(MGA) management tab
    const mgaTab = page.getByRole('button', { name: 'MGA', exact: true });
    if (await mgaTab.isVisible()) {
      await mgaTab.click();
    }
    const familiesMgaTab = page.getByRole('button', { name: 'Familien(MGA)', exact: true });
    await expect(familiesMgaTab).toBeVisible();
    await familiesMgaTab.click();
    await expect(familiesMgaTab).toHaveClass(/active/);

    // In Familien(MGA), ALL families MUST be visible
    await expect(page.locator('.families-table tbody tr', { hasText: 'Altexited' })).toBeVisible();
    await expect(page.locator('.families-table tbody tr', { hasText: 'Neunexited' })).toBeVisible();
    await expect(page.locator('.families-table tbody tr', { hasText: 'Weitgeplant' })).toBeVisible();
    await expect(page.locator('.families-table tbody tr', { hasText: 'Baldstart' })).toBeVisible();
    await expect(page.locator('.families-table tbody tr', { hasText: 'Aktivfam' })).toBeVisible();
    await expect(page.locator('.families-table tbody tr', { hasText: 'Keinstart' })).toBeVisible();
    await expect(page.locator('.families-table tbody tr', { hasText: 'Mischfam' })).toBeVisible();
    await expect(page.locator('.data-table.families-table tr', { hasText: 'KindOhneGruppe' })).toBeVisible();
  });
});
