import { test, expect } from '@playwright/test';

test.describe('Test Case 48: Parent Contact Self-Service', () => {
  test('allows parents to update phone numbers and non-identifier emails while protecting identifier email', async ({ request, page }) => {
    // Step 1: Reset database
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // Step 2: Use admin to seed family with parent having identifier email
    const createFamRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Julia',
            last_name: 'Bauer',
            address: 'Schlossplatz 1, 70173 Stuttgart',
            emails: [
              {
                value: 'julia.bauer@example.com',
                identifier_email: true,
                address_list: true,
              },
              {
                value: 'julia.alt@example.com',
                identifier_email: false,
                address_list: true,
              },
            ],
            phones: [
              {
                value: '0172 1234567',
                type: 'mobile',
                address_list: true,
              },
            ],
          },
          {
            first_name: 'Thomas',
            last_name: 'Bauer',
            address: 'Schlossplatz 1, 70173 Stuttgart',
            emails: [
              {
                value: 'thomas.bauer@example.com',
                identifier_email: true,
                address_list: true,
              },
            ],
            phones: [
              {
                value: '0171 7654321',
                type: 'mobile',
                address_list: true,
              },
            ],
          },
        ],
      },
    });
    expect(createFamRes.ok()).toBeTruthy();
    const fam = await createFamRes.json();
    const juliaId = fam.parents[0].id;
    const thomasId = fam.parents[1].id;

    // Seed child and group change so family shows up in overview
    const childId = crypto.randomUUID();
    const createChildRes = await request.post(`/api/families/${fam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: childId,
        family_id: fam.id,
        first_name: 'Leo',
        last_name: 'Bauer',
        birth_date: '2021-06-15',
      },
    });
    expect(createChildRes.ok()).toBeTruthy();

    const todayStr = new Date().toISOString().split('T')[0];
    const groupRes = await request.post(`/api/children/${childId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        child_id: childId,
        change_date: todayStr,
        target_group: 1,
      },
    });
    expect(groupRes.ok()).toBeTruthy();

    // Step 3: Direct API security tests as parent user
    const parentAuthHeader = { Authorization: 'Bearer julia.bauer@example.com' };

    // 3a. GET self-service parents
    const getRes = await request.get('/api/self-service/parents', {
      headers: parentAuthHeader,
    });
    expect(getRes.ok()).toBeTruthy();
    const getData = await getRes.json();
    expect(getData.family_id).toBe(fam.id);
    expect(getData.parents).toHaveLength(2);
    const parentNames = getData.parents.map((p: any) => p.first_name);
    expect(parentNames).toContain('Julia');
    expect(parentNames).toContain('Thomas');

    // 3b. PUT attempting to alter identifier email (Julia or Thomas) -> should fail 403
    const badAlterRes = await request.put('/api/self-service/parents', {
      headers: parentAuthHeader,
      data: {
        parents: [
          {
            id: juliaId,
            emails: [
              { value: 'hacked.julia@example.com', identifier_email: true },
            ],
            phones: [],
          },
        ],
      },
    });
    expect(badAlterRes.status()).toBe(403);

    const badAlterThomasRes = await request.put('/api/self-service/parents', {
      headers: parentAuthHeader,
      data: {
        parents: [
          {
            id: thomasId,
            emails: [
              { value: 'hacked.thomas@example.com', identifier_email: true },
            ],
            phones: [],
          },
        ],
      },
    });
    expect(badAlterThomasRes.status()).toBe(403);

    // 3c. PUT attempting to remove identifier email -> should fail 403
    const badRemoveRes = await request.put('/api/self-service/parents', {
      headers: parentAuthHeader,
      data: {
        parents: [
          {
            id: juliaId,
            emails: [
              { value: 'julia.alt@example.com', identifier_email: false },
            ],
            phones: [],
          },
        ],
      },
    });
    expect(badRemoveRes.status()).toBe(403);

    // 3d. PUT attempting to add new identifier email -> should fail 403
    const badAddRes = await request.put('/api/self-service/parents', {
      headers: parentAuthHeader,
      data: {
        parents: [
          {
            id: juliaId,
            emails: [
              { value: 'julia.bauer@example.com', identifier_email: true },
              { value: 'new.login@example.com', identifier_email: true },
            ],
            phones: [],
          },
        ],
      },
    });
    expect(badAddRes.status()).toBe(403);

    // Step 4: UI testing as logged-in parent (Julia)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'julia.bauer@example.com');
    });

    await page.goto('/#familiesOverview');
    await page.waitForLoadState('networkidle');

    // Verify parents are on overview tab
    await expect(page.locator('.overview-table')).toBeVisible();
    await expect(page.getByText('Julia Bauer')).toBeVisible();
    await expect(page.getByText('Thomas Bauer')).toBeVisible();

    // Verify self-service edit button is rendered for BOTH parents in the family
    const juliaEditBtn = page.getByTestId(`selfservice-edit-${juliaId}`);
    const thomasEditBtn = page.getByTestId(`selfservice-edit-${thomasId}`);
    await expect(juliaEditBtn).toBeVisible();
    await expect(thomasEditBtn).toBeVisible();

    // Also verify Header Overflow menu has self-service button
    const overflowBtn = page.getByTestId('header-overflow-btn');
    await overflowBtn.click();
    const menuSelfServiceBtn = page.getByTestId('overflow-selfservice-button');
    await expect(menuSelfServiceBtn).toBeVisible();
    // Close dropdown
    await page.keyboard.press('Escape');

    // Step 5: Julia opens modal directly by clicking edit button on Thomas Bauer
    await thomasEditBtn.click();
    const modal = page.getByTestId('self-service-modal');
    await expect(modal).toBeVisible();

    // Verify tabs exist for both parents
    const juliaTab = page.getByTestId(`parent-tab-${juliaId}`);
    const thomasTab = page.getByTestId(`parent-tab-${thomasId}`);
    await expect(juliaTab).toBeVisible();
    await expect(thomasTab).toBeVisible();

    // Verify Thomas's tab is initially selected and his identifier email is protected
    const thomasEmailInput = page.getByTestId('email-input-0');
    await expect(thomasEmailInput).toBeDisabled();
    await expect(thomasEmailInput).toHaveValue('thomas.bauer@example.com');

    // Add a new phone for Thomas
    await page.getByTestId('add-phone-btn').click();
    const thomasPhoneInput1 = page.getByTestId('phone-input-1');
    await expect(thomasPhoneInput1).toBeVisible();
    await expect(thomasPhoneInput1).toBeFocused();
    await thomasPhoneInput1.fill('0173 5555555');

    // Switch to Julia's tab to edit Julia's contact details as well
    await juliaTab.click();

    // Verify identifier email is disabled/read-only and Login badge is removed
    const emailInput0 = page.getByTestId('email-input-0');
    await expect(emailInput0).toBeDisabled();
    await expect(emailInput0).toHaveValue('julia.bauer@example.com');
    await expect(page.getByText('Login', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Anmeldeadresse (kann im Self-Service nicht geändert werden)')).toBeVisible();
    await expect(page.getByText('Google-Anmeldeadresse')).toHaveCount(0);
    await expect(page.getByText('In Addressliste anzeigen').first()).toBeVisible();

    // Verify footer note is visible and top explanatory text is removed
    await expect(page.getByTestId('self-service-footer-note')).toContainText('Für Änderungen an Anmeldeadressen oder der Anschrift, meldet euch bitte beim MGA.');
    await expect(page.getByText('Hier können Sie Telefonnummern')).toHaveCount(0);

    // Test deleting an EMPTY entry: does not trigger window.confirm
    await page.getByTestId('add-phone-btn').click();
    const emptyPhoneInput = page.getByTestId('phone-input-1');
    await expect(emptyPhoneInput).toBeVisible();
    await expect(emptyPhoneInput).toBeFocused();
    let dialogTriggered = false;
    const unexpectedDialogHandler = () => { dialogTriggered = true; };
    page.on('dialog', unexpectedDialogHandler);
    await page.getByTestId('delete-phone-1').click();
    await expect(page.getByTestId('phone-input-1')).toHaveCount(0);
    expect(dialogTriggered).toBeFalsy();
    page.off('dialog', unexpectedDialogHandler);

    // Add a new phone number for Julia - must be placed under list and focused automatically
    await page.getByTestId('add-phone-btn').click();
    const newPhoneInput = page.getByTestId('phone-input-1');
    await expect(newPhoneInput).toBeVisible();
    await expect(newPhoneInput).toBeFocused();
    await newPhoneInput.fill('0711 987654');

    // Change type of new phone to work
    await page.getByTestId('phone-type-1').selectOption('work');

    // Test deleting an EMPTY email: does not trigger window.confirm
    await page.getByTestId('add-email-btn').click();
    const emptyEmailInput = page.getByTestId('email-input-2');
    await expect(emptyEmailInput).toBeVisible();
    await expect(emptyEmailInput).toBeFocused();
    dialogTriggered = false;
    page.on('dialog', unexpectedDialogHandler);
    await page.getByTestId('delete-email-2').click();
    await expect(page.getByTestId('email-input-2')).toHaveCount(0);
    expect(dialogTriggered).toBeFalsy();
    page.off('dialog', unexpectedDialogHandler);

    // Add a new email for Julia - must be placed under list and focused automatically
    await page.getByTestId('add-email-btn').click();
    const newEmailInput = page.getByTestId('email-input-2');
    await expect(newEmailInput).toBeVisible();
    await expect(newEmailInput).toBeFocused();
    await newEmailInput.fill('temporary@example.com');

    // Test delete with confirmation: dismiss should NOT delete
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('löschen');
      await dialog.dismiss();
    });
    await page.getByTestId('delete-email-2').click();
    await expect(page.getByTestId('email-input-2')).toBeVisible();

    // Test delete with confirmation: accept WILL delete
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.getByTestId('delete-email-2').click();
    await expect(page.getByTestId('email-input-2')).toHaveCount(0);

    // Update secondary email value
    const emailInput1 = page.getByTestId('email-input-1');
    await emailInput1.fill('julia.newcontact@example.com');

    // Save changes for all family members
    await page.getByTestId('save-self-service-btn').click();

    // Verify success indicator and modal closure
    await expect(page.getByTestId('self-service-success')).toBeVisible();
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Step 6: Verify updated phone numbers for both family members appear on overview table
    await expect(page.getByText('0711 987654')).toBeVisible();
    await expect(page.getByText('0173 5555555')).toBeVisible();
    await expect(page.getByText('julia.newcontact@example.com')).toBeVisible();
  });
});
