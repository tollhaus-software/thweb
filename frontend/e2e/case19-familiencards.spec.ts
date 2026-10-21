import { test, expect } from '@playwright/test';

test.describe('Test Case 19: Familiencards Tracking and Display', () => {
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

  test('verifies Familiencards lifecycle, validation, and cell summaries', async ({ request, page }) => {
    // --- Step 1: Create a family with 3 children using the backend API ---
    // Child 1: Lisa (no familiencards)
    // Child 2: Bart (active familiencard)
    // Child 3: Maggie (expired familiencard)
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Homer',
            last_name: 'Simpson',
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const createdFam = await famRes.json();
    const familyId = createdFam.id;

    // Add Lisa (no cards)
    const lisaId = crypto.randomUUID();
    const lisaRes = await request.put(`/api/children/${lisaId}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: lisaId,
        family_id: familyId,
        first_name: 'Lisa',
        last_name: 'Simpson',
        birth_date: '2020-05-09',
        familiencards: [],
      },
    });
    expect(lisaRes.ok()).toBeTruthy();

    // Add Bart (active card: valid in current year 2026)
    const bartId = crypto.randomUUID();
    const bartRes = await request.put(`/api/children/${bartId}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: bartId,
        family_id: familyId,
        first_name: 'Bart',
        last_name: 'Simpson',
        birth_date: '2018-04-01',
        familiencards: [2026],
      },
    });
    expect(bartRes.ok()).toBeTruthy();

    // Add Maggie (expired card: valid in 2024)
    const maggieId = crypto.randomUUID();
    const maggieRes = await request.put(`/api/children/${maggieId}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: maggieId,
        family_id: familyId,
        first_name: 'Maggie',
        last_name: 'Simpson',
        birth_date: '2022-08-19',
        familiencards: [2024],
      },
    });
    expect(maggieRes.ok()).toBeTruthy();

    // Add Hugo (active for current year 2026 AND next year 2027 -> "ja (2026+)")
    const hugoId = crypto.randomUUID();
    const hugoRes = await request.put(`/api/children/${hugoId}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: hugoId,
        family_id: familyId,
        first_name: 'Hugo',
        last_name: 'Simpson',
        birth_date: '2019-01-15',
        familiencards: [2026, 2027],
      },
    });
    expect(hugoRes.ok()).toBeTruthy();

    // Add Rod (future card only: 2027 -> "ja (ab 2027)")
    const rodId = crypto.randomUUID();
    const rodRes = await request.put(`/api/children/${rodId}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: rodId,
        family_id: familyId,
        first_name: 'Rod',
        last_name: 'Simpson',
        birth_date: '2021-03-20',
        familiencards: [2027],
      },
    });
    expect(rodRes.ok()).toBeTruthy();

    // Reload page to fetch seeded data
    await page.reload();
    await page.waitForLoadState('networkidle');

    // --- Step 2: Navigate to Kinder(MGA) tab ---
    const childrenTab = page.getByRole('button', { name: 'Kinder(MGA)', exact: true });
    await expect(childrenTab).toBeVisible();
    await childrenTab.click();
    await expect(childrenTab).toHaveClass(/active/);

    // Verify 'Familiencard' header column is present
    await expect(page.locator('th', { hasText: 'Familiencard' })).toBeVisible();

    // --- Step 3: Verify summaries in cells ---
    // Lisa (never had cards): cell text is empty
    const lisaRow = page.locator('tr', { hasText: 'Lisa' });
    const lisaCell = lisaRow.locator('[id^="cell-familiencard-"]');
    await expect(lisaCell).toBeVisible();
    const lisaSpan = lisaCell.locator('span').first();
    await expect(lisaSpan).toHaveText('');

    // Bart (active card for 2026 only): says "ja (2026)" in black
    const bartRow = page.locator('tr', { hasText: 'Bart' });
    const bartCell = bartRow.locator('[id^="cell-familiencard-"]');
    await expect(bartCell).toBeVisible();
    const bartSpan = bartCell.locator('span').first();
    await expect(bartSpan).toHaveText('ja (2026)');
    await expect(bartSpan).toHaveCSS('color', 'rgb(0, 0, 0)');

    // Hugo (active card for 2026 AND 2027): says "ja (2026+)" in black
    const hugoRow = page.locator('tr', { hasText: 'Hugo' });
    const hugoCell = hugoRow.locator('[id^="cell-familiencard-"]');
    await expect(hugoCell).toBeVisible();
    const hugoSpan = hugoCell.locator('span').first();
    await expect(hugoSpan).toHaveText('ja (2026+)');
    await expect(hugoSpan).toHaveCSS('color', 'rgb(0, 0, 0)');

    // Rod (future card for 2027 only): says "ja (ab 2027)" in black
    const rodRow = page.locator('tr', { hasText: 'Rod' });
    const rodCell = rodRow.locator('[id^="cell-familiencard-"]');
    await expect(rodCell).toBeVisible();
    const rodSpan = rodCell.locator('span').first();
    await expect(rodSpan).toHaveText('ja (ab 2027)');
    await expect(rodSpan).toHaveCSS('color', 'rgb(0, 0, 0)');

    // Maggie (expired card: 2024): says "abgelaufen (2024)" in gray
    const maggieRow = page.locator('tr', { hasText: 'Maggie' });
    const maggieCell = maggieRow.locator('[id^="cell-familiencard-"]');
    await expect(maggieCell).toBeVisible();
    const maggieSpan = maggieCell.locator('span').first();
    await expect(maggieSpan).toHaveText('abgelaufen (2024)');
    await expect(maggieSpan).toHaveCSS('color', 'rgb(128, 128, 128)');

    // --- Step 4: Add Familiencard to Lisa via Popover & Test Validation ---
    // Click pencil on Lisa's familiencard cell
    const lisaPencil = lisaCell.locator('.child-familiencard-manage-btn');
    await lisaPencil.click();

    // Popover opens
    const popover = page.locator('.glass-popup');
    await expect(popover).toBeVisible();

    // Since Lisa had no cards, add row input should be visible with placeholder JJJJ
    const yearInput = popover.locator('input[placeholder="JJJJ"]');
    await expect(yearInput).toBeVisible();

    // Test validation: invalid year "20"
    await yearInput.fill('20');

    // Setup dialog listener to verify error alert
    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    const saveBtn = popover.locator('button:has(svg.lucide-check)');
    await saveBtn.click();
    expect(dialogMessage).toContain('4-stelliges Jahr');

    // Now fill valid year: 2026
    await yearInput.fill('2026');
    await saveBtn.click();

    // Wait for card row to be rendered
    await expect(popover.locator('tr', { hasText: '2026' })).toBeVisible();

    // Close popover via escape
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();

    // Verify Lisa now says "ja (2026)" in black
    await expect(lisaSpan).toHaveText('ja (2026)');
    await expect(lisaSpan).toHaveCSS('color', 'rgb(0, 0, 0)');

    // --- Step 5: Test Delete Familiencard ---
    await lisaPencil.click();
    await expect(popover).toBeVisible();

    // Setup dialog listener for delete confirm
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    const deleteBtn = popover.locator('button:has(svg.lucide-trash)');
    await deleteBtn.click();

    // Close popover
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();

    // Verify Lisa is empty again
    await expect(lisaSpan).toHaveText('');

    // --- Step 6: Verify card/mobile view ---
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    // In card view, verify Bart's card has data-label="Familiencard"
    const bartCard = page.locator('.children-table tbody tr:not(.family-group-row)', { hasText: 'Bart' });
    await expect(bartCard).toBeVisible();
    const bartFcCell = bartCard.locator('td[data-label="Familiencard"]');
    await expect(bartFcCell).toBeVisible();
    await expect(bartFcCell.locator('[id^="cell-familiencard-"] span').first()).toHaveText('ja (2026)');

    // Verify pencil button exists and is clickable in card view
    const bartPencil = bartFcCell.locator('.child-familiencard-manage-btn');
    await expect(bartPencil).toBeVisible();
    await bartPencil.click();
    await expect(popover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
  });
});
