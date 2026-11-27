import { test, expect } from '@playwright/test';

test.describe('Test Case 47: Print Contact Data Per Group (Gruppenübersicht)', () => {
  test.beforeEach(async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Authenticate as admin user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Load application directly at contacts overview
    await page.goto('/#contacts');
    await expect(page.locator('.sidebar-nav-item', { hasText: 'Kontakte' })).toBeVisible();
  });

  test('verifies print toolbar button, menu, options dialog, preview tables and formatting', async ({ request, page }) => {
    // 1. Seed test families with parents and children in different groups and various phone types
    // Family 1: Child in Kleine Gruppe (Group 1) with 2 parents:
    //   Parent 1 (Marge) has Mobile and Festnetz
    //   Parent 2 (Homer) has Mobile and Job
    const fam1Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Marge',
            last_name: 'Simpson',
            emails: [{ value: 'marge@example.com', address_list: true }],
            phones: [
              { value: '0171 111111', type: 'mobile', address_list: true },
              { value: '089 222222', type: 'landline', address_list: true },
              { value: '089 777777', type: 'landline', address_list: false },
            ],
          },
          {
            first_name: 'Homer',
            last_name: 'Simpson',
            emails: [{ value: 'homer@example.com', address_list: true }],
            phones: [
              { value: '0171 333333', type: 'mobile', address_list: true },
              { value: '089 444444', type: 'work', address_list: true },
              { value: '089 999999', type: 'work', address_list: false },
            ],
          },
        ],
      },
    });
    expect(fam1Res.ok()).toBeTruthy();
    const fam1 = await fam1Res.json();

    const maggieId = crypto.randomUUID();
    await request.post(`/api/families/${fam1.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: maggieId, family_id: fam1.id, first_name: 'Maggie', last_name: 'Simpson', birth_date: '2022-01-01' },
    });
    await request.post(`/api/children/${maggieId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: maggieId, change_date: '2024-01-01', target_group: 1 },
    });

    // Family 2: Child in Grosse Gruppe (Group 2)
    const fam2Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Lois',
            last_name: 'Griffin',
            emails: [{ value: 'lois@example.com', address_list: true }],
            phones: [{ value: '0172 555555', type: 'mobile', address_list: true }],
          },
          {
            first_name: 'Peter',
            last_name: 'Griffin',
            emails: [{ value: 'peter@example.com', address_list: true }],
            phones: [{ value: '0172 666666', type: 'mobile', address_list: true }],
          },
        ],
      },
    });
    expect(fam2Res.ok()).toBeTruthy();
    const fam2 = await fam2Res.json();

    const stewieId = crypto.randomUUID();
    await request.post(`/api/families/${fam2.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: stewieId, family_id: fam2.id, first_name: 'Stewie', last_name: 'Griffin', birth_date: '2021-01-01' },
    });
    await request.post(`/api/children/${stewieId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: stewieId, change_date: '2024-01-01', target_group: 2 },
    });

    // Reload page to see new data in overview
    await page.reload();

    // 2. Verify Print icon button is present in the toolbar of the "Families" tab (icon only, no text)
    const printBtn = page.locator('[data-testid="print-toolbar-button"]');
    await expect(printBtn).toBeVisible();
    await expect(printBtn).toHaveAttribute('aria-label', 'Drucken');
    await expect(printBtn).toHaveText('');

    // 3. When pressing the print button, a menu pops up with option "Gruppenübersicht"
    await printBtn.click();
    const groupOverviewMenuItem = page.locator('[data-testid="print-menu-item-group-overview"]');
    await expect(groupOverviewMenuItem).toBeVisible();
    await expect(groupOverviewMenuItem).toContainText('Gruppenübersicht');

    // 4. Click "Gruppenübersicht" -> Options Dialog opens
    await groupOverviewMenuItem.click();

    // Verify dialog header
    const dialogTitle = page.locator('#group-print-dialog-title');
    await expect(dialogTitle).toBeVisible();
    await expect(dialogTitle).toContainText('Gruppenübersicht');

    // Verify group checkboxes: Kleine Gruppe, Grosse Gruppe, Hort
    const group1Cb = page.locator('[data-testid="group-checkbox-1"]');
    const group2Cb = page.locator('[data-testid="group-checkbox-2"]');
    const group3Cb = page.locator('[data-testid="group-checkbox-3"]');
    await expect(group1Cb).toBeVisible();
    await expect(group2Cb).toBeVisible();
    await expect(group3Cb).toBeVisible();
    await expect(group1Cb).toBeChecked();
    await expect(group2Cb).toBeChecked();
    await expect(group3Cb).toBeChecked();

    // Verify phone type checkboxes: Mobile, Festnetz, Job
    const phoneMobileCb = page.locator('[data-testid="phone-type-checkbox-mobile"]');
    const phoneLandlineCb = page.locator('[data-testid="phone-type-checkbox-landline"]');
    const phoneWorkCb = page.locator('[data-testid="phone-type-checkbox-work"]');
    await expect(phoneMobileCb).toBeVisible();
    await expect(phoneLandlineCb).toBeVisible();
    await expect(phoneWorkCb).toBeVisible();
    // Default selection must be 'mobile' phone number only
    await expect(phoneMobileCb).toBeChecked();
    await expect(phoneLandlineCb).not.toBeChecked();
    await expect(phoneWorkCb).not.toBeChecked();

    // Select Festnetz and Job so all phone types are active for testing multiple phone lines per cell
    await phoneLandlineCb.click();
    await phoneWorkCb.click();
    await expect(phoneLandlineCb).toBeChecked();
    await expect(phoneWorkCb).toBeChecked();

    // 5. Click "Continue/Weiter" -> Opens Preview
    const continueBtn = page.locator('[data-testid="print-options-continue"]');
    await expect(continueBtn).toBeVisible();
    await continueBtn.click();

    // 6. In preview:
    // Verify preview toolbar with Print button, Back button, and Close button
    const previewPrintBtn = page.locator('[data-testid="print-preview-print-button"]');
    const previewBackBtn = page.locator('[data-testid="print-preview-back-button"]');
    const previewCloseBtn = page.locator('[data-testid="print-preview-close-button"]');
    await expect(previewPrintBtn).toBeVisible();
    await expect(previewBackBtn).toBeVisible();
    await expect(previewCloseBtn).toBeVisible();

    // Verify pages: each selected group has its own page
    const printPages = page.locator('.print-page');
    // We selected 3 groups (Kleine Gruppe, Grosse Gruppe, Hort) -> 3 pages
    await expect(printPages).toHaveCount(3);

    // Verify Page 1 (Kleine Gruppe):
    const page1 = printPages.nth(0);
    await expect(page1.locator('.print-page-title')).toContainText('Kleine Gruppe');

    // Verify table has NO column headers (no th elements)
    await expect(page1.locator('th')).toHaveCount(0);

    // Verify table has borders on all cell sides
    const firstCell = page1.locator('tbody tr td').first();
    await expect(firstCell).toHaveCSS('border-top-style', 'solid');
    await expect(firstCell).toHaveCSS('border-bottom-style', 'solid');
    await expect(firstCell).toHaveCSS('border-left-style', 'solid');
    await expect(firstCell).toHaveCSS('border-right-style', 'solid');

    // Verify table takes up all horizontal space
    const table1 = page1.locator('.print-table');
    await expect(table1).toBeVisible();

    // Verify row for Maggie Simpson
    const maggieRow = page1.locator('tbody tr').filter({ hasText: 'Maggie' });
    await expect(maggieRow).toBeVisible();
    const cells = maggieRow.locator('td');
    await expect(cells).toHaveCount(6);

    // Columns:
    // 1: child given name -> Maggie
    await expect(cells.nth(0)).toHaveText('Maggie');
    // 2: child surname -> Simpson
    await expect(cells.nth(1)).toHaveText('Simpson');
    // 3: parent 1 full name -> Homer Simpson (sorted alphabetically Homer before Marge)
    await expect(cells.nth(2)).toHaveText('Homer Simpson');
    // 4: parent 1 phone -> Homer's phones (Mobile 0171 333333 and Job 089 444444 on separate lines)
    const p1PhoneLines = cells.nth(3).locator('.phone-line');
    await expect(p1PhoneLines).toHaveCount(2);
    await expect(p1PhoneLines.nth(0)).toHaveText('0171 333333');
    await expect(p1PhoneLines.nth(1)).toHaveText('089 444444');
    // 5: parent 2 full name -> Marge Simpson
    await expect(cells.nth(4)).toHaveText('Marge Simpson');
    // 6: parent 2 phone -> Marge's phones (Mobile 0171 111111 and Landline 089 222222 on separate lines)
    const p2PhoneLines = cells.nth(5).locator('.phone-line');
    await expect(p2PhoneLines).toHaveCount(2);
    await expect(p2PhoneLines.nth(0)).toHaveText('0171 111111');
    await expect(p2PhoneLines.nth(1)).toHaveText('089 222222');

    // Verify Page 2 (Grosse Gruppe) has Stewie Griffin
    const page2 = printPages.nth(1);
    await expect(page2.locator('.print-page-title')).toContainText('Grosse Gruppe');
    const stewieRow = page2.locator('tbody tr').filter({ hasText: 'Stewie' });
    await expect(stewieRow).toBeVisible();

    // 7. Test Back navigation: Click "Zurück" -> Returns to options dialog
    await previewBackBtn.click();
    await expect(dialogTitle).toBeVisible();

    // 8. Test filtering:
    // Uncheck Grosse Gruppe and Hort -> Only Kleine Gruppe selected
    await group2Cb.click();
    await group3Cb.click();
    await expect(group2Cb).not.toBeChecked();
    await expect(group3Cb).not.toBeChecked();

    // Uncheck Festnetz and Job -> Only Mobile selected
    await phoneLandlineCb.click();
    await phoneWorkCb.click();
    await expect(phoneLandlineCb).not.toBeChecked();
    await expect(phoneWorkCb).not.toBeChecked();

    // Click Continue
    await continueBtn.click();

    // Now only 1 page should exist
    await expect(page.locator('.print-page')).toHaveCount(1);
    const filteredPage = page.locator('.print-page').nth(0);
    await expect(filteredPage.locator('.print-page-title')).toContainText('Kleine Gruppe');

    // In Homer's phone cell, only Mobile (0171 333333) should be shown, not Job
    const updatedMaggieRow = filteredPage.locator('tbody tr').filter({ hasText: 'Maggie' });
    const updatedCells = updatedMaggieRow.locator('td');
    const updatedP1Phones = updatedCells.nth(3).locator('.phone-line');
    await expect(updatedP1Phones).toHaveCount(1);
    await expect(updatedP1Phones.nth(0)).toHaveText('0171 333333');

    // In Marge's phone cell, only Mobile (0171 111111) should be shown, not Landline
    const updatedP2Phones = updatedCells.nth(5).locator('.phone-line');
    await expect(updatedP2Phones).toHaveCount(1);
    await expect(updatedP2Phones.nth(0)).toHaveText('0171 111111');

    // Verify under @media print when Group Overview preview is open:
    // #root is hidden, preview toolbar is hidden, and the print page table is visible
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#root')).toBeHidden();
    await expect(page.locator('.print-preview-toolbar')).toBeHidden();
    await expect(filteredPage).toBeVisible();
    await expect(updatedMaggieRow).toBeVisible();
    await page.emulateMedia({ media: 'screen' });

    // 9. Close preview
    await page.locator('[data-testid="print-preview-close-button"]').click();
    await expect(page.locator('.print-preview-modal-overlay')).toHaveCount(0);

    // Regression check: when Group Overview print modal is closed, #root must remain visible in @media print
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#root')).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
  });

  test('only shows print button to users with families.print.group_overview permission', async ({ page }) => {
    // 1. Simulate parent_default role (no families.print.group_overview) -> print button should be hidden
    const simParentRes = await page.request.post('/api/simulation', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        mode: 'custom',
        roles: ['parent_default'],
        permissions: [],
      },
    });
    expect(simParentRes.ok()).toBeTruthy();

    await page.reload();
    await expect(page.locator('[data-testid="print-toolbar-button"]')).toHaveCount(0);

    // 2. Simulate caregiver_default role (has families.print.group_overview) -> print button should be visible
    const simCaregiverRes = await page.request.post('/api/simulation', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        mode: 'custom',
        roles: ['caregiver_default'],
        permissions: [],
      },
    });
    expect(simCaregiverRes.ok()).toBeTruthy();

    await page.reload();
    const printBtn = page.locator('[data-testid="print-toolbar-button"]');
    await expect(printBtn).toBeVisible();
    await expect(printBtn).toHaveText('');
  });
});
