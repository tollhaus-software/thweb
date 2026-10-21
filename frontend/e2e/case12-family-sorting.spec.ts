import { test, expect } from '@playwright/test';
import { formatFamilyName, getFamilyName } from '../src/utils/family';

test.describe('formatFamilyName & getFamilyName helper unit tests', () => {
  test('handles empty parents or empty last names with default or custom fallback', () => {
    expect(formatFamilyName([])).toBe('Familie');
    expect(formatFamilyName(null)).toBe('Familie');
    expect(formatFamilyName(undefined)).toBe('Familie');
    expect(formatFamilyName([], 'New Family')).toBe('New Family');
    expect(formatFamilyName([{ last_name: '' }, { last_name: '   ' }])).toBe('Familie');
  });

  test('deduplicates identical parent surnames', () => {
    expect(formatFamilyName([{ last_name: 'Müller' }, { last_name: 'Müller' }])).toBe('Müller');
  });

  test('sorts multiple different surnames alphabetically before joining with " / "', () => {
    // Zachary Zimmermann and Benjamin Aalberg should be sorted Aalberg / Zimmermann
    expect(
      formatFamilyName([
        { last_name: 'Zimmermann' },
        { last_name: 'Aalberg' },
      ])
    ).toBe('Aalberg / Zimmermann');

    // Case-insensitive alphabetical sorting
    expect(
      formatFamilyName([
        { last_name: 'smith' },
        { last_name: 'Adams' },
      ])
    ).toBe('Adams / smith');

    // Three parents out of order
    expect(
      formatFamilyName([
        { last_name: 'Zimmermann' },
        { last_name: 'Aalberg' },
        { last_name: 'Müller' },
      ])
    ).toBe('Aalberg / Müller / Zimmermann');
  });

  test('getFamilyName prioritizes existing family_name or falls back to formatted parents', () => {
    expect(getFamilyName({ family_name: 'Custom / Family' })).toBe('Custom / Family');
    expect(getFamilyName({ parents: [{ last_name: 'Becker' }, { last_name: 'Adams' }] })).toBe('Adams / Becker');
    expect(getFamilyName(null)).toBe('Familie');
  });
});

