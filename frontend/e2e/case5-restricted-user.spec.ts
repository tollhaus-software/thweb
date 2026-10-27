import { test, expect } from '@playwright/test';

test.describe('Test Case 5: Restricted Users Support', () => {
  test('verifies restricted user access, overview tab, read-only group changes, and scoped childcare fees', async ({ request, page }) => {
    // Step 1: Reset database
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // Step 2: Use admin (developer@example.com) to seed families and parents with identifier email
    const createFam1Res = await request.post('/api/families', {
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
              {
                value: 'hans.second@example.com',
                identifier_email: false,
                address_list: true,
              },
              {
                value: 'secret.hans@example.com',
                identifier_email: false,
                address_list: false,
              },
            ],
            phones: [
              {
                value: '0171 1234567',
                address_list: true,
              },
              {
                value: '0711 998877',
                address_list: true,
              },
            ],
          },
        ],
      },
    });
    expect(createFam1Res.ok()).toBeTruthy();
    const fam1 = await createFam1Res.json();
    const miaChildId = crypto.randomUUID();

    const createMiaRes = await request.post(`/api/families/${fam1.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: miaChildId,
        family_id: fam1.id,
        first_name: 'Mia',
        last_name: 'Schmidt',
        birth_date: '2021-04-10',
      },
    });
    expect(createMiaRes.ok()).toBeTruthy();

    // Add group change for Mia (Gruppe 1 starting today)
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

    // Create a second family: Müller / Weber (two surnames) with child Tom Müller
    const createFam2Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Lisa',
            last_name: 'Müller',
            address: 'Schlossplatz 5, 70173 Stuttgart',
            emails: [
              {
                value: 'lisa.mueller@example.com',
                identifier_email: true,
                address_list: true,
              },
            ],
            phones: [
              {
                value: '0172 9876543',
                address_list: true,
              },
            ],
          },
          {
            first_name: 'Max',
            last_name: 'Weber',
            address: 'Schlossplatz 5, 70173 Stuttgart',
          },
        ],
      },
    });
    expect(createFam2Res.ok()).toBeTruthy();
    const fam2 = await createFam2Res.json();
    const tomChildId = crypto.randomUUID();

    const createTomRes = await request.post(`/api/families/${fam2.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: tomChildId,
        family_id: fam2.id,
        first_name: 'Tom',
        last_name: 'Müller',
        birth_date: '2020-02-15',
      },
    });
    expect(createTomRes.ok()).toBeTruthy();

    // Add group change for Tom as well
    await request.post(`/api/children/${tomChildId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        child_id: tomChildId,
        change_date: todayStr,
        target_group: 2,
      },
    });

    // Step 3: Authenticate as the restricted user (hans.schmidt@tollhaus-stuttgart.de)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'hans.schmidt@tollhaus-stuttgart.de');
    });

    // Step 4: Load application
    await page.goto('/');

    // Verify Tab visibility:
    // - "Familien" (familiesOverview) must be visible
    const familiesOverviewTab = page.getByRole('button', { name: 'Familien', exact: true });
    await expect(familiesOverviewTab).toBeVisible();

    // - MGA tabs must NOT be visible
    await expect(page.getByRole('button', { name: 'Familien(MGA)' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eltern(MGA)' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kinder(MGA)' })).toHaveCount(0);

    // - "Betreuungsgebühren" must be visible
    const feesTab = page.getByRole('button', { name: 'Betreuungsgebühren' });
    await expect(feesTab).toBeVisible();

    // - Admin and Historie tabs must NOT be visible
    await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Historie' })).toHaveCount(0);

    // Verify no "Familie hinzufügen" button
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toHaveCount(0);

    // Verify familiesOverview table has NO table header with column names and has fixed name column (sticky-col)
    await expect(page.locator('table.data-table thead')).toHaveCount(0);
    await expect(page.locator('table.data-table th')).toHaveCount(0);
    await expect(page.locator('table.data-table td.sticky-col').first()).toBeVisible();

    // Verify family group header rows are rendered in overview
    const schmidtHeaderRow = page.locator('tr.family-group-row', { hasText: 'Schmidt' });
    await expect(schmidtHeaderRow).toBeVisible();

    // Verify parent rows are rendered as separate rows with overview-parent-row class
    const hansRow = page.locator('tr.overview-parent-row', { hasText: 'Hans Schmidt' });
    const lisaRow = page.locator('tr.overview-parent-row', { hasText: 'Lisa Müller' });
    await expect(hansRow).toBeVisible();
    await expect(lisaRow).toBeVisible();

    // Parent rows must have the same background color as the family sub-header
    const headerBg = await schmidtHeaderRow.locator('td').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const hansBg = await hansRow.locator('td').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const hansCol2Bg = await hansRow.locator('td').nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(hansBg).toBe(headerBg);
    expect(hansCol2Bg).toBe(headerBg);

    // Verify Hans Schmidt's 4 columns: Name, Phone(s) newline-separated, 📧 Email(s) newline-separated, 🏠 Address
    await expect(hansRow.locator('td').nth(0)).toHaveText('Hans Schmidt');
    await expect(hansRow.locator('td').nth(1)).toContainText('0171 1234567');
    await expect(hansRow.locator('td').nth(1)).toContainText('0711 998877');
    await expect(hansRow.locator('td').nth(2)).toContainText('📧');
    await expect(hansRow.locator('td').nth(2)).toContainText('hans.schmidt@tollhaus-stuttgart.de\nhans.second@example.com');
    // Secret non-address-list email must NOT be shown
    await expect(hansRow).not.toContainText('secret.hans@example.com');
    await expect(hansRow.locator('td').nth(3)).toContainText('🏠');
    await expect(hansRow.locator('td').nth(3)).toContainText('Königstraße 10, 70173 Stuttgart');

    // No 📞 symbol because each phone number has its own type-dependent symbol.
    await expect(hansRow.locator('td').nth(1).locator('.overview-contact-symbol')).toHaveCount(0);
    // Only one 📧 symbol for multiple newline-separated entries, vertically centered
    const hansEmailSymbol = hansRow.locator('td').nth(2).locator('.overview-contact-symbol');
    await expect(hansEmailSymbol).toHaveCount(1);
    await expect(hansEmailSymbol).toBeVisible();
    const emailSymbolBox = await hansEmailSymbol.boundingBox();
    const emailCellBox = await hansRow.locator('td').nth(2).boundingBox();
    expect(emailSymbolBox).not.toBeNull();
    expect(emailCellBox).not.toBeNull();
    if (emailSymbolBox && emailCellBox) {
      const symbolCenterY = emailSymbolBox.y + emailSymbolBox.height / 2;
      const cellCenterY = emailCellBox.y + emailCellBox.height / 2;
      expect(Math.abs(symbolCenterY - cellCenterY)).toBeLessThan(4);
    }

    // Verify all parent columns and symbols are aligned across parent rows (with child rows in between)
    for (let colIdx = 0; colIdx < 4; colIdx++) {
      const box1 = await hansRow.locator('td').nth(colIdx).boundingBox();
      const box2 = await lisaRow.locator('td').nth(colIdx).boundingBox();
      expect(box1).not.toBeNull();
      expect(box2).not.toBeNull();
      if (box1 && box2) {
        expect(Math.abs(box1.x - box2.x)).toBeLessThan(1);
      }
    }
    for (let symCol = 2; symCol <= 3; symCol++) {
      const sym1 = await hansRow.locator('td').nth(symCol).locator('.overview-contact-symbol').boundingBox();
      const sym2 = await lisaRow.locator('td').nth(symCol).locator('.overview-contact-symbol').boundingBox();
      expect(sym1).not.toBeNull();
      expect(sym2).not.toBeNull();
      if (sym1 && sym2) {
        expect(Math.abs(sym1.x - sym2.x)).toBeLessThan(1);
      }
    }

    // Verify NO jump links to parent or child tabs exist
    await expect(page.locator('.family-parent-link')).toHaveCount(0);
    await expect(page.locator('.family-child-link')).toHaveCount(0);

    // Verify NO "+ Kind" or "+ Elternteil" buttons
    await expect(page.getByRole('button', { name: '+ Kind' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Elternteil' })).toHaveCount(0);

    // Check Mia Schmidt's row (own family child, single surname in family -> surname omitted, indented)
    const miaRow = page.locator('tr.overview-child-row', { hasText: 'Mia' });
    await expect(miaRow).toBeVisible();
    await expect(miaRow.locator('td').first()).toHaveText('Mia');
    // Child name span is indented to the right relative to parent name span
    const hansNamePadding = await hansRow.locator('td').first().locator('span').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    const miaNamePadding = await miaRow.locator('td').first().locator('span').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(miaNamePadding).toBeGreaterThan(hansNamePadding);
    // Child rows have different background color from parent rows
    const miaBg = await miaRow.locator('td').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(miaBg).not.toBe(hansBg);
    // For own child, current group is displayed simply as "<group name>" (e.g. "Kleine Gr.")
    await expect(miaRow).toContainText('Kleine Gr.');
    // Must NOT contain extended duration/date text like "seit" or "(1J"
    await expect(miaRow).not.toContainText('seit');

    // Clicking does NOT open any popover editor
    await miaRow.click();
    await expect(page.locator('div[style*="position: fixed"]')).toHaveCount(0);

    // Check Tom Müller's row (other family child, family has two surnames Müller / Weber -> surname kept)
    const tomRow = page.locator('tr.overview-child-row', { hasText: 'Tom' });
    await expect(tomRow).toBeVisible();
    await expect(tomRow.locator('td').first()).toHaveText('Tom Müller');
    // For other family child, current group is also shown (without exposing full group change history)
    await expect(tomRow.locator('td').last()).toContainText('Grosse Gr.');

    // Toggle grouping to "Nach Gruppe" and verify group headers and family block layout
    await page.getByRole('button', { name: 'Nach Gruppe' }).click();
    await expect(page.locator('tr.family-group-row', { hasText: 'Kleine Gruppe' })).toBeVisible();
    await expect(page.locator('tr.family-group-row', { hasText: 'Große Gruppe' })).toBeVisible();
    // Empty groups are not shown
    await expect(page.locator('tr.family-group-row', { hasText: 'Hort' })).toHaveCount(0);
    await expect(page.locator('tr.family-group-row', { hasText: 'Noch keine Gruppe' })).toHaveCount(0);
    await expect(page.locator('tr.family-group-row', { hasText: 'Ehemalige' })).toHaveCount(0);
    // In "Nach Gruppe" mode, Mia's row displays her full name ("Mia Schmidt") and empty 2nd column
    const miaByGroupRow = page.locator('tr.overview-child-row', { hasText: 'Mia Schmidt' });
    const hansByGroupRow = page.locator('tr.overview-parent-row', { hasText: 'Hans Schmidt' }).first();
    await expect(miaByGroupRow).toBeVisible();
    await expect(miaByGroupRow.locator('td').nth(1)).toHaveText('');
    // Opposite indentation: child name is non-indented, parent name is indented
    const miaGroupPadding = await miaByGroupRow.locator('td').first().locator('span').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    const hansGroupPadding = await hansByGroupRow.locator('td').first().locator('span').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(miaGroupPadding).toBe(0);
    expect(hansGroupPadding).toBeGreaterThan(miaGroupPadding);
    // Child and parent rows have no special background color in "Nach Gruppe" mode
    const miaGroupBg = await miaByGroupRow.locator('td').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const hansGroupBg = await hansByGroupRow.locator('td').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(hansGroupBg).toBe(miaGroupBg);
    // Switch back to "Nach Familie"
    await page.getByRole('button', { name: 'Nach Familie' }).click();

    // Step 5: Switch to "Betreuungsgebühren" tab
    await feesTab.click();

    // In restricted mode:
    // - Family selection accordion must NOT be visible
    await expect(page.getByText('Familienauswahl')).toHaveCount(0);

    // - Table header must be "Monatliche Betreuungsgebühren"
    await expect(page.getByRole('heading', { name: 'Monatliche Betreuungsgebühren' })).toBeVisible();

    // - Fees table displays fees for Schmidt only
    const feesTable = page.locator('table').first();
    await expect(feesTable).toBeVisible();
    await expect(feesTable).toContainText('Schmidt');
    await expect(feesTable).not.toContainText('Müller');
  });

  test('verifies sort order of families, parents, and children in familiesOverview', async ({ request, page }) => {
    // 1. Reset DB
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const todayStr = new Date().toISOString().split('T')[0];

    // Seed Family 1: "Becker" with parents "Zack" and "Alice", and 3 children born in different years
    const createBeckerRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Zack',
            last_name: 'Becker',
            emails: [{ value: 'zack.becker@example.com', identifier_email: true, address_list: true }],
            phones: [{ value: '111', address_list: true }],
          },
          {
            first_name: 'Alice',
            last_name: 'Becker',
            emails: [{ value: 'alice.becker@example.com', identifier_email: false, address_list: true }],
            phones: [{ value: '222', address_list: true }],
          },
        ],
      },
    });
    expect(createBeckerRes.ok()).toBeTruthy();
    const beckerFam = await createBeckerRes.json();

    // Create children out of birthdate order: Zoe (2022), Ben (2018), Clara (2020)
    const zoeId = crypto.randomUUID();
    await request.post(`/api/families/${beckerFam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: zoeId, family_id: beckerFam.id, first_name: 'Zoe', last_name: 'Becker', birth_date: '2022-03-01' },
    });
    await request.post(`/api/children/${zoeId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: zoeId, change_date: todayStr, target_group: 1 },
    });

    const benId = crypto.randomUUID();
    await request.post(`/api/families/${beckerFam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: benId, family_id: beckerFam.id, first_name: 'Ben', last_name: 'Becker', birth_date: '2018-06-15' },
    });
    await request.post(`/api/children/${benId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: benId, change_date: todayStr, target_group: 1 },
    });

    const claraId = crypto.randomUUID();
    await request.post(`/api/families/${beckerFam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: claraId, family_id: beckerFam.id, first_name: 'Clara', last_name: 'Becker', birth_date: '2020-01-10' },
    });
    await request.post(`/api/children/${claraId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: claraId, change_date: todayStr, target_group: 1 },
    });

    // Seed Family 2: "Adams" (should sort BEFORE "Becker" alphabetically)
    const createAdamsRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Bob',
            last_name: 'Adams',
            emails: [{ value: 'bob.adams@example.com', identifier_email: true, address_list: true }],
            phones: [{ value: '333', address_list: true }],
          },
        ],
      },
    });
    expect(createAdamsRes.ok()).toBeTruthy();
    const adamsFam = await createAdamsRes.json();

    const danId = crypto.randomUUID();
    await request.post(`/api/families/${adamsFam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: danId, family_id: adamsFam.id, first_name: 'Dan', last_name: 'Adams', birth_date: '2019-05-01' },
    });
    await request.post(`/api/children/${danId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: danId, change_date: todayStr, target_group: 1 },
    });

    // Login as restricted user (zack.becker@example.com)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'zack.becker@example.com');
    });
    await page.goto('/');

    const overviewTab = page.getByRole('button', { name: 'Familien', exact: true });
    await expect(overviewTab).toBeVisible();

    // 1. In "By Family" grouping:
    // Families sorted alphabetically: Adams before Becker
    const familyHeaders = page.locator('tr.family-group-row');
    await expect(familyHeaders).toHaveCount(2);
    await expect(familyHeaders.nth(0)).toContainText('Adams');
    await expect(familyHeaders.nth(1)).toContainText('Becker');

    // In Becker family:
    // Parents sorted by given name: Alice before Zack
    const parentRows = page.locator('tr.overview-parent-row');
    // Adams parent (Bob) is in Adams, then Alice and Zack in Becker
    await expect(parentRows.nth(1)).toContainText('Alice Becker');
    await expect(parentRows.nth(2)).toContainText('Zack Becker');

    // Children in Becker family sorted by birth date: Ben (2018) -> Clara (2020) -> Zoe (2022)
    const beckerChildren = page.locator('tr.overview-child-row', { hasText: /Ben|Clara|Zoe/ });
    await expect(beckerChildren).toHaveCount(3);
    await expect(beckerChildren.nth(0)).toContainText('Ben');
    await expect(beckerChildren.nth(1)).toContainText('Clara');
    await expect(beckerChildren.nth(2)).toContainText('Zoe');

    // 2. Switch to "By Group":
    await page.getByRole('button', { name: 'Nach Gruppe' }).click();

    // Within "Kleine Gruppe", families are sorted alphabetically: Adams before Becker
    // In Becker family group, children are sorted by birth date: Ben -> Clara -> Zoe
    const groupBeckerChildren = page.locator('tr.overview-child-row', { hasText: /Becker/ });
    await expect(groupBeckerChildren).toHaveCount(3);
    await expect(groupBeckerChildren.nth(0)).toContainText('Ben Becker');
    await expect(groupBeckerChildren.nth(1)).toContainText('Clara Becker');
    await expect(groupBeckerChildren.nth(2)).toContainText('Zoe Becker');
  });
});
