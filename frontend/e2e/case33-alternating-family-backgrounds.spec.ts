import { test, expect } from '@playwright/test';

test.describe('Test Case 33: Alternating Family Backgrounds in Tables & Cards, Separators, and Mentors at Family Level', () => {
  test('alternating background pattern in table view and card view, horizontal separator in families(MGA), mentors on family level and no allergies in families(MGA)', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const todayStr = new Date().toISOString().split('T')[0];

    // 2. Seed Family 1 (Schmidt)
    const f1Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Hans',
            last_name: 'Schmidt',
            address: 'Hauptstraße 1',
            emails: [{ value: 'hans@tollhaus.de', address_list: true }],
            phones: [{ value: '0171 111111', address_list: true }],
          },
        ],
      },
    });
    expect(f1Res.ok()).toBeTruthy();
    const f1 = await f1Res.json();

    const c1Id = crypto.randomUUID();
    const c1Res = await request.post(`/api/families/${f1.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: c1Id,
        first_name: 'Mia',
        last_name: 'Schmidt',
        birth_date: '2020-05-10',
      },
    });
    expect(c1Res.ok()).toBeTruthy();

    await request.post(`/api/children/${c1Id}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        change_date: todayStr,
        target_group: 1,
      },
    });

    // 3. Seed Family 2 (Weber)
    const f2Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Julia',
            last_name: 'Weber',
            address: 'Schillerstraße 5',
            emails: [{ value: 'julia@tollhaus.de', address_list: true }],
            phones: [{ value: '0171 222222', address_list: true }],
          },
        ],
      },
    });
    expect(f2Res.ok()).toBeTruthy();
    const f2 = await f2Res.json();

    const c2Id = crypto.randomUUID();
    const c2Res = await request.post(`/api/families/${f2.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: c2Id,
        first_name: 'Felix',
        last_name: 'Weber',
        birth_date: '2021-08-15',
      },
    });
    expect(c2Res.ok()).toBeTruthy();

    await request.post(`/api/children/${c2Id}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        change_date: todayStr,
        target_group: 2,
      },
    });

    // Set Family 1 as mentor for Family 2
    const putMentorRes = await request.put(`/api/families/${f2.id}/mentor`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { mentor_family_id: f1.id, mentor_parent_ids: [] },
    });
    expect(putMentorRes.ok()).toBeTruthy();

    // Authenticate
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // -------------------------------------------------------------------------
    // Desktop Table View (1200x800)
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');

    const toggleSidebarBtn = page.getByRole('button', { name: 'Seitenleiste umschalten' });
    if (await toggleSidebarBtn.isVisible()) {
      await toggleSidebarBtn.click();
    }

    // --- A. familiesOverview Tab in Table View ---
    const overviewTab = page.getByRole('button', { name: 'Familien', exact: true });
    await expect(overviewTab).toBeVisible();
    await overviewTab.click();

    // Switch to "Nach Familie" mode
    const byFamilyBtn = page.getByRole('button', { name: 'Nach Familie' });
    await expect(byFamilyBtn).toBeVisible();
    await byFamilyBtn.click();

    const overviewFamilyBodies = page.locator('.data-table.overview-table tbody.family-card');
    await expect(overviewFamilyBodies).toHaveCount(2);

    const f1OverviewTbody = overviewFamilyBodies.nth(0);
    const f2OverviewTbody = overviewFamilyBodies.nth(1);

    await expect(f1OverviewTbody).toHaveClass(/family-card-even/);
    await expect(f2OverviewTbody).toHaveClass(/family-card-odd/);

    // In Family 1 (even), family-group-row, parent row, and child row should all share the same background
    const f1HeaderBg = await f1OverviewTbody.locator('tr.family-group-row td').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const f1ParentBg = await f1OverviewTbody.locator('tr.overview-parent-row td').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const f1ChildBg = await f1OverviewTbody.locator('tr.overview-child-row td').first().evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(f1HeaderBg).toBe(f1ParentBg);
    expect(f1ParentBg).toBe(f1ChildBg);

    // In Family 2 (odd), family-group-row, parent row, and child row should all share the same alternate background
    const f2HeaderBg = await f2OverviewTbody.locator('tr.family-group-row td').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const f2ParentBg = await f2OverviewTbody.locator('tr.overview-parent-row td').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const f2ChildBg = await f2OverviewTbody.locator('tr.overview-child-row td').first().evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(f2HeaderBg).toBe(f2ParentBg);
    expect(f2ParentBg).toBe(f2ChildBg);

    // Alternating backgrounds: Family 1 background != Family 2 background
    expect(f1HeaderBg).not.toBe(f2HeaderBg);

    // --- B. families(MGA) Tab in Table View ---
    const mgaCatBtn = page.getByRole('button', { name: 'MGA' });
    if (await mgaCatBtn.isVisible()) {
      await mgaCatBtn.click();
    }
    const familiesMgaBtn = page.getByRole('button', { name: 'Familien(MGA)' });
    await expect(familiesMgaBtn).toBeVisible();
    await familiesMgaBtn.click();

    // Verify 6 columns: Familienname, Eltern, Kinder, Paten, Paten von, Notizen (Allergies omitted)
    await expect(page.getByRole('columnheader', { name: 'Familienname', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Eltern', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Kinder', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Paten', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Paten von', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Notizen/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Allergien', exact: true })).toHaveCount(0);

    const mgaFamilyBodies = page.locator('.data-table.families-table tbody.family-card');
    await expect(mgaFamilyBodies).toHaveCount(2);

    const f1MgaTbody = mgaFamilyBodies.nth(0);
    const f2MgaTbody = mgaFamilyBodies.nth(1);

    await expect(f1MgaTbody).toHaveClass(/family-card-even/);
    await expect(f2MgaTbody).toHaveClass(/family-card-odd/);

    // Family 1 row in families(MGA)
    const f1MgaRowBg = await f1MgaTbody.locator('tr td').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    // Family 2 row in families(MGA)
    const f2MgaRowBg = await f2MgaTbody.locator('tr td').first().evaluate((el) => getComputedStyle(el).backgroundColor);

    // Alternating backgrounds between families
    expect(f1MgaRowBg).not.toBe(f2MgaRowBg);

    // Check Mentors are displayed in Paten and Paten von columns
    await expect(f2MgaTbody.locator('td[data-column-id="paten"]')).toContainText('Familie Schmidt');
    await expect(f1MgaTbody.locator('td[data-column-id="paten_von"]')).toContainText('Familie Weber');

    // -------------------------------------------------------------------------
    // Mobile Card View (500x800)
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 500, height: 800 });

    // Alternating cards in families(MGA)
    const mobileMgaCards = page.locator('.data-table.families-table tbody.family-card');
    await expect(mobileMgaCards).toHaveCount(2);

    const card1Bg = await mobileMgaCards.nth(0).evaluate((el) => getComputedStyle(el).backgroundColor);
    const card2Bg = await mobileMgaCards.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(card1Bg).not.toBe(card2Bg);

    // Card 1 even background matches --bg-surface (white)
    expect(card1Bg).toBe('rgb(255, 255, 255)');
    // Card 2 odd background matches --bg-family-alt (#f8fafc -> rgb(248, 250, 252))
    expect(card2Bg).toBe('rgb(248, 250, 252)');

    // In mobile card view, mentors displayed in Paten and Paten von columns
    await expect(mobileMgaCards.nth(1).locator('td[data-column-id="paten"]')).toContainText('Familie Schmidt');
    await expect(mobileMgaCards.nth(0).locator('td[data-column-id="paten_von"]')).toContainText('Familie Weber');
  });
});