test.describe('Test Case 12: Family Sorting across MGA Tabs', () => {
  test.beforeEach(async ({ request, page }) => {
    // 1. Reset database
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const authHeaders = { Authorization: 'Bearer developer@example.com' };

    // 2. Create Family 1: Aalberg
    // Parents: Zachary and Benjamin (out of alphabetical order)
    // Children: Felix (2020-05-10) and Aaron (2018-02-15)
    // Aaron starts 2021-09-01, Felix starts 2023-09-01
    // Family start dates: first = 2021-09-01, last = 2023-09-01
    const fam1Res = await request.post('/api/families', {
      headers: authHeaders,
      data: {
        parents: [
          { first_name: 'Zachary', last_name: 'Aalberg' },
          { first_name: 'Benjamin', last_name: 'Aalberg' },
        ],
      },
    });
    expect(fam1Res.ok()).toBeTruthy();
    const fam1 = await fam1Res.json();

    const felixId = crypto.randomUUID();
    await request.post(`/api/families/${fam1.id}/children`, {
      headers: authHeaders,
      data: {
        id: felixId,
        family_id: fam1.id,
        first_name: 'Felix',
        last_name: 'Aalberg',
        birth_date: '2020-05-10',
      },
    });
    await request.post(`/api/children/${felixId}/group_changes`, {
      headers: authHeaders,
      data: {
        child_id: felixId,
        change_date: '2023-09-01',
        target_group: 1,
      },
    });

    const aaronId = crypto.randomUUID();
    await request.post(`/api/families/${fam1.id}/children`, {
      headers: authHeaders,
      data: {
        id: aaronId,
        family_id: fam1.id,
        first_name: 'Aaron',
        last_name: 'Aalberg',
        birth_date: '2018-02-15',
      },
    });
    await request.post(`/api/children/${aaronId}/group_changes`, {
      headers: authHeaders,
      data: {
        child_id: aaronId,
        change_date: '2021-09-01',
        target_group: 2,
      },
    });

    // 3. Create Family 2: Müller
    // Parents: Daniel
    // Child: Lukas (2022-01-01), starts 2024-01-01
    // Family start dates: first = 2024-01-01, last = 2024-01-01
    const fam2Res = await request.post('/api/families', {
      headers: authHeaders,
      data: {
        parents: [{ first_name: 'Daniel', last_name: 'Müller' }],
      },
    });
    expect(fam2Res.ok()).toBeTruthy();
    const fam2 = await fam2Res.json();

    const lukasId = crypto.randomUUID();
    await request.post(`/api/families/${fam2.id}/children`, {
      headers: authHeaders,
      data: {
        id: lukasId,
        family_id: fam2.id,
        first_name: 'Lukas',
        last_name: 'Müller',
        birth_date: '2022-01-01',
      },
    });
    await request.post(`/api/children/${lukasId}/group_changes`, {
      headers: authHeaders,
      data: {
        child_id: lukasId,
        change_date: '2024-01-01',
        target_group: 1,
      },
    });

    // 4. Create Family 3: Zimmermann
    // Parents: Stefan
    // Child: Zoe (2019-11-20), starts 2020-03-01
    // Family start dates: first = 2020-03-01, last = 2020-03-01
    const fam3Res = await request.post('/api/families', {
      headers: authHeaders,
      data: {
        parents: [{ first_name: 'Stefan', last_name: 'Zimmermann' }],
      },
    });
    expect(fam3Res.ok()).toBeTruthy();
    const fam3 = await fam3Res.json();

    const zoeId = crypto.randomUUID();
    await request.post(`/api/families/${fam3.id}/children`, {
      headers: authHeaders,
      data: {
        id: zoeId,
        family_id: fam3.id,
        first_name: 'Zoe',
        last_name: 'Zimmermann',
        birth_date: '2019-11-20',
      },
    });
    await request.post(`/api/children/${zoeId}/group_changes`, {
      headers: authHeaders,
      data: {
        child_id: zoeId,
        change_date: '2020-03-01',
        target_group: 1,
      },
    });

    // Auth as admin user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('thweb_family_sort_order');
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();
  });

  test('verifies default sorting and custom family sort order across MGA tabs', async ({ page }) => {
    // Navigate to Familien(MGA) tab
    await page.getByRole('button', { name: 'Familien(MGA)' }).click();

    const sortButton = page.locator('.family-sort-button');
    await expect(sortButton).toBeVisible();
    await expect(sortButton).toContainText('Sortierung: Name (A → Z)');

    // Helper to get visible family names from family rows
    const getVisibleFamilyNames = async () => {
      const rows = page.locator('tr.family-group-row');
      const count = await rows.count();
      const names: string[] = [];
      for (let i = 0; i < count; i++) {
        const text = await rows.nth(i).locator('.family-name-text').textContent();
        names.push((text || '').trim());
      }
      return names;
    };

    // 1. Default order: Name A → Z
    let familyNames = await getVisibleFamilyNames();
    expect(familyNames).toEqual(['Aalberg', 'Müller', 'Zimmermann']);

    // Check internal sorting in Aalberg:
    // Parents sub-header should show Benjamin before Zachary
    const aalbergRow = page.locator('tr.family-group-row', { hasText: 'Aalberg' });
    const parentsText = await aalbergRow.locator('.family-parent-link').allTextContents();
    expect(parentsText.map(t => t.trim())).toEqual(['Benjamin Aalberg', 'Zachary Aalberg']);

    // Children sub-rows of Aalberg: Aaron (2018) before Felix (2020)
    const childRows = page.locator('tbody tr:not(.family-group-row)');
    const aaronText = childRows.filter({ hasText: 'Aaron Aalberg' });
    const felixText = childRows.filter({ hasText: 'Felix Aalberg' });
    await expect(aaronText).toBeVisible();
    await expect(felixText).toBeVisible();

    // 2. Open Sort Popover and choose Name (Z → A)
    await sortButton.click();
    const popover = page.locator('.glass-popup');
    await expect(popover).toBeVisible();
    await popover.locator('button[data-sort-order="name_desc"]').click();
    await expect(popover).toBeHidden();

    await expect(sortButton).toContainText('Sortierung: Name (Z → A)');
    familyNames = await getVisibleFamilyNames();
    expect(familyNames).toEqual(['Zimmermann', 'Müller', 'Aalberg']);

    // 3. Sort by Most Recent Start Date (youngest child) descending:
    // Müller (2024-01-01), Aalberg (2023-09-01), Zimmermann (2020-03-01)
    await sortButton.click();
    await expect(popover).toBeVisible();
    await popover.locator('button[data-sort-order="last_start_desc"]').click();
    await expect(popover).toBeHidden();

    await expect(sortButton).toContainText('Neueste zuerst (absteigend)');
    familyNames = await getVisibleFamilyNames();
    expect(familyNames).toEqual(['Müller', 'Aalberg', 'Zimmermann']);

    // 4. Sort by First Start Date (family inception) ascending:
    // Zimmermann (2020-03-01), Aalberg (2021-09-01), Müller (2024-01-01)
    await sortButton.click();
    await expect(popover).toBeVisible();
    await popover.locator('button[data-sort-order="first_start_asc"]').click();
    await expect(popover).toBeHidden();

    await expect(sortButton).toContainText('Früheste zuerst (aufsteigend)');
    familyNames = await getVisibleFamilyNames();
    expect(familyNames).toEqual(['Zimmermann', 'Aalberg', 'Müller']);

    // 5. Switch to Eltern(MGA) tab: verify sort persists and applies
    await page.getByRole('button', { name: 'Eltern(MGA)' }).click();
    await expect(sortButton).toBeVisible();
    await expect(sortButton).toContainText('Früheste zuerst (aufsteigend)');
    familyNames = await getVisibleFamilyNames();
    expect(familyNames).toEqual(['Zimmermann', 'Aalberg', 'Müller']);

    // Verify parents within Aalberg are still sorted alphabetically: Benjamin before Zachary
    const aalbergParentRows = page.locator('tbody tr:not(.family-group-row)').filter({ hasText: 'Aalberg' });
    const p1 = await aalbergParentRows.nth(0).textContent();
    const p2 = await aalbergParentRows.nth(1).textContent();
    expect(p1).toContain('Benjamin');
    expect(p2).toContain('Zachary');

    // 6. Switch to Kinder(MGA) tab: verify sort persists and applies
    await page.getByRole('button', { name: 'Kinder(MGA)' }).click();
    await expect(sortButton).toBeVisible();
    await expect(sortButton).toContainText('Früheste zuerst (aufsteigend)');
    familyNames = await getVisibleFamilyNames();
    expect(familyNames).toEqual(['Zimmermann', 'Aalberg', 'Müller']);

    // Verify children within Aalberg are still sorted by birth date: Aaron before Felix
    const aalbergChildRows = page.locator('tbody tr:not(.family-group-row)').filter({ hasText: 'Aalberg' });
    const c1 = await aalbergChildRows.nth(0).textContent();
    const c2 = await aalbergChildRows.nth(1).textContent();
    expect(c1).toContain('Aaron');
    expect(c2).toContain('Felix');

    // 7. Reload page: verify persistence from localStorage
    await page.reload();
    await expect(sortButton).toBeVisible();
    await expect(sortButton).toContainText('Früheste zuerst (aufsteigend)');
    await expect(page.locator('tr.family-group-row').first()).toBeVisible();
    familyNames = await getVisibleFamilyNames();
    expect(familyNames).toEqual(['Zimmermann', 'Aalberg', 'Müller']);
  });
});
