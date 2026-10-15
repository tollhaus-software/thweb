import { test, expect } from '@playwright/test';

test.describe('Test Case 1: Membership Lifecycle & Collision Prevention', () => {
  test.beforeEach(async ({ request, page }) => {
    // 1. Reset database state to ensure clean environment
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Mock authenticate as admin user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Load application
    await page.goto('/');
    // Wait for the app to load and display main container
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();
  });

  test('adds full membership, enforces interval collision rules, and deletes membership', async ({ page }) => {
    // --- Step 1: Add a Parent (via Add Family) ---
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();

    // Fill parent 1 details
    await page.locator('#f-p1-first').fill('Anna');
    await page.locator('#f-p1-last').fill('Schmidt');

    // Submit form
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    // Switch to Eltern (Parents) tab to see the parents table
    await page.getByRole('button', { name: 'Eltern(MGA)' }).click();

    // Verify parent is displayed in the parents table
    const parentRow = page.locator('tr', { hasText: 'Anna' }).filter({ hasText: 'Schmidt' });
    await expect(parentRow).toBeVisible();

    // --- Step 2: Add a "full" membership starting on 20.10.2025 ---
    // Clicking the membership cell directly should open the memberships popover
    const membershipCell = parentRow.locator('[id^="cell-membership-"]');
    await expect(membershipCell).toBeVisible();
    await membershipCell.click();

    // The membership popover should open (like group changes editor)
    const popover = page.locator('.memberships-popover');
    await expect(popover).toBeVisible();

    // Since there were no existing memberships, it automatically enters editing mode
    const startDateInput = popover.locator('td').locator('input[type="text"]').first();
    await expect(startDateInput).toBeVisible();

    // Enter start date 20.10.2025
    await startDateInput.fill('20.10.2025');

    // Save the new membership (Check button)
    const saveNewRowBtn = popover.locator('button:has(svg.lucide-check)');
    await saveNewRowBtn.click();
    await expect(saveNewRowBtn).toBeHidden();

    // Close the membership popover (via Escape key or click outside)
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();

    // --- Step 3: Check membership display in the table ---
    await expect(parentRow).toContainText('Voll');

    // --- Step 4: Try to add another membership that collides -> expect collision prevention ---
    // Reopen the popover via pencil button to verify both trigger opening
    const editMembershipBtn = parentRow.getByRole('button', { name: 'Mitgliedschaften verwalten' });
    await expect(editMembershipBtn).toBeVisible();
    await editMembershipBtn.click();
    await expect(popover).toBeVisible();

    // Check 4A: The ongoing membership has no end date, so '+' button MUST be disabled
    const plusBtn = popover.locator('button:has(svg.lucide-plus)');
    await expect(plusBtn).toBeDisabled();
    await expect(plusBtn).toHaveAttribute('title', 'Die letzte Mitgliedschaft hat noch kein Enddatum');

    // Now edit the ongoing membership to have an end date: 25.10.2025
    const membershipRow = popover.locator('tbody tr').first();
    const endDateCell = membershipRow.locator('td').nth(2);
    // Click button "Ende" to trigger inline edit
    await membershipRow.getByRole('button', { name: 'Ende' }).click();

    // Fill end date
    const endDateInlineInput = membershipRow.locator('input[type="text"]');
    await expect(endDateInlineInput).toBeVisible();
    await endDateInlineInput.fill('25.10.2025');
    await endDateInlineInput.press('Enter');

    // Wait for the end date to update
    await expect(endDateCell).toContainText('25.10.2025');

    // Now that the most recent membership has an end date, '+' button should be enabled
    await expect(plusBtn).toBeEnabled();
    await plusBtn.click();

    // An add row is now visible
    const newStartDateInput = popover.locator('tbody tr').last().locator('input[type="text"]').first();
    await expect(newStartDateInput).toBeVisible();

    // Attempt to enter a colliding start date (22.10.2025 which lies inside [20.10.2025, 25.10.2025])
    await newStartDateInput.fill('22.10.2025');

    // Listen for the collision alert dialog
    let alertMessage = '';
    page.once('dialog', async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    // Try to save the colliding row
    await popover.locator('tbody tr').last().locator('button:has(svg.lucide-check)').click();

    // Verify alert message was shown preventing the collision
    expect(alertMessage).toContain('überschneiden');

    // Cancel the add row
    await popover.locator('tbody tr').last().locator('button:has(svg.lucide-x)').click();

    // --- Step 5: Remove membership ---
    // Set up dialog handler to confirm deletion
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Click trash button in the membership row
    await membershipRow.locator('button:has(svg.lucide-trash)').click();

    // Wait for row to be removed and empty state message to appear
    await expect(popover).toContainText('Keine Vereinsmitgliedschaft für diese Person erfasst');

    // Close the popover via Escape
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();

    // Verify parent row no longer displays "Voll"
    await expect(parentRow).not.toContainText('Voll');

    // --- Step 6: Test multi-value editor popover (e-mails) ---
    // 6A. Clicking the email cell opens the popover. Since no emails exist yet, it automatically behaves as if '+' was clicked
    const emailCell = parentRow.locator('td').nth(2);
    await emailCell.click();

    const emailPopover = page.locator('.multivalue-popover');
    await expect(emailPopover).toBeVisible();

    // The add input should already be visible and active
    const addInput = emailPopover.locator('input[type="text"]');
    await expect(addInput).toBeVisible();
    await addInput.fill('persisted@example.com');

    // Moving focus out (e.g. clicking outside on parent row) should persist the change and close popover
    await parentRow.getByText('Schmidt').click();
    await expect(emailPopover).toBeHidden();
    await expect(parentRow).toContainText('persisted@example.com');

    // 6B. Reopen popover by clicking the email cell
    await emailCell.click();
    await expect(emailPopover).toBeVisible();

    // Verify existing email is listed as a row with pencil, trash, identifier flag (🆔), and address list flag (📋)
    const existingRow = emailPopover.locator('tbody tr').first();
    await expect(existingRow).toContainText('persisted@example.com');
    const flagBtn = existingRow.locator('.flag-address_list');
    await expect(flagBtn).toBeVisible();
    await expect(flagBtn).toContainText('📋');
    await expect(flagBtn).toHaveCSS('opacity', '1');

    const idFlagBtn = existingRow.locator('.flag-identifier_email');
    await expect(idFlagBtn).toBeVisible();
    await expect(idFlagBtn).toContainText('🆔');
    await expect(idFlagBtn).toHaveCSS('opacity', '0.25');

    // Test toggling identifier flag on: clicking 🆔 toggles it to opacity 1
    await idFlagBtn.click();
    await expect(idFlagBtn).toHaveCSS('opacity', '1');
    const cellIdIndicator = emailCell.locator('.identifier-email-indicator');
    await expect(cellIdIndicator).toHaveCSS('opacity', '1');

    // Toggle identifier flag back off
    await idFlagBtn.click();
    await expect(idFlagBtn).toHaveCSS('opacity', '0.25');
    await expect(cellIdIndicator).toHaveCSS('opacity', '0.25');

    // Test toggling flag off: clicking 📋 toggles it to greyed out (opacity 0.25)
    await flagBtn.click();
    await expect(flagBtn).toHaveCSS('opacity', '0.25');

    // In table cell, the indicator is also greyed out
    const cellIndicator = emailCell.locator('.address-list-indicator');
    await expect(cellIndicator).toHaveCSS('opacity', '0.25');

    // Toggle back on
    await flagBtn.click();
    await expect(flagBtn).toHaveCSS('opacity', '1');
    await expect(cellIndicator).toHaveCSS('opacity', '1');

    const pencilBtn = existingRow.locator('.edit-entry-btn');
    const trashBtn = existingRow.locator('.delete-entry-btn');
    await expect(pencilBtn).toBeVisible();
    await expect(trashBtn).toBeVisible();
    const emailPlusBtn = emailPopover.locator('.add-value-btn');
    await expect(emailPlusBtn).toBeVisible();

    // 6C. Test inline edit via pencil icon: toggle flag while editing, change value and press Enter to persist
    await pencilBtn.click();
    const editInput = existingRow.locator('input[type="text"]');
    await expect(editInput).toBeVisible();

    // The flag toggle button should still be visible while editing
    const editingFlagBtn = existingRow.locator('.flag-address_list');
    await expect(editingFlagBtn).toBeVisible();
    await expect(editingFlagBtn).toHaveCSS('opacity', '1');

    // Toggle flag while in edit mode
    await editingFlagBtn.click();
    await expect(editingFlagBtn).toHaveCSS('opacity', '0.25');

    await editInput.fill('edited-via-enter@example.com');
    await editInput.press('Enter');
    await expect(editInput).toBeHidden();
    await expect(existingRow).toContainText('edited-via-enter@example.com');
    await expect(parentRow).toContainText('edited-via-enter@example.com');
    await expect(existingRow.locator('.flag-address_list')).toHaveCSS('opacity', '0.25');
    await expect(emailCell.locator('.address-list-indicator')).toHaveCSS('opacity', '0.25');

    // 6D. Test inline edit via double click: toggle flag back on, change value and move focus out (blur) to persist
    const rowText = existingRow.locator('span', { hasText: 'edited-via-enter@example.com' });
    await rowText.dblclick();
    await expect(editInput).toBeVisible();

    // Toggle flag back on while in edit mode
    await editingFlagBtn.click();
    await expect(editingFlagBtn).toHaveCSS('opacity', '1');

    await editInput.fill('final@example.com');
    // Click outside input on popover header to blur
    await emailPopover.locator('div').first().click();
    await expect(editInput).toBeHidden();
    await expect(existingRow).toContainText('final@example.com');
    await expect(parentRow).toContainText('final@example.com');
    await expect(existingRow.locator('.flag-address_list')).toHaveCSS('opacity', '1');
    await expect(emailCell.locator('.address-list-indicator')).toHaveCSS('opacity', '1');

    // 6E. Test adding a second value via '+' button at the bottom
    await emailPlusBtn.click();
    const secondAddInput = emailPopover.locator('input[type="text"]');
    await expect(secondAddInput).toBeVisible();
    await secondAddInput.fill('second@example.com');
    await secondAddInput.press('Enter');
    await expect(emailPopover.locator('tbody tr')).toHaveCount(2);
    await expect(parentRow).toContainText('final@example.com');
    await expect(parentRow).toContainText('second@example.com');

    // 6F. Test deleting an entry using the trash bin icon
    const secondRow = emailPopover.locator('tbody tr').nth(1);
    await secondRow.locator('.delete-entry-btn').click();
    await expect(emailPopover.locator('tbody tr')).toHaveCount(1);
    await expect(parentRow).not.toContainText('second@example.com');

    // 6G. Test deleting all entries, then clicking the placeholder text to start adding again
    const firstRowTrash = emailPopover.locator('tbody tr').first().locator('.delete-entry-btn');
    await firstRowTrash.click();
    await expect(parentRow).not.toContainText('final@example.com');

    // Placeholder row should now be displayed
    const placeholderRow = emailPopover.locator('.multivalue-empty-placeholder-row');
    await expect(placeholderRow).toBeVisible();

    // Clicking the placeholder row behaves like the '+' button
    await placeholderRow.click();
    const afterDeleteAddInput = emailPopover.locator('input[type="text"]');
    await expect(afterDeleteAddInput).toBeVisible();
    await afterDeleteAddInput.fill('re-added@example.com');
    await afterDeleteAddInput.press('Enter');
    await expect(emailPopover.locator('tbody tr')).toHaveCount(1);
    await expect(parentRow).toContainText('re-added@example.com');

    // Close the popover via Escape
    await page.keyboard.press('Escape');
    await expect(emailPopover).toBeHidden();
  });

  test('identifierEmail enforces permission: caregiver without families.all.write cannot remove or edit identifier emails', async ({ page, request }) => {
    // 1. Create a family with a parent having one identifier email and one normal email via API
    const createFamRes = await request.post('/api/families', {
      headers: {
        Authorization: 'Bearer developer@example.com',
        'Content-Type': 'application/json',
      },
      data: {
        parents: [
          {
            first_name: 'Bernd',
            last_name: 'Bauer',
            emails: [
              { value: 'bernd.id@example.com', identifier_email: true, address_list: true },
              { value: 'bernd.normal@example.com', identifier_email: false, address_list: true },
            ],
            phones: [{ value: '111222', address_list: true }],
          },
        ],
      },
    });
    expect(createFamRes.ok()).toBeTruthy();
    const createdFamily = await createFamRes.json();
    const familyId = createdFamily.id;
    const parentId = createdFamily.parents[0].id;

    // 2. Log in as caregiver (lacks families.all.write)
    await page.addInitScript(() => {
      localStorage.setItem('token', 'caregiver@example.com');
    });
    await page.goto('/');

    // Switch to Eltern (Parents) tab
    await page.getByRole('button', { name: 'Eltern(MGA)' }).click();
    const parentRow = page.locator('tr', { hasText: 'Bernd' }).filter({ hasText: 'Bauer' });
    await expect(parentRow).toBeVisible();

    const emailCell = parentRow.locator('td').nth(2);
    // The identifier email row displays 🆔 with opacity 1
    const cellIdIndicator = emailCell.locator('.identifier-email-indicator').first();
    await expect(cellIdIndicator).toBeVisible();
    await expect(cellIdIndicator).toHaveCSS('opacity', '1');

    // 3. Open popover as caregiver
    await emailCell.click();
    const emailPopover = page.locator('.multivalue-popover');
    await expect(emailPopover).toBeVisible();

    // Verify row 0 (identifier email)
    const row0 = emailPopover.locator('tbody tr').nth(0);
    await expect(row0).toContainText('bernd.id@example.com');

    // Pencil and trash buttons must be disabled
    const row0Pencil = row0.locator('.edit-entry-btn');
    const row0Trash = row0.locator('.delete-entry-btn');
    await expect(row0Pencil).toBeDisabled();
    await expect(row0Trash).toBeDisabled();

    // Flag buttons on row 0 must be disabled
    const row0IdFlag = row0.locator('.flag-identifier_email');
    await expect(row0IdFlag).toBeDisabled();

    // Double clicking row 0 must NOT open inline edit input
    await row0.getByText('bernd.id@example.com').dblclick();
    await expect(row0.locator('input[type="text"]')).toHaveCount(0);

    // Verify row 1 (normal email)
    const row1 = emailPopover.locator('tbody tr').nth(1);
    await expect(row1).toContainText('bernd.normal@example.com');

    // Pencil and trash buttons must be enabled for non-identifier email
    const row1Pencil = row1.locator('.edit-entry-btn');
    const row1Trash = row1.locator('.delete-entry-btn');
    await expect(row1Pencil).toBeEnabled();
    await expect(row1Trash).toBeEnabled();

    // In edit mode for row 1, 🆔 flag must remain disabled while 📋 flag is enabled
    await row1Pencil.click();
    const row1EditInput = row1.locator('input[type="text"]');
    await expect(row1EditInput).toBeVisible();
    await expect(row1.locator('.flag-identifier_email')).toBeDisabled();
    const row1AddressFlag = row1.locator('.flag-address_list');
    await expect(row1AddressFlag).toBeEnabled();

    // Caregiver can edit the non-identifier email
    await row1EditInput.fill('bernd.normal_updated@example.com');
    await row1EditInput.press('Enter');
    await expect(row1EditInput).toBeHidden();
    await expect(row1).toContainText('bernd.normal_updated@example.com');
    await expect(parentRow).toContainText('bernd.normal_updated@example.com');

    // 4. Test adding an email: 🆔 toggle must be disabled for caregiver
    const addPlusBtn = emailPopover.locator('.add-value-btn');
    await addPlusBtn.click();
    const addRowInput = emailPopover.locator('input[type="text"]');
    await expect(addRowInput).toBeVisible();
    await expect(emailPopover.locator('.flag-identifier_email').last()).toBeDisabled();
    await addRowInput.fill('bernd.added_by_caregiver@example.com');
    await addRowInput.press('Enter');
    await expect(emailPopover.locator('tbody tr')).toHaveCount(3);
    await expect(parentRow).toContainText('bernd.added_by_caregiver@example.com');

    // Close popover
    await page.keyboard.press('Escape');
    await expect(emailPopover).toBeHidden();

    // 5. Direct API validation: verify backend blocks caregiver from removing or altering identifier email
    const unauthorizedRemoveRes = await request.put(`/api/families/${familyId}`, {
      headers: {
        Authorization: 'Bearer caregiver@example.com',
        'Content-Type': 'application/json',
      },
      data: {
        parents: [
          {
            id: parentId,
            family_id: familyId,
            first_name: 'Bernd',
            last_name: 'Bauer',
            emails: [
              { value: 'bernd.normal_updated@example.com', identifier_email: false },
            ],
            phones: [],
          },
        ],
      },
    });
    expect(unauthorizedRemoveRes.status()).toBe(403);

    const unauthorizedModifyRes = await request.put(`/api/families/${familyId}`, {
      headers: {
        Authorization: 'Bearer caregiver@example.com',
        'Content-Type': 'application/json',
      },
      data: {
        parents: [
          {
            id: parentId,
            family_id: familyId,
            first_name: 'Bernd',
            last_name: 'Bauer',
            emails: [
              { value: 'bernd.hacked_id@example.com', identifier_email: true },
            ],
            phones: [],
          },
        ],
      },
    });
    expect(unauthorizedModifyRes.status()).toBe(403);
  });

  test('Add Parent dialog: horizontal name layout, Tollhaus email auto-fill with umlauts, dirty tracking, and identifier email persistence', async ({ page }) => {
    // 1. Add a Family first
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();
    await page.locator('#f-p1-first').fill('Elke');
    await page.locator('#f-p1-last').fill('Müller');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    // 2. Switch to Parents tab
    await page.getByRole('button', { name: 'Eltern(MGA)' }).click();

    // Find the family header row and click the + button to add a parent
    const familyRow = page.locator('tr.family-group-row', { hasText: 'Müller' });
    await expect(familyRow).toBeVisible();
    const addParentBtn = familyRow.locator('.family-add-button');
    await addParentBtn.click();

    // 3. Verify modal appears
    const modal = page.locator('.modal-container');
    await expect(modal).toBeVisible();

    // Check horizontal layout of given name and surname
    const firstNameInput = modal.locator('#p-first-name');
    const lastNameInput = modal.locator('#p-last-name');
    const tollhausEmailInput = modal.locator('#p-tollhaus-email');

    await expect(firstNameInput).toBeVisible();
    await expect(lastNameInput).toBeVisible();
    await expect(tollhausEmailInput).toBeVisible();

    const firstNameBox = await firstNameInput.boundingBox();
    const lastNameBox = await lastNameInput.boundingBox();
    expect(firstNameBox).toBeTruthy();
    expect(lastNameBox).toBeTruthy();
    // Horizontally aligned: roughly same y position, firstName left of lastName
    expect(Math.abs(firstNameBox!.y - lastNameBox!.y)).toBeLessThan(15);
    expect(firstNameBox!.x + firstNameBox!.width).toBeLessThan(lastNameBox!.x);

    // Default surname is pre-filled from first parent: 'Müller'
    await expect(lastNameInput).toHaveValue('Müller');
    await expect(tollhausEmailInput).toHaveValue('');

    // 4. Typing first name "Jörg" -> tollhausEmail should auto-update to joerg.mueller@tollhaus-stuttgart.de
    await firstNameInput.fill('Jörg');
    await expect(tollhausEmailInput).toHaveValue('joerg.mueller@tollhaus-stuttgart.de');

    // Updating last name with another umlaut "Böhm"
    await lastNameInput.fill('Böhm');
    await expect(tollhausEmailInput).toHaveValue('joerg.boehm@tollhaus-stuttgart.de');

    // 5. Manually edit tollhausEmail -> subsequent name edits should NOT overwrite it
    await tollhausEmailInput.fill('   custom.joerg@tollhaus-stuttgart.de   ');
    await firstNameInput.fill('Hans-Jürgen');
    // tollhausEmail remains the custom value
    await expect(tollhausEmailInput).toHaveValue('   custom.joerg@tollhaus-stuttgart.de   ');

    // 6. Submit the dialog
    await modal.getByRole('button', { name: 'Elternteil hinzufügen' }).click();
    await expect(modal).toBeHidden();

    // 7. Verify new parent is added and contains the identifier email with the 🆔 indicator
    const newParentRow = page.locator('tr', { hasText: 'Hans-Jürgen' }).filter({ hasText: 'Böhm' });
    await expect(newParentRow).toBeVisible();
    // Stripped whitespace: custom.joerg@tollhaus-stuttgart.de
    await expect(newParentRow).toContainText('custom.joerg@tollhaus-stuttgart.de');
    // Check for 🆔 indicator
    await expect(newParentRow).toContainText('🆔');

    // 8. Test adding another parent with pure auto-generated email with umlauts (e.g. Käthe Weiß)
    await addParentBtn.click();
    await expect(modal).toBeVisible();
    await modal.locator('#p-first-name').fill('Käthe');
    await modal.locator('#p-last-name').fill('Weiß');
    await expect(modal.locator('#p-tollhaus-email')).toHaveValue('kaethe.weiss@tollhaus-stuttgart.de');
    await modal.getByRole('button', { name: 'Elternteil hinzufügen' }).click();
    await expect(modal).toBeHidden();

    const secondNewParentRow = page.locator('tr', { hasText: 'Käthe' }).filter({ hasText: 'Weiß' });
    await expect(secondNewParentRow).toBeVisible();
    await expect(secondNewParentRow).toContainText('kaethe.weiss@tollhaus-stuttgart.de');
    await expect(secondNewParentRow).toContainText('🆔');

    // 9. Test adding a third parent with empty email (cleared by user)
    await addParentBtn.click();
    await expect(modal).toBeVisible();
    await modal.locator('#p-first-name').fill('Peter');
    await modal.locator('#p-last-name').fill('Müller');
    await modal.locator('#p-tollhaus-email').fill('   ');
    await modal.getByRole('button', { name: 'Elternteil hinzufügen' }).click();
    await expect(modal).toBeHidden();

    const thirdParentRow = page.locator('tr', { hasText: 'Peter' }).filter({ hasText: 'Müller' });
    await expect(thirdParentRow).toBeVisible();
    const emailCell = thirdParentRow.locator('[id^="cell-emails-"]');
    await expect(emailCell).toContainText('E-Mail hinzufügen');
    await expect(emailCell).not.toContainText('@');
  });

  test('Flag changes (identifier email, address list) are visible in audit log', async ({ page, request }) => {
    // 1. Create family with a parent who has an email
    const createRes = await request.post('/api/families', {
      headers: {
        Authorization: 'Bearer developer@example.com',
        'Content-Type': 'application/json',
      },
      data: {
        parents: [
          {
            first_name: 'Sabine',
            last_name: 'Schneider',
            emails: [
              { value: 'sabine@tollhaus-stuttgart.de', address_list: true, identifier_email: false },
            ],
            phones: [
              { value: '+49170111222', address_list: true },
            ],
          },
        ],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const createdFamily = await createRes.json();
    const parentId = createdFamily.parents[0].id;

    await page.goto('/');

    // 2. Switch to Parents tab and verify parent is displayed
    await page.getByRole('button', { name: 'Eltern(MGA)' }).click();
    const parentRow = page.locator('tr', { hasText: 'Sabine' }).filter({ hasText: 'Schneider' });
    await expect(parentRow).toBeVisible();

    // 3. Open email popover on Sabine's email cell
    const emailCell = parentRow.locator('[id^="cell-emails-"]');
    await emailCell.click();
    const emailPopover = page.locator('.multivalue-popover');
    await expect(emailPopover).toBeVisible();

    // Toggle identifier email (turn ON)
    const idBtn = emailPopover.locator('.flag-identifier_email').first();
    await idBtn.click();

    // Close popover to save
    await page.keyboard.press('Escape');
    await expect(emailPopover).toBeHidden();
    await expect(parentRow).toContainText('🆔');

    // 4. Open email popover again and toggle address list (turn OFF)
    await emailCell.click();
    await expect(emailPopover).toBeVisible();
    const addrBtn = emailPopover.locator('.flag-address_list').first();
    await addrBtn.click();
    await page.keyboard.press('Escape');
    await expect(emailPopover).toBeHidden();

    // 5. Switch to Audit tab
    await page.getByRole('button', { name: 'Audit' }).click();
    const auditTable = page.locator('.data-table');
    await expect(auditTable).toBeVisible();

    // Verify audit log has UPDATE entries for Sabine Schneider showing the flag changes
    const auditRows = auditTable.locator('tbody tr');
    await expect(auditRows.first()).toBeVisible();

    // Find the rows related to Sabine Schneider
    const sabineLogs = auditTable.locator('tbody tr', { hasText: 'Sabine Schneider' });
    await expect(sabineLogs.first()).toBeVisible();

    // Verify identifier email activation is visible in audit log
    await expect(sabineLogs.filter({ hasText: 'Als Identifikator-E-Mail festgelegt (🆔)' })).toBeVisible();

    // Verify address list removal is visible in audit log
    await expect(sabineLogs.filter({ hasText: 'Aus Adressliste entfernt (ohne 📋)' })).toBeVisible();
  });
});

