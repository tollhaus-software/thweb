import { test, expect } from '@playwright/test';

test.describe('Test Case 9: Adaptive Cards & Bottom-Sheet Popovers for Parents, Children, and Families Tabs', () => {
  test('renders cards with labeled rows on mobile and opens popovers as bottom-sheets', async ({ request, page }) => {
    // 1. Reset DB state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Create family with parent and child
    const createFamRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Sabine',
            last_name: 'Müller',
            address: 'Hauptstraße 15, 70173 Stuttgart',
            emails: [
              {
                value: 'sabine.mueller@example.com',
                identifier_email: true,
                address_list: true,
              },
            ],
            phones: [
              {
                value: '0171 9988776',
                address_list: true,
              },
            ],
          },
        ],
      },
    });
    expect(createFamRes.ok()).toBeTruthy();
    const fam = await createFamRes.json();

    const timChildId = crypto.randomUUID();
    const createTimRes = await request.post(`/api/families/${fam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: timChildId,
        family_id: fam.id,
        first_name: 'Tim',
        last_name: 'Müller',
        birth_date: '2020-05-12',
      },
    });
    expect(createTimRes.ok()).toBeTruthy();

    const todayStr = new Date().toISOString().split('T')[0];
    const addGcRes = await request.post(`/api/children/${timChildId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        child_id: timChildId,
        change_date: todayStr,
        target_group: 2,
      },
    });
    expect(addGcRes.ok()).toBeTruthy();

    // 3. Set mobile viewport and authenticate
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');

    // -------------------------------------------------------------
    // Test Parents Tab on Mobile
    // -------------------------------------------------------------
    const parentsTab = page.getByRole('button', { name: 'Eltern(MGA)', exact: true });
    await expect(parentsTab).toBeVisible();
    await parentsTab.click();
    await expect(parentsTab).toHaveClass(/active/);

    // Verify parents table thead is hidden on mobile
    const parentsThead = page.locator('.parents-table thead');
    await expect(parentsThead).toBeHidden();

    // Verify parent row is rendered as a flex-column card
    const sabineRow = page.locator('.parents-table tbody tr:not(.family-group-row)', { hasText: 'Sabine' });
    await expect(sabineRow).toBeVisible();
    const sabineDisplay = await sabineRow.evaluate((el) => getComputedStyle(el).display);
    const sabineFlexDirection = await sabineRow.evaluate((el) => getComputedStyle(el).flexDirection);
    expect(sabineDisplay).toBe('flex');
    expect(sabineFlexDirection).toBe('column');

    // Verify parent card header with full person name in bold
    const parentCardHeader = sabineRow.locator('.card-person-header');
    await expect(parentCardHeader).toBeVisible();
    await expect(parentCardHeader).toHaveText('Sabine Müller');
    const pWeight = await parentCardHeader.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(parseInt(pWeight, 10)).toBeGreaterThanOrEqual(700);

    // Verify data-label attributes are set on cells
    const firstNameCell = sabineRow.locator('td[data-column-id="first_name"]');
    await expect(firstNameCell).toHaveAttribute('data-label', /Vorname/i);
    await expect(firstNameCell).not.toHaveClass(/sticky-col/);

    const emailCell = sabineRow.locator('td[data-column-id="emails"]');
    await expect(emailCell).toHaveAttribute('data-label', /E-Mail/i);

    const phoneCell = sabineRow.locator('td[data-column-id="phones"]');
    await expect(phoneCell).toHaveAttribute('data-label', 'Tel.');

    const membershipCell = sabineRow.locator('td[data-column-id="th_membership"]');
    await expect(membershipCell).toHaveAttribute('data-label', 'Mitglied');

    // Verify pencil buttons in parent card are consistently sized (13x13) and horizontally aligned
    const parentPencilButtons = sabineRow.locator('.cell-edit-pencil-btn, .easy-edit-view-button-wrapper button');
    const parentPencilCount = await parentPencilButtons.count();
    expect(parentPencilCount).toBeGreaterThanOrEqual(4);
    const parentRightEdges: number[] = [];
    for (let i = 0; i < parentPencilCount; i++) {
      const btn = parentPencilButtons.nth(i);
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        parentRightEdges.push(box.x + box.width);
      }
      const svg = btn.locator('svg');
      await expect(svg).toHaveAttribute('width', '13');
      await expect(svg).toHaveAttribute('height', '13');
    }
    // Verify all pencil buttons align at the exact same right horizontal coordinate
    for (let i = 1; i < parentRightEdges.length; i++) {
      expect(Math.abs(parentRightEdges[i] - parentRightEdges[0])).toBeLessThan(3);
    }

    // Verify "Add family" is next to the search box ("Familien suchen" text box)
    const parentsAddFamilyBtn = page.getByRole('button', { name: 'Familie hinzufügen' });
    const searchInput = page.locator('.search-input');
    await expect(parentsAddFamilyBtn).toBeVisible();
    await expect(searchInput).toBeVisible();
    const pAddBox = await parentsAddFamilyBtn.boundingBox();
    const searchBox = await searchInput.boundingBox();
    expect(pAddBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    if (pAddBox && searchBox) {
      expect(pAddBox.x).toBeGreaterThan(searchBox.x);
      expect(Math.abs(pAddBox.y - searchBox.y)).toBeLessThan(6);
    }

    // Verify Impfstatus button label says "Impfstatus"
    const impfBtn = page.getByRole('button', { name: 'Impfstatus' });
    await expect(impfBtn).toBeVisible();
    await expect(impfBtn).toHaveText('Impfstatus');

    // In cards view: verify "Columns" is to the right of the "Impfstatus" button
    const parentsColumnsBtn = page.getByRole('button', { name: 'Spalten' });
    await expect(parentsColumnsBtn).toBeVisible();
    const impfBox = await impfBtn.boundingBox();
    const pColBox = await parentsColumnsBtn.boundingBox();
    expect(impfBox).not.toBeNull();
    expect(pColBox).not.toBeNull();
    if (impfBox && pColBox) {
      expect(pColBox.x).toBeGreaterThan(impfBox.x);
      expect(Math.abs(pColBox.y - impfBox.y)).toBeLessThan(6);
    }

    // Test opening column selector on mobile
    await parentsColumnsBtn.click();
    const colSheet = page.locator('.cell-popover-bottom-sheet');
    await expect(colSheet).toBeVisible();
    await expect(colSheet).toContainText(/Spalten.*ausblenden/i);
    await page.keyboard.press('Escape');
    await expect(colSheet).toBeHidden();

    // Verify Popover opens as a Bottom Sheet with backdrop on mobile
    await emailCell.click();

    const mobileBackdrop = page.locator('.cell-popover-mobile-backdrop');
    await expect(mobileBackdrop).toBeVisible();

    const bottomSheet = page.locator('.cell-popover-bottom-sheet');
    await expect(bottomSheet).toBeVisible();
    await expect(bottomSheet).toContainText('sabine.mueller@example.com');

    // Verify bottom sheet touches the bottom edge and spans full width
    const sheetBox = await bottomSheet.boundingBox();
    expect(sheetBox).not.toBeNull();
    if (sheetBox) {
      expect(sheetBox.width).toBeCloseTo(500, 0);
      expect(Math.round(sheetBox.y + sheetBox.height)).toBeGreaterThanOrEqual(790);
    }

    // Close bottom sheet by clicking backdrop
    await mobileBackdrop.click({ position: { x: 20, y: 20 } });
    await expect(bottomSheet).toBeHidden();

    // Inline edit in mobile card view
    const editBtn = firstNameCell.locator('.easy-edit-button').first();
    await editBtn.click();
    const nameInput = firstNameCell.locator('input[type="text"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Sabina');
    await nameInput.press('Enter');
    await expect(sabineRow).toContainText('Sabina');
    await expect(parentCardHeader).toHaveText('Sabina Müller');

    // -------------------------------------------------------------
    // Test Children Tab on Mobile
    // -------------------------------------------------------------
    const childrenTab = page.getByRole('button', { name: 'Kinder(MGA)', exact: true });
    await expect(childrenTab).toBeVisible();
    await childrenTab.click();
    await expect(childrenTab).toHaveClass(/active/);

    // Verify "Add family" is next to the search box in Children tab
    const childrenAddFamilyBtn = page.getByRole('button', { name: 'Familie hinzufügen' });
    const cSearchInput = page.locator('.search-input');
    await expect(childrenAddFamilyBtn).toBeVisible();
    await expect(cSearchInput).toBeVisible();
    const cAddBox = await childrenAddFamilyBtn.boundingBox();
    const cSearchBox = await cSearchInput.boundingBox();
    expect(cAddBox).not.toBeNull();
    expect(cSearchBox).not.toBeNull();
    if (cAddBox && cSearchBox) {
      expect(cAddBox.x).toBeGreaterThan(cSearchBox.x);
      expect(Math.abs(cAddBox.y - cSearchBox.y)).toBeLessThan(6);
    }

    // In cards view: verify "Columns" is to the right of the "Impfstatus" button in Children tab
    const cImpfBtn = page.getByRole('button', { name: 'Impfstatus' });
    const childrenColumnsBtn = page.getByRole('button', { name: 'Spalten' });
    await expect(cImpfBtn).toBeVisible();
    await expect(childrenColumnsBtn).toBeVisible();
    const cImpfBox = await cImpfBtn.boundingBox();
    const cColBox = await childrenColumnsBtn.boundingBox();
    expect(cImpfBox).not.toBeNull();
    expect(cColBox).not.toBeNull();
    if (cImpfBox && cColBox) {
      expect(cColBox.x).toBeGreaterThan(cImpfBox.x);
      expect(Math.abs(cColBox.y - cImpfBox.y)).toBeLessThan(6);
    }

    // Verify child row renders as a card
    const timRow = page.locator('.children-table tbody tr:not(.family-group-row)', { hasText: 'Tim' });
    await expect(timRow).toBeVisible();
    const timDisplay = await timRow.evaluate((el) => getComputedStyle(el).display);
    expect(timDisplay).toBe('flex');

    // Verify child card header with full person name in bold
    const childCardHeader = timRow.locator('.card-person-header');
    await expect(childCardHeader).toBeVisible();
    await expect(childCardHeader).toHaveText('Tim Müller');
    const cWeight = await childCardHeader.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(parseInt(cWeight, 10)).toBeGreaterThanOrEqual(700);

    const childFirstNameCell = timRow.locator('td[data-column-id="first_name"]');
    await expect(childFirstNameCell).not.toHaveClass(/sticky-col/);

    const groupCell = timRow.locator('td[data-column-id="group"]');
    await expect(groupCell).toHaveAttribute('data-label', /Gruppe/i);

    // Click group to open GroupChanges bottom sheet
    await groupCell.click();
    await expect(page.locator('.cell-popover-mobile-backdrop')).toBeVisible();
    const groupBottomSheet = page.locator('.cell-popover-bottom-sheet');
    await expect(groupBottomSheet).toBeVisible();
    await expect(groupBottomSheet).toContainText('Grosse Gruppe');

    // Close bottom sheet via Escape
    await page.keyboard.press('Escape');
    await expect(groupBottomSheet).toBeHidden();

    // Verify pencil buttons in child card are consistently sized (13x13) and horizontally aligned
    const childPencilButtons = timRow.locator('.cell-edit-pencil-btn, .easy-edit-view-button-wrapper button');
    const childPencilCount = await childPencilButtons.count();
    expect(childPencilCount).toBeGreaterThanOrEqual(4);
    const childRightEdges: number[] = [];
    for (let i = 0; i < childPencilCount; i++) {
      const btn = childPencilButtons.nth(i);
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        childRightEdges.push(box.x + box.width);
      }
      const svg = btn.locator('svg');
      await expect(svg).toHaveAttribute('width', '13');
      await expect(svg).toHaveAttribute('height', '13');
    }
    // Verify all pencil buttons align at the exact same right horizontal coordinate
    for (let i = 1; i < childRightEdges.length; i++) {
      expect(Math.abs(childRightEdges[i] - childRightEdges[0])).toBeLessThan(3);
    }

    // -------------------------------------------------------------
    // Test Families Tab on Mobile
    // -------------------------------------------------------------
    const familiesTab = page.getByRole('button', { name: 'Familien(MGA)', exact: true });
    await expect(familiesTab).toBeVisible();
    await familiesTab.click();
    await expect(familiesTab).toHaveClass(/active/);

    // Verify "Add family" is next to the search box in Families tab
    const familiesAddFamilyBtn = page.getByRole('button', { name: 'Familie hinzufügen' });
    const fSearchInput = page.locator('.search-input');
    await expect(familiesAddFamilyBtn).toBeVisible();
    await expect(fSearchInput).toBeVisible();
    const fAddBox = await familiesAddFamilyBtn.boundingBox();
    const fSearchBox = await fSearchInput.boundingBox();
    expect(fAddBox).not.toBeNull();
    expect(fSearchBox).not.toBeNull();
    if (fAddBox && fSearchBox) {
      expect(fAddBox.x).toBeGreaterThan(fSearchBox.x);
      expect(Math.abs(fAddBox.y - fSearchBox.y)).toBeLessThan(6);
    }

    // In cards view: verify "Columns" button is visible in controls row
    const familiesColumnsBtn = page.getByRole('button', { name: 'Spalten' });
    await expect(familiesColumnsBtn).toBeVisible();

    // Verify families table renders child row as a card
    const famChildRow = page.locator('.families-table tbody tr:not(.family-group-row)', { hasText: 'Tim Müller' });
    await expect(famChildRow).toBeVisible();
    const famChildDisplay = await famChildRow.evaluate((el) => getComputedStyle(el).display);
    expect(famChildDisplay).toBe('flex');

    // 1. Child name is the header with no "Vorname" field
    const nameCell = famChildRow.locator('td[data-column-id="child_name"]');
    await expect(nameCell).toContainText('Tim Müller');
    const nameBeforeDisplay = await nameCell.evaluate((el) => getComputedStyle(el, '::before').display);
    expect(nameBeforeDisplay).toBe('none');

    // 2. "geb. <birthdate>" under it, left aligned
    const birthCell = famChildRow.locator('td[data-column-id="birth_date"]');
    await expect(birthCell).toContainText('geb. 12.05.2020');
    const birthBeforeDisplay = await birthCell.evaluate((el) => getComputedStyle(el, '::before').display);
    expect(birthBeforeDisplay).toBe('none');

    // 3. "<Group name> (seit <group change date>)" under that
    const groupCellInFam = famChildRow.locator('td[data-column-id="group"]');
    await expect(groupCellInFam).toContainText(/Grosse Gr\. \(seit .+\)/);
    const groupBeforeDisplay = await groupCellInFam.evaluate((el) => getComputedStyle(el, '::before').display);
    expect(groupBeforeDisplay).toBe('none');

    // Verify vertical stacking order: Name -> geb. -> Group
    const nameBox = await nameCell.boundingBox();
    const birthBox = await birthCell.boundingBox();
    const groupBox = await groupCellInFam.boundingBox();
    expect(nameBox).not.toBeNull();
    expect(birthBox).not.toBeNull();
    expect(groupBox).not.toBeNull();
    if (nameBox && birthBox && groupBox) {
      expect(birthBox.y).toBeGreaterThan(nameBox.y);
      expect(groupBox.y).toBeGreaterThan(birthBox.y);
    }

    // Clicking group cell opens bottom sheet
    await groupCellInFam.click();
    await expect(page.locator('.cell-popover-mobile-backdrop')).toBeVisible();
    const memBottomSheet = page.locator('.cell-popover-bottom-sheet');
    await expect(memBottomSheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(memBottomSheet).toBeHidden();

    // -------------------------------------------------------------
    // Test Switch back to Desktop Viewport
    // -------------------------------------------------------------
    await page.setViewportSize({ width: 1200, height: 800 });

    // Verify "Add family" is next to search box on desktop
    const dtAddFamilyBtn = page.getByRole('button', { name: 'Familie hinzufügen' });
    const dtSearchInput = page.locator('.search-input');
    await expect(dtAddFamilyBtn).toBeVisible();
    await expect(dtSearchInput).toBeVisible();
    const dtAddBox = await dtAddFamilyBtn.boundingBox();
    const dtSearchBox = await dtSearchInput.boundingBox();
    expect(dtAddBox).not.toBeNull();
    expect(dtSearchBox).not.toBeNull();
    if (dtAddBox && dtSearchBox) {
      expect(dtAddBox.x).toBeGreaterThan(dtSearchBox.x);
      expect(Math.abs(dtAddBox.y - dtSearchBox.y)).toBeLessThan(6);
    }

    // In table view on desktop: "Columns" is in the header of the table (thead)
    const dtThead = page.locator('.families-table thead');
    await expect(dtThead).toBeVisible();
    const theadColumnsBtn = dtThead.getByRole('button', { name: 'Spalten' });
    await expect(theadColumnsBtn).toBeVisible();
    await theadColumnsBtn.click();
    const dtColPopover = page.locator('.glass-popup');
    await expect(dtColPopover).toBeVisible();
    await expect(dtColPopover).toContainText(/Spalten.*ausblenden/i);
    await page.keyboard.press('Escape');
    await expect(dtColPopover).toBeHidden();

    const dtFamChildRow = page.locator('.families-table tbody tr:not(.family-group-row)', { hasText: 'Tim Müller' });
    await expect(dtFamChildRow).toBeVisible();
    const dtFamChildDisplay = await dtFamChildRow.evaluate((el) => getComputedStyle(el).display);
    expect(dtFamChildDisplay).toBe('table-row');

    // Click popover on desktop: should open standard anchored popover, not bottom sheet
    const dtGroupCell = dtFamChildRow.locator('td[data-column-id="group"]');
    await dtGroupCell.click();
    await expect(page.locator('.cell-popover-mobile-backdrop')).toBeHidden();
    const desktopPopover = page.locator('.glass-popup');
    await expect(desktopPopover).toBeVisible();
    await expect(desktopPopover).not.toHaveClass(/cell-popover-bottom-sheet/);
    await page.keyboard.press('Escape');
    await expect(desktopPopover).toBeHidden();

    // Switch to parents tab on desktop and verify card-person-header is hidden and first_name is not sticky
    const dtParentsTab = page.getByRole('button', { name: 'Eltern(MGA)', exact: true });
    await dtParentsTab.click();
    await expect(page.locator('.parents-table .card-person-header')).toBeHidden();
    await expect(page.locator('.parents-table tbody tr:not(.family-group-row) td[data-column-id="first_name"]').first()).not.toHaveClass(/sticky-col/);
  });
});
