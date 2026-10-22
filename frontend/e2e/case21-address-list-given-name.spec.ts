import { test, expect } from '@playwright/test';

test.describe('Test Case 21: Custom Address List Given Name for Parents and Children', () => {
  test.beforeEach(async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Authenticate as admin user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Load application
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();
  });

  test('verifies custom address list given name popover editing on desktop and mobile, and display on address list', async ({ request, page }) => {
    // 1. Seed family with parents and children via API
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Homer',
            last_name: 'Simpson',
            emails: [{ value: 'homer@example.com', address_list: true }],
            phones: [{ value: '0171 111111', type: 'mobile', address_list: true }],
          },
          {
            first_name: 'Marge',
            last_name: 'Simpson',
            emails: [{ value: 'marge@example.com', address_list: true }],
            phones: [{ value: '0171 222222', type: 'mobile', address_list: true }],
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const family = await famRes.json();

    // Add children to the family
    const child1Id = crypto.randomUUID();
    const child1Res = await request.put(`/api/children/${child1Id}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: child1Id,
        family_id: family.id,
        first_name: 'Bartholomew',
        last_name: 'Simpson',
        birth_date: '2016-04-01',
      },
    });
    expect(child1Res.ok()).toBeTruthy();

    const child2Id = crypto.randomUUID();
    const child2Res = await request.put(`/api/children/${child2Id}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: child2Id,
        family_id: family.id,
        first_name: 'Lisa',
        last_name: 'Simpson',
        birth_date: '2018-05-09',
      },
    });
    expect(child2Res.ok()).toBeTruthy();

    // Reload page to display seeded data
    await page.reload();

    // ==========================================
    // STEP 1: Edit Parent name on desktop
    // ==========================================
    await page.getByRole('button', { name: 'Eltern(MGA)' }).click();
    const homerRow = page.locator('tr').filter({ hasText: 'Homer' }).first();
    await expect(homerRow).toBeVisible();

    const homerFirstNameCell = homerRow.locator('td[data-column-id="first_name"]');
    await expect(homerFirstNameCell).toBeVisible();

    // Click to open popover
    await homerFirstNameCell.locator('.cell-edit-pencil-btn').click();

    // Verify popover appears with two rows
    const popover = page.locator('.glass-popup');
    await expect(popover).toBeVisible();

    const vornameLabel = popover.locator('label', { hasText: 'Vorname:' });
    await expect(vornameLabel).toBeVisible();

    const addrListLabel = popover.locator('label', { hasText: 'Abweichend für Addressliste:' });
    await expect(addrListLabel).toBeVisible();

    const vornameInput = popover.locator('input.first-name-input');
    await expect(vornameInput).toHaveValue('Homer');

    const addrListInput = popover.locator('input.address-list-name-input');
    await expect(addrListInput).toHaveValue('');

    // Fill custom address list given name
    await addrListInput.fill('Homie');

    // Click Speichern
    await popover.locator('button.btn-save').click();
    await expect(popover).toBeHidden();

    // Verify cell shows Homer and badge with Homie
    await expect(homerFirstNameCell).toContainText('Homer');
    await expect(homerFirstNameCell).toContainText('Homie');

    // ==========================================
    // STEP 2: Edit Child name on desktop
    // ==========================================
    await page.getByRole('button', { name: 'Kinder(MGA)' }).click();
    const bartRow = page.locator('tr').filter({ hasText: 'Bartholomew' }).first();
    await expect(bartRow).toBeVisible();

    const bartFirstNameCell = bartRow.locator('td[data-column-id="first_name"]');
    await bartFirstNameCell.click();

    await expect(popover).toBeVisible();
    await expect(popover.locator('label', { hasText: 'Vorname:' })).toBeVisible();
    await expect(popover.locator('label', { hasText: 'Abweichend für Addressliste:' })).toBeVisible();

    const childVornameInput = popover.locator('input.first-name-input');
    await expect(childVornameInput).toHaveValue('Bartholomew');

    const childAddrListInput = popover.locator('input.address-list-name-input');
    await childAddrListInput.fill('Bart');

    // Press Enter to save
    await childAddrListInput.press('Enter');
    await expect(popover).toBeHidden();

    // Verify child cell shows Bartholomew and Bart
    await expect(bartFirstNameCell).toContainText('Bartholomew');
    await expect(bartFirstNameCell).toContainText('Bart');

    // ==========================================
    // STEP 3: Verify display on Address list ("Familien")
    // ==========================================
    const overviewTabBtn = page.getByRole('button', { name: 'Familien', exact: true });
    await overviewTabBtn.click();
    await expect(overviewTabBtn).toHaveClass(/active/);

    // On the address list:
    // Homer should display as "Homie"
    // Bartholomew should display as "Bart"
    // Marge (no override) displays as "Marge"
    // Lisa (no override) displays as "Lisa"
    const overviewTable = page.locator('.overview-table');
    await expect(overviewTable).toBeVisible();

    await expect(overviewTable).toContainText('Homie');
    await expect(overviewTable).not.toContainText('Homer');

    await expect(overviewTable).toContainText('Bart');
    await expect(overviewTable).not.toContainText('Bartholomew');

    await expect(overviewTable).toContainText('Marge');
    await expect(overviewTable).toContainText('Lisa');

    // ==========================================
    // STEP 4: Test small display (under shared breakpoint 768px)
    // ==========================================
    await page.setViewportSize({ width: 500, height: 800 });

    // Navigate to Parents tab on mobile
    await page.getByRole('button', { name: 'Eltern(MGA)' }).click();

    // On mobile card view, locate Marge card
    const margeCard = page.locator('.card-table .parents-table-row, .card-table tbody tr').filter({ hasText: 'Marge' }).first();
    await expect(margeCard).toBeVisible();

    const margeFirstNameCell = margeCard.locator('td[data-column-id="first_name"]');
    await margeFirstNameCell.click();

    // On small displays, popover acts as bottom sheet
    const mobileSheet = page.locator('.cell-popover-bottom-sheet');
    await expect(mobileSheet).toBeVisible();
    await expect(mobileSheet.locator('label', { hasText: 'Vorname:' })).toBeVisible();
    await expect(mobileSheet.locator('label', { hasText: 'Abweichend für Addressliste:' })).toBeVisible();

    // Enter custom address list name for Marge
    const mobileAddrInput = mobileSheet.locator('input.address-list-name-input');
    await mobileAddrInput.fill('Margie');
    await mobileSheet.locator('button.btn-save').click();
    await expect(mobileSheet).toBeHidden();

    // Navigate to Familien overview on mobile
    await overviewTabBtn.click();
    await expect(page.locator('.overview-table')).toContainText('Margie');

    // ==========================================
    // STEP 5: Clear custom address list given name
    // ==========================================
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('button', { name: 'Eltern(MGA)' }).click();

    const updatedHomerRow = page.locator('tr').filter({ hasText: 'Homer' }).first();
    const updatedHomerCell = updatedHomerRow.locator('td[data-column-id="first_name"]');
    await updatedHomerCell.click();

    await expect(popover).toBeVisible();
    const homerAddrInput = popover.locator('input.address-list-name-input');
    await expect(homerAddrInput).toHaveValue('Homie');
    await homerAddrInput.fill('');
    await popover.locator('button.btn-save').click();
    await expect(popover).toBeHidden();

    // On overview tab, Homer should now be displayed as "Homer"
    await overviewTabBtn.click();
    await expect(overviewTable).toContainText('Homer');
    await expect(overviewTable).not.toContainText('Homie');
  });
});
