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
    // Click the membership edit pencil button in the parent's row
    const editMembershipBtn = parentRow.getByTitle('Mitgliedschaften verwalten');
    await expect(editMembershipBtn).toBeVisible();
    await editMembershipBtn.click();

    // The membership modal should open
    const modal = page.locator('.modal-container');
    await expect(modal).toBeVisible();

    // Since there were no existing memberships, it automatically enters editing mode
    const startDateInput = modal.locator('td').locator('input[type="text"]').first();
    await expect(startDateInput).toBeVisible();

    // Enter start date 20.10.2025
    await startDateInput.fill('20.10.2025');

    // Save the new membership (Check button)
    const saveNewRowBtn = modal.locator('button:has(svg.lucide-check)');
    await saveNewRowBtn.click();

    // Close the membership dialog
    await modal.getByTitle('Schließen').click();
    await expect(modal).toBeHidden();

    // --- Step 3: Check membership display in the table ---
    await expect(parentRow).toContainText('Voll');

    // --- Step 4: Try to add another membership that collides -> expect collision prevention ---
    // Reopen the modal
    await editMembershipBtn.click();
    await expect(modal).toBeVisible();

    // Check 4A: The ongoing membership has no end date, so '+' button MUST be disabled
    const plusBtn = modal.locator('button:has(svg.lucide-plus)');
    await expect(plusBtn).toBeDisabled();
    await expect(plusBtn).toHaveAttribute('title', 'Die letzte Mitgliedschaft hat noch kein Enddatum');

    // Now edit the ongoing membership to have an end date: 25.10.2025
    const membershipRow = modal.locator('tbody tr').first();
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
    const newStartDateInput = modal.locator('tbody tr').last().locator('input[type="text"]').first();
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
    await modal.locator('tbody tr').last().locator('button:has(svg.lucide-check)').click();

    // Verify alert message was shown preventing the collision
    expect(alertMessage).toContain('überschneiden');

    // Cancel the add row
    await modal.locator('tbody tr').last().locator('button:has(svg.lucide-x)').click();

    // --- Step 5: Remove membership ---
    // Set up dialog handler to confirm deletion
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Click trash button in the membership row
    await membershipRow.locator('button:has(svg.lucide-trash)').click();

    // Wait for row to be removed and empty state message to appear
    await expect(modal).toContainText('Keine Vereinsmitgliedschaft für diese Person erfasst');

    // Close the modal
    await modal.getByTitle('Schließen').click();
    await expect(modal).toBeHidden();

    // Verify parent row no longer displays "Voll"
    await expect(parentRow).not.toContainText('Voll');
  });
});
