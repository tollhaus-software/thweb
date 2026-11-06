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
    const overviewTab = page.locator('.sidebar-nav-item', { hasText: 'Familien' });
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

    // Verify default grouping is "Gruppen"
    await expect(page.locator('.overview-grouping-btn', { hasText: 'Gruppen' })).toHaveAttribute('aria-pressed', 'true');

    // Switch to "Familien" grouping mode to verify parent and child card rendering in family mode
    await page.locator('.overview-grouping-btn', { hasText: 'Familien' }).click();

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

    // Verify all icons for a parent are aligned under each other
    const phoneIconBox = await hansRow.locator('.phone-type-symbol').boundingBox();
    const emailIconBox = await hansRow.locator('.overview-contact-symbol').filter({ hasText: '@' }).boundingBox();
    const homeIconBox = await hansRow.locator('.overview-contact-symbol').filter({ hasText: '🏠' }).boundingBox();
    expect(phoneIconBox).not.toBeNull();
    expect(emailIconBox).not.toBeNull();
    expect(homeIconBox).not.toBeNull();
    if (phoneIconBox && emailIconBox && homeIconBox) {
      expect(Math.abs(phoneIconBox.x - emailIconBox.x)).toBeLessThan(2);
      expect(Math.abs(emailIconBox.x - homeIconBox.x)).toBeLessThan(2);
      expect(phoneIconBox.width).toBe(emailIconBox.width);
      expect(emailIconBox.width).toBe(homeIconBox.width);
    }

    // Verify all data fields after the icon are aligned under each other
    const phoneTextBox = await hansPhoneLink.boundingBox();
    const emailTextBox = await hansEmailLink.boundingBox();
    const homeTextBox = await hansRow.locator('td').nth(3).locator('.overview-entry-content').boundingBox();
    expect(phoneTextBox).not.toBeNull();
    expect(emailTextBox).not.toBeNull();
    expect(homeTextBox).not.toBeNull();
    if (phoneTextBox && emailTextBox && homeTextBox) {
      expect(Math.abs(phoneTextBox.x - emailTextBox.x)).toBeLessThan(2);
      expect(Math.abs(emailTextBox.x - homeTextBox.x)).toBeLessThan(2);
    }

    // Verify Hans has no job assigned: job line must be omitted (only 4 lines for Hans)
    await expect(hansRow.locator('.job-type-symbol')).toHaveCount(0);
    await expect(hansRow.locator('td')).toHaveCount(4);

    // Verify MGA link in parent row is right-aligned in its row
    const hansCardBox = await hansRow.boundingBox();
    const hansMgaLink = hansRow.locator('.family-parent-link.overview-mga-link');
    await expect(hansMgaLink).toBeVisible();
    const hansMgaBox = await hansMgaLink.boundingBox();
    expect(hansCardBox).not.toBeNull();
    expect(hansMgaBox).not.toBeNull();
    if (hansCardBox && hansMgaBox) {
      expect(hansMgaBox.x + hansMgaBox.width).toBeGreaterThan(hansCardBox.x + hansCardBox.width - 40);
    }

    // Verify child row is rendered as a compact card with group badge
    const miaRow = page.locator('tr.overview-child-row', { hasText: 'Mia' });
    await expect(miaRow).toBeVisible();
    const miaDisplay = await miaRow.evaluate((el) => getComputedStyle(el).display);
    expect(miaDisplay).toBe('flex');

    // Group badge for children in the "by family view" should be smaller and right next to child
    const groupBadge = miaRow.locator('.overview-child-group-badge');
    await expect(groupBadge).toBeVisible();
    await expect(groupBadge).toContainText('Kleine Gr.');
    const miaRowBox = await miaRow.boundingBox();
    const groupBadgeBox = await groupBadge.boundingBox();
    expect(miaRowBox).not.toBeNull();
    expect(groupBadgeBox).not.toBeNull();
    if (miaRowBox && groupBadgeBox) {
      // Badge is positioned near the left, immediately after child name
      expect(groupBadgeBox.x).toBeGreaterThan(miaRowBox.x);
      expect(groupBadgeBox.x).toBeLessThan(miaRowBox.x + 80);
    }
    const badgeFontSize = await groupBadge.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(badgeFontSize).toBeLessThanOrEqual(13);

    // Verify MGA link in child row is right-aligned in its row
    const miaMgaLink = miaRow.locator('.family-child-link.overview-mga-link');
    await expect(miaMgaLink).toBeVisible();
    const miaMgaBox = await miaMgaLink.boundingBox();
    expect(miaMgaBox).not.toBeNull();
    if (miaRowBox && miaMgaBox && groupBadgeBox) {
      expect(miaMgaBox.x + miaMgaBox.width).toBeGreaterThan(miaRowBox.x + miaRowBox.width - 40);
      expect(miaMgaBox.x).toBeGreaterThan(groupBadgeBox.x + 200);
    }

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

    // 4. Test "Gruppen" grouping toggle in mobile card view with expandable parents
    await page.locator('.overview-grouping-btn', { hasText: 'Gruppen' }).click();
    const groupHeaderRow = page.locator('tr.family-group-row', { hasText: 'Kleine Gruppe' });
    await expect(groupHeaderRow).toBeVisible();
    const groupHeaderDisplay = await groupHeaderRow.evaluate((el) => getComputedStyle(el).display);
    expect(groupHeaderDisplay).toBe('block');

    // Verify group sub headings: not uppercase, bold, no separate background, not in a box
    const ghTextTransform = await groupHeaderRow.locator('td').evaluate((el) => getComputedStyle(el).textTransform);
    expect(ghTextTransform).toBe('none');
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

    // In "by group" display, the group badge is shown next to the child's name
    const miaGroupBadge = miaGroupCard.locator('.overview-child-group-badge');
    await expect(miaGroupBadge).toBeVisible();
    await expect(miaGroupBadge).toHaveText('Kleine Gr.');

    const felixGroupCard = page.locator('tr.overview-child-row', { hasText: 'Felix Weber' });
    await expect(felixGroupCard).toBeVisible();
    const felixGroupBadge = felixGroupCard.locator('.overview-child-group-badge');
    await expect(felixGroupBadge).toBeVisible();
    await expect(felixGroupBadge).toHaveText('Kleine Gr.');

    // In "by group" view, all parents should be visible all the time with no expand/collapse toggle
    await expect(page.locator('.overview-parents-toggle-row')).toHaveCount(0);
    await expect(page.locator('.overview-parents-toggle-btn')).toHaveCount(0);

    // Both parents in family Schmidt are visible directly inside groupCard0
    const groupHansRow = groupCard0.locator('tr.overview-parent-row', { hasText: 'Hans Schmidt' });
    const groupLauraRow = groupCard0.locator('tr.overview-parent-row', { hasText: 'Laura Schmidt' });
    await expect(groupHansRow).toBeVisible();
    await expect(groupLauraRow).toBeVisible();

    const groupHansDisplay = await groupHansRow.evaluate((el) => getComputedStyle(el).display);
    const groupHansFlexDirection = await groupHansRow.evaluate((el) => getComputedStyle(el).flexDirection);
    expect(groupHansDisplay).toBe('flex');
    expect(groupHansFlexDirection).toBe('column');

    const groupHansBg = await groupHansRow.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(groupHansBg);

    // Parent in family Weber is also visible directly inside groupCard1
    const groupThomasRow = groupCard1.locator('tr.overview-parent-row', { hasText: 'Thomas Weber' });
    await expect(groupThomasRow).toBeVisible();

    // 5. Resize to desktop viewport (> 768px)
    await page.setViewportSize({ width: 1200, height: 800 });

    // On desktop in "Nach Gruppe": parent rows are visible as table rows
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
