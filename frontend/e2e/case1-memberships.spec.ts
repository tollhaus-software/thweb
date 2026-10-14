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
    await page.getByRole('button', { name: 'Eltern' }).click();

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

    // Verify existing email is listed as a row with pencil, trash, and address list flag (📋)
    const existingRow = emailPopover.locator('tbody tr').first();
    await expect(existingRow).toContainText('persisted@example.com');
    const flagBtn = existingRow.locator('.flag-address_list');
    await expect(flagBtn).toBeVisible();
    await expect(flagBtn).toContainText('📋');
    await expect(flagBtn).toHaveCSS('opacity', '1');

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
});
