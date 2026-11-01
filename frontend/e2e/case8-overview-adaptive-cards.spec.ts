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

    // 2b. Seed a second family (Weber) in the same group to verify alternating family cards
    const createWeberRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Thomas',
            last_name: 'Weber',
            address: 'Schillerplatz 5, 70173 Stuttgart',
            emails: [
              {
                value: 'thomas.weber@tollhaus-stuttgart.de',
                identifier_email: true,
                address_list: true,
              },
            ],
            phones: [
              {
                value: '0171 9998887',
                address_list: true,
              },
            ],
          },
        ],
      },
    });
    expect(createWeberRes.ok()).toBeTruthy();
    const weberFam = await createWeberRes.json();

    const felixChildId = crypto.randomUUID();
    const createFelixRes = await request.post(`/api/families/${weberFam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: felixChildId,
        family_id: weberFam.id,
        first_name: 'Felix',
        last_name: 'Weber',
        birth_date: '2022-01-15',
      },
    });
    expect(createFelixRes.ok()).toBeTruthy();

    const addFelixGcRes = await request.post(`/api/children/${felixChildId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        child_id: felixChildId,
        change_date: todayStr,
        target_group: 1,
      },
    });
    expect(addFelixGcRes.ok()).toBeTruthy();

    // 3. Authenticate and set mobile viewport (< 768px)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');

    const toggleSidebarBtn = page.getByRole('button', { name: 'Seitenleiste umschalten' });
    if (await toggleSidebarBtn.isVisible()) {
      await toggleSidebarBtn.click();
    }
    const overviewTab = page.getByRole('button', { name: 'Familien', exact: true });
    await expect(overviewTab).toBeVisible();
    await overviewTab.click();
    await expect(overviewTab).toHaveClass(/active/);

    // Verify undo/redo buttons are NOT present on familiesOverview tab
    await expect(page.getByTitle('Undo')).not.toBeVisible();
    await expect(page.getByTitle('Redo')).not.toBeVisible();

    // Check table container does not scroll horizontally
    const tableContainer = page.locator('.overview-table-wrapper .table-container');
    await expect(tableContainer).toBeVisible();
    const isHorizontallyScrollable = await tableContainer.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(isHorizontallyScrollable).toBeFalsy();

    // Verify default grouping is "Nach Gruppe"
    await expect(page.getByRole('button', { name: 'Nach Gruppe' })).toHaveAttribute('aria-pressed', 'true');

    // Switch to "Nach Familie" mode to verify parent and child card rendering in family mode
    await page.getByRole('button', { name: 'Nach Familie' }).click();

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

    // Verify phone and email are clickable links with tel: and mailto: hrefs
    const hansPhoneLink = hansRow.locator('a.overview-contact-link[href^="tel:"]');
    await expect(hansPhoneLink).toBeVisible();
    await expect(hansPhoneLink).toHaveAttribute('href', 'tel:01711234567');
    await expect(hansPhoneLink).toHaveText('0171 1234567');

    const hansEmailLink = hansRow.locator('a.overview-contact-link[href^="mailto:"]');
    await expect(hansEmailLink).toBeVisible();
    await expect(hansEmailLink).toHaveAttribute('href', 'mailto:hans.schmidt@tollhaus-stuttgart.de');
    await expect(hansEmailLink).toHaveText('hans.schmidt@tollhaus-stuttgart.de');

    // Verify e-mail symbol is '@' and home symbol is '🏠' in mobile card view
    const mobileEmailSymbol = hansRow.locator('td').nth(2).locator('.overview-contact-symbol');
    await expect(mobileEmailSymbol).toBeVisible();
    await expect(mobileEmailSymbol).toHaveText('@');
    const mobileHomeSymbol = hansRow.locator('td').nth(3).locator('.overview-contact-symbol');
    await expect(mobileHomeSymbol).toBeVisible();
    await expect(mobileHomeSymbol).toHaveText('🏠');

    // Verify child row is rendered as a compact card with group badge
    const miaRow = page.locator('tr.overview-child-row', { hasText: 'Mia' });
    await expect(miaRow).toBeVisible();
    const miaDisplay = await miaRow.evaluate((el) => getComputedStyle(el).display);
    expect(miaDisplay).toBe('flex');
    await expect(miaRow.locator('.overview-child-group-badge')).toContainText('Kleine Gr.');

    // Verify one card per family with alternating backgrounds in per-family mode
    const familyCards = page.locator('.data-table.overview-table tbody.family-card');
    await expect(familyCards).toHaveCount(2);

    // Card 0 (Schmidt): header is family name, people are within card
    const schmidtCard = familyCards.filter({ has: page.locator('tr.family-group-row', { hasText: 'Schmidt' }) });
    await expect(schmidtCard).toHaveClass(/family-card-even/);
    await expect(schmidtCard.locator('tr.overview-parent-row', { hasText: 'Hans Schmidt' })).toBeVisible();
    await expect(schmidtCard.locator('tr.overview-child-row', { hasText: 'Mia' })).toBeVisible();

    // Card 1 (Weber): header is family name, people are within card
    const weberCard = familyCards.filter({ has: page.locator('tr.family-group-row', { hasText: 'Weber' }) });
    await expect(weberCard).toHaveClass(/family-card-odd/);
    await expect(weberCard.locator('tr.overview-parent-row', { hasText: 'Thomas Weber' })).toBeVisible();
    await expect(weberCard.locator('tr.overview-child-row', { hasText: 'Felix' })).toBeVisible();

    // Verify alternating background colors between the two cards
    const schmidtBg = await schmidtCard.evaluate((el) => getComputedStyle(el).backgroundColor);
    const weberBg = await weberCard.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(schmidtBg).not.toBe(weberBg);

    // Verify parent header and parent rows in "by family" mode do not have separate backgrounds
    const schmidtHeaderTd = schmidtCard.locator('tr.family-group-row td');
    const schmidtHeaderBg = await schmidtHeaderTd.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(schmidtHeaderBg);

    const schmidtParentTd = schmidtCard.locator('tr.overview-parent-row td').first();
    const schmidtParentBg = await schmidtParentTd.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(schmidtParentBg);

    // 4. Test "Nach Gruppe" grouping toggle in mobile card view with expandable parents
    await page.getByRole('button', { name: 'Nach Gruppe' }).click();
    const groupHeaderRow = page.locator('tr.family-group-row', { hasText: 'Kleine Gruppe' });
    await expect(groupHeaderRow).toBeVisible();
    const groupHeaderDisplay = await groupHeaderRow.evaluate((el) => getComputedStyle(el).display);
    expect(groupHeaderDisplay).toBe('block');

    // Verify group sub headings: uppercase, bold, no separate background, not in a box
    const ghTextTransform = await groupHeaderRow.locator('td').evaluate((el) => getComputedStyle(el).textTransform);
    expect(ghTextTransform).toBe('uppercase');
    const ghFontWeight = await groupHeaderRow.locator('td').evaluate((el) => parseInt(getComputedStyle(el).fontWeight, 10));
    expect(ghFontWeight).toBeGreaterThanOrEqual(600);
    const ghBorder = await groupHeaderRow.locator('td').evaluate((el) => getComputedStyle(el).borderStyle);
    expect(['none', 'hidden']).toContain(ghBorder);
    const ghBg = await groupHeaderRow.locator('td').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(ghBg);

    // First group header should not have a horizontal line above it
    const firstGroupTbody = page.locator('tbody.overview-group-header-block').first();
    const firstGroupBorderTop = await firstGroupTbody.evaluate((el) => getComputedStyle(el).borderTopStyle);
    expect(['none', 'hidden']).toContain(firstGroupBorderTop);

    // In "Nach Gruppe" mode: under the group header, each family is in its own card
    // Cards alternate background colors, start directly with the children, and have no family header
    const groupFamilyCards = page.locator('.data-table.overview-table tbody.family-card');
    await expect(groupFamilyCards).toHaveCount(2);

    const groupCard0 = groupFamilyCards.nth(0);
    const groupCard1 = groupFamilyCards.nth(1);

    await expect(groupCard0).toHaveClass(/family-card-even/);
    await expect(groupCard1).toHaveClass(/family-card-odd/);

    // No family group header inside the card in per-group layout
    await expect(groupCard0.locator('tr.family-group-row')).toHaveCount(0);
    await expect(groupCard1.locator('tr.family-group-row')).toHaveCount(0);

    // Cards start directly with the children of that family in that group
    await expect(groupCard0.locator('tr.overview-child-row', { hasText: 'Mia Schmidt' })).toBeVisible();
    await expect(groupCard1.locator('tr.overview-child-row', { hasText: 'Felix Weber' })).toBeVisible();

    // Verify alternating background colors between the cards in group mode
    const gBg0 = await groupCard0.evaluate((el) => getComputedStyle(el).backgroundColor);
    const gBg1 = await groupCard1.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(gBg0).not.toBe(gBg1);

    // Mia child card is visible
    const miaGroupCard = page.locator('tr.overview-child-row', { hasText: 'Mia Schmidt' });
    await expect(miaGroupCard).toBeVisible();

    // Verify no horizontal separator between child and parents
    const parentsToggleRow = page.locator('tr.overview-parents-toggle-row').first();
    const toggleRowBorderTop = await parentsToggleRow.evaluate((el) => getComputedStyle(el).borderTopStyle);
    expect(['none', 'hidden']).toContain(toggleRowBorderTop);

    // Expandable toggle button shows summary "Hans & Laura Schmidt" without "Eltern" label and without a box around it
    const parentsToggleBtn = page.locator('.overview-parents-toggle-btn').filter({ hasText: 'Hans & Laura Schmidt' });
    await expect(parentsToggleBtn).toBeVisible();
    await expect(parentsToggleBtn).toContainText('Hans & Laura Schmidt');
    await expect(parentsToggleBtn.locator('.overview-parents-toggle-badge')).toHaveCount(0);
    expect(await parentsToggleBtn.innerText()).not.toContain('Eltern');

    const toggleBorder = await parentsToggleBtn.evaluate((el) => getComputedStyle(el).borderStyle);
    expect(['none', 'hidden']).toContain(toggleBorder);

    const toggleBtnBg = await parentsToggleBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(toggleBtnBg);

    // Verify background remains constant on hover and click
    await parentsToggleBtn.hover();
    const hoverBtnBg = await parentsToggleBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(hoverBtnBg).toBe(toggleBtnBg);

    const toggleRowHoverBg = await parentsToggleRow.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(toggleRowHoverBg);

    // While collapsed: parent cards in group mode are hidden
    const collapsedHansRow = page.locator('tr.overview-group-parent-row', { hasText: 'Hans Schmidt' });
    const collapsedLauraRow = page.locator('tr.overview-group-parent-row', { hasText: 'Laura Schmidt' });
    await expect(collapsedHansRow).toBeHidden();
    await expect(collapsedLauraRow).toBeHidden();

    // Click to expand parents
    await parentsToggleBtn.click();
    await expect(collapsedHansRow).toBeVisible();
    await expect(collapsedLauraRow).toBeVisible();

    const afterClickBtnBg = await parentsToggleBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(afterClickBtnBg).toBe(toggleBtnBg);

    // Expanded parent card has no box (no border-left) and no separate background
    const expandedHansBorderLeft = await collapsedHansRow.evaluate((el) => getComputedStyle(el).borderLeftStyle);
    expect(['none', 'hidden']).toContain(expandedHansBorderLeft);

    const expandedHansBg = await collapsedHansRow.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(expandedHansBg);

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
    await expect(page.locator('.overview-parents-toggle-row').first()).toBeHidden();
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

    // Verify phone and email links on desktop table view
    const dtHansPhoneLink = desktopHansRow.locator('a.overview-contact-link[href^="tel:"]');
    await expect(dtHansPhoneLink).toBeVisible();
    await expect(dtHansPhoneLink).toHaveAttribute('href', 'tel:01711234567');

    const dtHansEmailLink = desktopHansRow.locator('a.overview-contact-link[href^="mailto:"]');
    await expect(dtHansEmailLink).toBeVisible();
    await expect(dtHansEmailLink).toHaveAttribute('href', 'mailto:hans.schmidt@tollhaus-stuttgart.de');

    // Verify e-mail symbol and home symbol are NOT visible in desktop table view
    await expect(desktopHansRow.locator('td').nth(2).locator('.overview-contact-symbol')).not.toBeVisible();
    await expect(desktopHansRow.locator('td').nth(3).locator('.overview-contact-symbol')).not.toBeVisible();

    // 6. Verify links from familiesOverview to Eltern(MGA) and Kinder(MGA) for users with families.all.read permission
    const hansParentLink = desktopHansRow.locator('.family-parent-link.overview-mga-link');
    await expect(hansParentLink).toBeVisible();
    await expect(hansParentLink).toHaveText('MGA');
    await hansParentLink.click();
    await expect(page.getByRole('button', { name: 'Eltern(MGA)', exact: true })).toHaveClass(/active/);

    // Return to familiesOverview and test child link
    await overviewTab.click();
    await expect(overviewTab).toHaveClass(/active/);
    const desktopMiaRow = page.locator('tr.overview-child-row', { hasText: 'Mia' });
    const miaChildLink = desktopMiaRow.locator('.family-child-link.overview-mga-link');
    await expect(miaChildLink).toBeVisible();
    await expect(miaChildLink).toHaveText('MGA');
    await miaChildLink.click();
    await expect(page.getByRole('button', { name: 'Kinder(MGA)', exact: true })).toHaveClass(/active/);
  });
});
