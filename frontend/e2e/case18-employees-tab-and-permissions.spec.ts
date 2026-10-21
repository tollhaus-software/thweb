import { test, expect } from '@playwright/test';

test.describe('Test Case 18: Employees Tab and Permissions', () => {
  test('verifies employees tab display, permissions scoping, and CRUD operations', async ({ request, page }) => {
    // Step 1: Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // Step 2: Seed a user with employees.all.read ONLY
    const readerUserRes = await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'employee-reader@example.com',
        roles: [],
        permissions: ['employees.all.read'],
      },
    });
    expect(readerUserRes.ok()).toBeTruthy();

    // Step 3: Seed an initial employee using admin (developer@example.com)
    const seedEmpRes = await request.post('/api/employees', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        first_name: 'Sabine',
        last_name: 'Koch',
        employee_type: 'cook',
        emails: [{ value: 'sabine.koch@example.com', identifier_email: false, address_list: true }],
        phones: [{ value: '01511234567', address_list: true }],
        address: 'Kuchenweg 12, 70173 Stuttgart',
        is_kinderschutzbeauftragter: false,
      },
    });
    expect(seedEmpRes.ok()).toBeTruthy();
    const seededEmp = await seedEmpRes.json();
    expect(seededEmp.id).toBeDefined();

    // =========================================================================
    // Part 1: Verify as Restricted / Unauthorized User (viewer@example.com)
    // =========================================================================
    const unauthorizedPage = await page.context().newPage();
    await unauthorizedPage.addInitScript(() => {
      localStorage.setItem('token', 'viewer@example.com');
    });

    await unauthorizedPage.goto('/');
    // Check that 'Mitarbeitende' tab is NOT visible
    await expect(unauthorizedPage.getByRole('button', { name: 'Mitarbeitende' })).toBeHidden();
    await unauthorizedPage.close();

    // =========================================================================
    // Part 2: Verify as Reader User (employees.all.read ONLY)
    // =========================================================================
    const readerPage = await page.context().newPage();
    await readerPage.addInitScript(() => {
      localStorage.setItem('token', 'employee-reader@example.com');
    });
    await readerPage.goto('/');

    // The 'Mitarbeitende' tab should be visible
    const readerEmpTabBtn = readerPage.getByRole('button', { name: 'Mitarbeitende' });
    await expect(readerEmpTabBtn).toBeVisible();
    await readerEmpTabBtn.click();

    // Verify seeded employee Sabine Koch is in the table
    const sabineRow = readerPage.locator('tr', { hasText: 'Sabine' }).filter({ hasText: 'Koch' });
    await expect(sabineRow).toBeVisible();
    await expect(sabineRow.locator('td', { hasText: 'Koch/Köchin' })).toBeVisible();
    await expect(sabineRow.locator('td', { hasText: 'sabine.koch@example.com' })).toBeVisible();
    await expect(sabineRow.locator('td', { hasText: '01511234567' })).toBeVisible();
    await expect(sabineRow.locator('td', { hasText: 'Kuchenweg 12' })).toBeVisible();
    // Non-caregiver (cook) should have an empty value for Kinderschutzbeauftragte(r)
    await expect(sabineRow.locator('td', { hasText: 'Ja' })).toHaveCount(0);
    await expect(sabineRow.locator('td', { hasText: 'Nein' })).toHaveCount(0);

    // Reader should NOT see 'Mitarbeiter/-in hinzufügen' button
    await expect(readerPage.getByRole('button', { name: 'Mitarbeiter/-in hinzufügen' })).toBeHidden();
    await readerPage.close();

    // =========================================================================
    // Part 3: Verify as Admin / Manager (developer@example.com)
    // =========================================================================
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await page.goto('/');

    // Navigate to Mitarbeitende tab
    const adminEmpTabBtn = page.getByRole('button', { name: 'Mitarbeitende' });
    await expect(adminEmpTabBtn).toBeVisible();
    await adminEmpTabBtn.click();

    // Verify German column header translations: Vorname, Nachname, E-mail, Telefon
    await expect(page.locator('th', { hasText: 'Vorname' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Nachname' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'E-mail' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Telefon' })).toBeVisible();

    // Admin should see 'Mitarbeiter/-in hinzufügen' button
    const addEmpBtn = page.getByRole('button', { name: 'Mitarbeiter/-in hinzufügen' });
    await expect(addEmpBtn).toBeVisible();
    await addEmpBtn.click();

    // Verify Add Employee Modal does NOT ask for email, phone, address, or Kinderschutzbeauftragter
    await expect(page.locator('#emp-email')).toHaveCount(0);
    await expect(page.locator('#emp-phone')).toHaveCount(0);
    await expect(page.locator('#emp-address')).toHaveCount(0);
    await expect(page.locator('#emp-kinderschutz')).toHaveCount(0);

    // Fill in Add Employee Modal (only given name, surname, and type)
    await page.locator('#emp-first-name').fill('Felix');
    await page.locator('#emp-last-name').fill('Mueller');
    await page.locator('#emp-type').selectOption('caregiver');

    // Submit modal
    await page.locator('form').getByRole('button', { name: 'Mitarbeiter/-in hinzufügen' }).click();

    // Verify Felix Mueller appears in table
    const felixRow = page.locator('tr', { hasText: 'Felix' }).filter({ hasText: 'Mueller' });
    await expect(felixRow).toBeVisible();
    await expect(felixRow.locator('td', { hasText: 'Erzieher(in)' })).toBeVisible();

    // --- Test Undo / Back after adding an employee ---
    const addAnotherEmpBtn = page.getByRole('button', { name: 'Mitarbeiter/-in hinzufügen' });
    await addAnotherEmpBtn.click();
    await page.locator('#emp-first-name').fill('Temp');
    await page.locator('#emp-last-name').fill('Employee');
    await page.locator('#emp-type').selectOption('cook');
    await page.locator('form').getByRole('button', { name: 'Mitarbeiter/-in hinzufügen' }).click();
    await expect(page.locator('tr', { hasText: 'Temp' }).filter({ hasText: 'Employee' })).toBeVisible();

    // Click Undo (back arrow button)
    const undoBtn = page.locator('button[title="Undo (Ctrl+Z)"]');
    await undoBtn.click();
    // Temp Employee should be cleanly undone with no 500 or failed to sync alert
    await expect(page.locator('tr', { hasText: 'Temp' }).filter({ hasText: 'Employee' })).toHaveCount(0);

    // --- Test Kinderschutzbeauftragte(r) (shown as "-" when No, pencil icon, double-click to open dropdown) ---
    // Cell should show "-"
    const kinderschutzCell = felixRow.locator('td[data-column-id="is_kinderschutzbeauftragter"]');
    await expect(kinderschutzCell).toHaveText('-');
    // Pencil button is present
    await expect(kinderschutzCell.locator('.easy-edit-button')).toBeVisible();
    // Double click to open dropdown
    await kinderschutzCell.dblclick();
    const dropdownSelect = page.locator('.easy-edit-select-dropdown');
    await expect(dropdownSelect).toBeVisible();
    await expect(dropdownSelect.getByText('Nein')).toBeVisible();
    await expect(dropdownSelect.getByText('Ja')).toBeVisible();
    // Select "Ja"
    await dropdownSelect.getByText('Ja').click();
    await expect(kinderschutzCell).toHaveText('Ja');

    // Now test pencil button to change back to "Nein", which renders as "-"
    await kinderschutzCell.locator('.easy-edit-button').click();
    await expect(dropdownSelect).toBeVisible();
    await dropdownSelect.getByText('Nein').click();
    await expect(kinderschutzCell).toHaveText('-');

    // --- Test Changing Employee Type to Non-Caregiver (Bufdi) Empties Kinderschutzbeauftragte(r) ---
    const empTypeCell = felixRow.locator('td', { hasText: 'Erzieher(in)' });
    await empTypeCell.locator('.easy-edit-button').click();
    const dropdownOption = page.locator('.easy-edit-select-dropdown').getByText('Bufdi');
    await expect(dropdownOption).toBeVisible();
    await dropdownOption.click();
    await expect(felixRow.locator('td', { hasText: 'Bufdi' })).toBeVisible();

    // --- Test MultiValue Emails Editor and Identifier Email flag ---
    const emailCell = felixRow.locator('.emails-cell-wrapper');
    await emailCell.dblclick();

    const emailPopover = page.locator('.glass-popup');
    await expect(emailPopover).toBeVisible();

    // Add email in popover
    const addInput = emailPopover.locator('input[type="text"]').last();
    await addInput.fill('felix.mueller@example.com');
    await addInput.press('Enter');

    // Toggle identifier email flag on felix.mueller@example.com
    const toggleIdEmailBtn = emailPopover.locator('button[title*="Identifikator"]').first();
    await toggleIdEmailBtn.click();
    await page.keyboard.press('Escape');
    await expect(emailPopover).toBeHidden();

    // Verify 🆔 indicator is now opaque / active
    const activeIdIndicator = felixRow.locator('.identifier-email-indicator[title*="Als Identifikator"]');
    await expect(activeIdIndicator).toBeVisible();

    // --- Test Address Editor on Employee ---
    const addrCell = felixRow.locator('.address-cell-wrapper');
    await addrCell.locator('.cell-edit-pencil-btn').click();

    const addrPopover = page.locator('.glass-popup');
    await expect(addrPopover).toBeVisible();
    // Single employee: no shared/individual radio buttons
    await expect(addrPopover.getByRole('radio')).toHaveCount(0);

    const addrInput = addrPopover.getByRole('textbox');
    await addrInput.fill('Bergstr. 10, 70178 Stuttgart');
    await page.keyboard.press('Enter');
    await expect(addrPopover).toBeHidden();
    await expect(felixRow.locator('td', { hasText: 'Bergstr. 10, 70178 Stuttgart' })).toBeVisible();

    // --- Test Cards Small Screen Layout (overflow menu in card header on the right) ---
    await page.setViewportSize({ width: 500, height: 800 });
    const felixCardHeader = page.locator('.card-person-header', { hasText: 'Felix Mueller' });
    await expect(felixCardHeader).toBeVisible();
    const cardActionsTrigger = felixCardHeader.locator('.card-person-header-actions .row-actions-menu-trigger');
    await expect(cardActionsTrigger).toBeVisible();

    // Test Employee Deletion from Cards Small Screen Header Actions
    await cardActionsTrigger.click();
    await page.locator('.row-action-delete').click();

    // Confirm modal should appear expecting "Felix Mueller"
    const deleteModal = page.locator('.modal-overlay');
    await expect(deleteModal).toBeVisible();
    await page.locator('#confirm-delete-name-input').fill('Felix Mueller');
    await deleteModal.getByRole('button', { name: 'Löschen' }).click();
    await expect(deleteModal).toBeHidden();

    // Felix should no longer exist in the table
    await expect(page.locator('tr', { hasText: 'Felix' }).filter({ hasText: 'Mueller' })).toHaveCount(0);
  });
});
