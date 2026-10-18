import { test, expect } from '@playwright/test';

test.describe('Test Case 8: Adaptive Card Layout for familiesOverview Tab', () => {
  test('switches between adaptive cards on narrow screens and classic table on desktop', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Seed a family with two parents and child
    const createFamRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Hans',
            last_name: 'Schmidt',
            address: 'Königstraße 10, 70173 Stuttgart',
            emails: [
              {
                value: 'hans.schmidt@tollhaus-stuttgart.de',
                identifier_email: true,
                address_list: true,
              },
            ],
            phones: [
              {
                value: '0171 1234567',
                address_list: true,
              },
            ],
          },
          {
            first_name: 'Laura',
            last_name: 'Schmidt',
            address: 'Königstraße 10, 70173 Stuttgart',
            emails: [
              {
                value: 'laura.schmidt@tollhaus-stuttgart.de',
                identifier_email: true,
                address_list: true,
              },
            ],
            phones: [
              {
                value: '0171 7654321',
                address_list: true,
              },
            ],
          },
        ],
      },
    });
    expect(createFamRes.ok()).toBeTruthy();
    const fam = await createFamRes.json();

    const miaChildId = crypto.randomUUID();
    const createMiaRes = await request.post(`/api/families/${fam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: miaChildId,
        family_id: fam.id,
        first_name: 'Mia',
        last_name: 'Schmidt',
        birth_date: '2021-04-10',
      },
    });
    expect(createMiaRes.ok()).toBeTruthy();

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

    // 3. Authenticate and set mobile viewport (< 768px)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');

    const overviewTab = page.getByRole('button', { name: 'Familien', exact: true });
    await expect(overviewTab).toBeVisible();
    await overviewTab.click();
    await expect(overviewTab).toHaveClass(/active/);

    // Verify undo/redo buttons are NOT present on familiesOverview tab
    await expect(page.getByTitle('Undo (Ctrl+Z)')).not.toBeVisible();
    await expect(page.getByTitle('Redo (Ctrl+Y)')).not.toBeVisible();

    // Check table container does not scroll horizontally
    const tableContainer = page.locator('.overview-table-wrapper .table-container');
    await expect(tableContainer).toBeVisible();
    const isHorizontallyScrollable = await tableContainer.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(isHorizontallyScrollable).toBeFalsy();

    // In "Nach Familie" mode: Verify parent row is rendered as a vertical card
    const hansRow = page.locator('tr.overview-parent-row', { hasText: 'Hans Schmidt' });
    await expect(hansRow).toBeVisible();

    const hansDisplay = await hansRow.evaluate((el) => getComputedStyle(el).display);
    const hansFlexDirection = await hansRow.evaluate((el) => getComputedStyle(el).flexDirection);
    expect(hansDisplay).toBe('flex');
    expect(hansFlexDirection).toBe('column');

    // Name at the top, phone, email, and address stacked vertically below
    const nameBox = await hansRow.locator('td').nth(0).boundingBox();
    const phoneBox = await hansRow.locator('td').nth(1).boundingBox();
    const emailBox = await hansRow.locator('td').nth(2).boundingBox();
    const addressBox = await hansRow.locator('td').nth(3).boundingBox();

    expect(nameBox).not.toBeNull();
    expect(phoneBox).not.toBeNull();
    expect(emailBox).not.toBeNull();
    expect(addressBox).not.toBeNull();

    if (nameBox && phoneBox && emailBox && addressBox) {
      expect(phoneBox.y).toBeGreaterThan(nameBox.y);
      expect(emailBox.y).toBeGreaterThan(phoneBox.y);
      expect(addressBox.y).toBeGreaterThan(emailBox.y);
    }

    // Verify child row is rendered as a compact card with group badge
    const miaRow = page.locator('tr.overview-child-row', { hasText: 'Mia' });
    await expect(miaRow).toBeVisible();
    const miaDisplay = await miaRow.evaluate((el) => getComputedStyle(el).display);
    expect(miaDisplay).toBe('flex');
    await expect(miaRow.locator('.overview-child-group-badge')).toContainText('Kleine Gr.');

    // 4. Test "Nach Gruppe" grouping toggle in mobile card view with expandable parents
    await page.getByRole('button', { name: 'Nach Gruppe' }).click();
    const groupHeaderRow = page.locator('tr.family-group-row', { hasText: 'Kleine Gruppe' });
    await expect(groupHeaderRow).toBeVisible();
    const groupHeaderDisplay = await groupHeaderRow.evaluate((el) => getComputedStyle(el).display);
    expect(groupHeaderDisplay).toBe('block');

    // Mia child card is visible
    const miaGroupCard = page.locator('tr.overview-child-row', { hasText: 'Mia Schmidt' });
    await expect(miaGroupCard).toBeVisible();

    // Expandable toggle button shows summary "Hans & Laura Schmidt"
    const parentsToggleBtn = page.locator('.overview-parents-toggle-btn');
    await expect(parentsToggleBtn).toBeVisible();
    await expect(parentsToggleBtn).toContainText('Hans & Laura Schmidt');
    await expect(parentsToggleBtn).toContainText('Eltern');

    // While collapsed: parent cards in group mode are hidden
    const collapsedHansRow = page.locator('tr.overview-group-parent-row', { hasText: 'Hans Schmidt' });
    const collapsedLauraRow = page.locator('tr.overview-group-parent-row', { hasText: 'Laura Schmidt' });
    await expect(collapsedHansRow).toBeHidden();
    await expect(collapsedLauraRow).toBeHidden();

    // Click to expand parents
    await parentsToggleBtn.click();
    await expect(collapsedHansRow).toBeVisible();
    await expect(collapsedLauraRow).toBeVisible();

    // Verify parent cards are visually indented to the right relative to child card
    const miaBox = await miaGroupCard.boundingBox();
    const expandedHansBox = await collapsedHansRow.boundingBox();
    expect(miaBox).not.toBeNull();
    expect(expandedHansBox).not.toBeNull();
    if (miaBox && expandedHansBox) {
      expect(expandedHansBox.x).toBeGreaterThan(miaBox.x);
    }

    // Click again to collapse parents
    await parentsToggleBtn.click();
    await expect(collapsedHansRow).toBeHidden();
    await expect(collapsedLauraRow).toBeHidden();

    // 5. Resize to desktop viewport (> 768px)
    await page.setViewportSize({ width: 1200, height: 800 });

    // On desktop in "Nach Gruppe": toggle button is hidden, parent rows are visible as table rows
    await expect(page.locator('.overview-parents-toggle-row')).toBeHidden();
    const desktopHansRow = page.locator('tr.overview-parent-row', { hasText: 'Hans Schmidt' });
    await expect(desktopHansRow).toBeVisible();
    const desktopHansDisplay = await desktopHansRow.evaluate((el) => getComputedStyle(el).display);
    expect(desktopHansDisplay).toBe('table-row');

    const dtNameBox = await desktopHansRow.locator('td').nth(0).boundingBox();
    const dtPhoneBox = await desktopHansRow.locator('td').nth(1).boundingBox();
    const dtEmailBox = await desktopHansRow.locator('td').nth(2).boundingBox();
    const dtAddressBox = await desktopHansRow.locator('td').nth(3).boundingBox();

    expect(dtNameBox).not.toBeNull();
    expect(dtPhoneBox).not.toBeNull();
    expect(dtEmailBox).not.toBeNull();
    expect(dtAddressBox).not.toBeNull();

    if (dtNameBox && dtPhoneBox && dtEmailBox && dtAddressBox) {
      // Horizontal side-by-side positioning
      expect(dtPhoneBox.x).toBeGreaterThan(dtNameBox.x);
      expect(dtEmailBox.x).toBeGreaterThan(dtPhoneBox.x);
      expect(dtAddressBox.x).toBeGreaterThan(dtEmailBox.x);
      // All aligned on the same vertical baseline
      expect(Math.abs(dtPhoneBox.y - dtNameBox.y)).toBeLessThan(5);
      expect(Math.abs(dtEmailBox.y - dtPhoneBox.y)).toBeLessThan(5);
    }
  });
});
