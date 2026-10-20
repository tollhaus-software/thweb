import { test, expect } from '@playwright/test';

test.describe('Test Case 16: Entity Deletion in Overflow Menu with Typed Confirmation', () => {
  test('deletes parent on desktop and child on mobile with typed confirmation', async ({ request, page }) => {
    // 1. Reset DB state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Create family with two parents and child
    const createFamRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Maximilian',
            last_name: 'Muster',
            emails: [{ value: 'max.muster@example.com', identifier_email: true, address_list: true }],
            phones: [{ value: '0151 1234567', address_list: true }],
          },
          {
            first_name: 'Sophie',
            last_name: 'Muster',
            emails: [{ value: 'sophie.muster@example.com', identifier_email: false, address_list: true }],
            phones: [{ value: '0151 7654321', address_list: true }],
          },
        ],
      },
    });
    expect(createFamRes.ok()).toBeTruthy();
    const fam = await createFamRes.json();

    const childId = crypto.randomUUID();
    const createChildRes = await request.post(`/api/families/${fam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: childId,
        family_id: fam.id,
        first_name: 'Felix',
        last_name: 'Muster',
        birth_date: '2021-03-15',
      },
    });
    expect(createChildRes.ok()).toBeTruthy();

    // 3. Desktop Table Test
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Navigate to Parents tab
    const parentsTab = page.getByRole('button', { name: 'Eltern(MGA)', exact: true });
    await expect(parentsTab).toBeVisible();
    await parentsTab.click();
    await page.waitForLoadState('networkidle');

    // Locate Maximilian's row
    const maxRow = page.locator('.parents-table tbody tr:not(.family-group-row)', { hasText: 'Maximilian' });
    await expect(maxRow).toBeVisible();

    // In desktop table, actions button is in actions column
    const actionsBtn = maxRow.locator('.row-actions-menu-trigger');
    await expect(actionsBtn).toBeVisible();
    await actionsBtn.click();

    // Popover menu should appear
    const deleteMenuItem = page.locator('.row-action-delete');
    await expect(deleteMenuItem).toBeVisible();
    await expect(deleteMenuItem).toContainText('Elternteil löschen');
    await deleteMenuItem.click();

    // Confirmation Modal
    const modal = page.locator('.confirm-delete-modal-container');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Elternteil löschen');
    await expect(modal).toContainText('Maximilian');

    const submitBtn = modal.locator('.submit-btn');
    await expect(submitBtn).toBeDisabled();

    const nameInput = modal.locator('#confirm-delete-name-input');
    await expect(nameInput).toBeVisible();

    // Wrong name keeps button disabled
    await nameInput.fill('FalscherName');
    await expect(submitBtn).toBeDisabled();

    // Matching name enables button
    await nameInput.fill('maximilian');
    await expect(submitBtn).toBeEnabled();

    // Click confirm delete
    await submitBtn.click();
    await expect(modal).toBeHidden();

    // Verify parent is deleted from table
    await expect(page.locator('.parents-table tbody tr:not(.family-group-row)', { hasText: 'Maximilian' })).toHaveCount(0);

    // 4. Mobile Cards Test for Parent on Parents tab
    await page.setViewportSize({ width: 500, height: 800 });

    // Locate Sophie card on mobile Parents tab
    const sophieCard = page.locator('.parents-table tbody tr:not(.family-group-row)', { hasText: 'Sophie' });
    await expect(sophieCard).toBeVisible();

    // Verify actions button is in card header
    const parentCardHeaderActions = sophieCard.locator('.card-person-header .card-person-header-actions .row-actions-menu-trigger');
    await expect(parentCardHeaderActions).toBeVisible();
    await parentCardHeaderActions.click();

    // Bottom sheet should open with parent delete option
    const parentBottomSheet = page.locator('.cell-popover-bottom-sheet');
    await expect(parentBottomSheet).toBeVisible();
    const parentDeleteBtn = parentBottomSheet.locator('.row-action-delete');
    await expect(parentDeleteBtn).toBeVisible();
    await expect(parentDeleteBtn).toContainText('Elternteil löschen');
    await parentDeleteBtn.click();

    // Confirmation Modal for Sophie
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Elternteil löschen');
    await expect(modal).toContainText('Sophie');
    await expect(submitBtn).toBeDisabled();

    // Enter name and submit
    await nameInput.fill('Sophie');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(modal).toBeHidden();
    // Verify parent is deleted
    await expect(page.locator('.parents-table tbody tr:not(.family-group-row)', { hasText: 'Sophie' })).toHaveCount(0);

    // 5. Mobile Cards Test for Child
    await page.setViewportSize({ width: 500, height: 800 });

    // Navigate to Children tab
    const childrenTab = page.getByRole('button', { name: 'Kinder(MGA)', exact: true });
    await expect(childrenTab).toBeVisible();
    await childrenTab.click();
    await page.waitForLoadState('networkidle');

    // Locate Felix card
    const felixCard = page.locator('.children-table tbody tr:not(.family-group-row)', { hasText: 'Felix' });
    await expect(felixCard).toBeVisible();

    // In mobile card view, actions button is in card header
    const cardHeaderActions = felixCard.locator('.card-person-header .card-person-header-actions .row-actions-menu-trigger');
    await expect(cardHeaderActions).toBeVisible();
    await cardHeaderActions.click();

    // Bottom sheet should open with child delete option
    const bottomSheet = page.locator('.cell-popover-bottom-sheet');
    await expect(bottomSheet).toBeVisible();
    const childDeleteBtn = bottomSheet.locator('.row-action-delete');
    await expect(childDeleteBtn).toBeVisible();
    await expect(childDeleteBtn).toContainText('Kind löschen');
    await childDeleteBtn.click();

    // Confirmation Modal for Felix
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Kind löschen');
    await expect(modal).toContainText('Felix');
    await expect(submitBtn).toBeDisabled();

    // Enter name and press Enter to delete
    await nameInput.fill('Felix');
    await expect(submitBtn).toBeEnabled();
    await nameInput.press('Enter');

    await expect(modal).toBeHidden();
    // Verify child is deleted
    await expect(page.locator('.children-table tbody tr:not(.family-group-row)', { hasText: 'Felix' })).toHaveCount(0);
  });
});
