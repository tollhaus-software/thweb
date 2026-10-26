import { test, expect } from '@playwright/test';

test.describe('Test Case 20: Phone Number Types (Mobile, Landline, Work)', () => {
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

  test('verifies phone types selection requirement, symbols (📱, ☏, 💼), editing, overview display, and defaulting to mobile', async ({ request, page }) => {
    // 1. Create a family via API with one parent who has an existing phone without a type (testing default to mobile)
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Marge',
            last_name: 'Simpson',
            emails: [{ value: 'marge@example.com', address_list: true }],
            phones: [{ value: '0171 000000', address_list: true }], // no type specified!
          },
          {
            first_name: 'Homer',
            last_name: 'Simpson',
            emails: [{ value: 'homer@example.com', address_list: true }],
            phones: [],
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();

    // Reload page to see created family
    await page.reload();

    // Navigate to Parents tab ("Eltern(MGA)")
    await page.getByRole('button', { name: 'Eltern(MGA)' }).click();

    // Verify Marge's phone cell shows 📱 (default to mobile)
    const margeRow = page.locator('tr').filter({ hasText: 'Marge' });
    await expect(margeRow).toBeVisible();
    const margePhoneCell = margeRow.locator('td[data-column-id="phones"]');
    await expect(margePhoneCell).toBeVisible();
    await expect(margePhoneCell).toContainText('📱');
    await expect(margePhoneCell).toContainText('0171 000000');

    // 2. Open Homer's phone cell to add phone numbers
    const homerRow = page.locator('tr').filter({ hasText: 'Homer' });
    await expect(homerRow).toBeVisible();
    const homerPhoneCell = homerRow.locator('td[data-column-id="phones"]');
    await homerPhoneCell.dblclick();

    // MultiValue popover should open
    const popover = page.locator('.multivalue-popover');
    await expect(popover).toBeVisible();

    // 3. User adds a phone number; type defaults to "Mobil" (mobile)
    const addInput = popover.locator('input[type="text"]').last();
    await addInput.fill('0170 1234567');

    // Type selector buttons should be visible
    const mobileBtn = popover.locator('.type-btn-mobile');
    const landlineBtn = popover.locator('.type-btn-landline');
    const workBtn = popover.locator('.type-btn-work');
    await expect(mobileBtn).toBeVisible();
    await expect(landlineBtn).toBeVisible();
    await expect(workBtn).toBeVisible();

    // "Mobil" is pre-selected, so there is no validation error and no explicit selection needed
    await expect(mobileBtn).toHaveClass(/active/);
    await expect(landlineBtn).not.toHaveClass(/active/);
    await expect(workBtn).not.toHaveClass(/active/);

    // 4. Save without changing the type -> stored as mobile
    const saveBtn = popover.locator('.save-add-btn');
    await saveBtn.click();

    // The newly added mobile phone should be in the list with 📱 symbol
    await expect(popover.locator('table')).toContainText('📱');
    await expect(popover.locator('table')).toContainText('0170 1234567');

    // 5. Add a second phone number as "Festnetz" (landline: ☏)
    const addBtn = popover.locator('.add-value-btn');
    await addBtn.click();

    const addInput2 = popover.locator('input[type="text"]').last();
    await addInput2.fill('0711 987654');
    await popover.locator('.type-btn-landline').click();
    await popover.locator('.save-add-btn').click();

    await expect(popover.locator('table')).toContainText('☏');
    await expect(popover.locator('table')).toContainText('0711 987654');

    // 6. Add a third phone number as "Job" (work: 💼)
    await popover.locator('.add-value-btn').click();
    const addInput3 = popover.locator('input[type="text"]').last();
    await addInput3.fill('0711 555000');
    await popover.locator('.type-btn-work').click();
    await popover.locator('.save-add-btn').click();

    await expect(popover.locator('table')).toContainText('💼');
    await expect(popover.locator('table')).toContainText('0711 555000');

    // Close popover
    await page.keyboard.press('Escape');
    await expect(popover).not.toBeVisible();

    // Verify in table cell: all 3 phone numbers with their respective symbols are visible
    await expect(homerPhoneCell).toContainText('📱');
    await expect(homerPhoneCell).toContainText('0170 1234567');
    await expect(homerPhoneCell).toContainText('☏');
    await expect(homerPhoneCell).toContainText('0711 987654');
    await expect(homerPhoneCell).toContainText('💼');
    await expect(homerPhoneCell).toContainText('0711 555000');

    // 7. Edit an existing phone number: change Homer's work number to landline
    await homerPhoneCell.dblclick();
    await expect(popover).toBeVisible();

    const workRowInPopover = popover.locator('tr').filter({ hasText: '0711 555000' });
    await workRowInPopover.locator('.edit-entry-btn').click();

    // The edit type selector should have work selected
    await expect(popover.locator('.type-btn-work.active')).toBeVisible();

    // Switch type to landline (Festnetz)
    await popover.locator('.type-btn-landline').click();
    await popover.locator('.save-edit-btn').click();

    // Verify it now has ☏ symbol
    await expect(popover.locator('tr').filter({ hasText: '0711 555000' })).toContainText('☏');

    await page.keyboard.press('Escape');
    await expect(popover).not.toBeVisible();

    // 8. Check Overview tab (Familien)
    const overviewTabBtn = page.getByRole('button', { name: 'Familien', exact: true });
    await overviewTabBtn.click();

    const overviewHomerRow = page.locator('tr').filter({ hasText: 'Homer' });
    await expect(overviewHomerRow).toBeVisible();

    // Verify Overview tab shows the symbols before the phone numbers
    await expect(overviewHomerRow).toContainText('📱');
    await expect(overviewHomerRow).toContainText('0170 1234567');
    await expect(overviewHomerRow).toContainText('☏');
    await expect(overviewHomerRow).toContainText('0711 987654');
  });
});
