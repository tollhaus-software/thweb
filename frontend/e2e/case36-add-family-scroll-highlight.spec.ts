import { test, expect } from '@playwright/test';

test.describe('Add family scroll and highlight in MGA tabs', () => {
  test.beforeEach(async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Pre-seed 15 families so the tables have enough content to require scrolling
    const authHeaders = { Authorization: 'Bearer developer@example.com' };
    for (let i = 1; i <= 15; i++) {
      const char = String.fromCharCode(64 + i); // A, B, C...
      await request.post('/api/families', {
        headers: authHeaders,
        data: {
          parents: [
            { first_name: `Parent${char}`, last_name: `Alpha${char}` },
          ],
        },
      });
    }

    // 3. Mock authenticate as admin user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
  });

  test('scrolls to and highlights new family when added in Families MGA tab', async ({ page }) => {
    await page.goto('/#families');
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();

    // Add family at the end of alphabet ("Zeta")
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();
    await page.locator('#f-p1-first').fill('Zara');
    await page.locator('#f-p1-last').fill('Zeta');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    // Locate the row for Zeta
    const zetaRow = page.locator('tbody tr', { hasText: 'Zeta' }).first();
    await expect(zetaRow).toBeVisible();
    await expect(zetaRow).toHaveClass(/highlighted-row/);

    // Verify it is in the viewport (scrolled into view)
    await expect(zetaRow).toBeInViewport();
  });

  test('scrolls to and highlights new family when added in Parents MGA tab', async ({ page }) => {
    await page.goto('/#parents');
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();

    // Add family at the end of alphabet ("Zorro")
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();
    await page.locator('#f-p1-first').fill('Zoe');
    await page.locator('#f-p1-last').fill('Zorro');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    // Locate the family group row for Zorro
    const zorroHeader = page.locator('tr.family-group-row', { hasText: 'Zorro' }).first();
    await expect(zorroHeader).toBeVisible();
    await expect(zorroHeader).toHaveClass(/highlighted-row/);

    // Verify it is in the viewport (scrolled into view)
    await expect(zorroHeader).toBeInViewport();
  });

  test('selects family from two-row filterable dialog and adds child when pressing Kind hinzufügen in Children MGA tab', async ({ request, page }) => {
    const authHeaders = { Authorization: 'Bearer developer@example.com' };
    // Create a family "Zulu" with 2 parents and 2 existing children
    const zuluRes = await request.post('/api/families', {
      headers: authHeaders,
      data: {
        parents: [
          { first_name: 'Zach', last_name: 'Zulu' },
          { first_name: 'Zelda', last_name: 'Zulu' },
        ],
      },
    });
    expect(zuluRes.ok()).toBeTruthy();
    const zuluFam = await zuluRes.json();

    for (const c of [
      { id: crypto.randomUUID(), first_name: 'Zack', birth_date: '2020-03-10' },
      { id: crypto.randomUUID(), first_name: 'Zoe', birth_date: '2022-07-15' },
    ]) {
      const cRes = await request.put(`/api/children/${c.id}`, {
        headers: authHeaders,
        data: {
          id: c.id,
          family_id: zuluFam.id,
          first_name: c.first_name,
          last_name: 'Zulu',
          birth_date: c.birth_date,
        },
      });
      expect(cRes.ok()).toBeTruthy();
    }

    await page.goto('/#children');
    // Children tab must NOT have "Familie hinzufügen" button, but instead "Kind hinzufügen"
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toHaveCount(0);
    const addChildBtn = page.getByRole('button', { name: 'Kind hinzufügen', exact: true });
    await expect(addChildBtn).toBeVisible();

    // Click "Kind hinzufügen" to open the family selection dialog
    await addChildBtn.click();
    const pickerModal = page.getByTestId('select-family-for-child-modal');
    await expect(pickerModal).toBeVisible();

    // Verify all 16 families are listed (15 Alpha + 1 Zulu)
    const items = pickerModal.getByTestId('select-family-list-item');
    await expect(items).toHaveCount(16);

    // Verify Zulu family has two rows:
    // Row 1: "Zulu (Zach, Zelda)"
    // Row 2: "Zack, Zoe" with smaller font than row 1
    const zuluItem = items.filter({ hasText: 'Zulu' });
    await expect(zuluItem).toHaveCount(1);
    const row1 = zuluItem.getByTestId('select-family-row-1');
    const row2 = zuluItem.getByTestId('select-family-row-2');
    await expect(row1).toHaveText('Zulu (Zach, Zelda)');
    await expect(row2).toHaveText('Zack, Zoe');

    const r1FontSize = await row1.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    const r2FontSize = await row2.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    expect(r2FontSize).toBeLessThan(r1FontSize);

    // Filter search across text in family rows (e.g. by child name "Zack" or parent name "Zelda")
    const filterInput = pickerModal.getByTestId('select-family-filter-input');
    await filterInput.fill('Zack');
    await expect(items).toHaveCount(1);
    await expect(zuluItem).toBeVisible();

    await filterInput.fill('ParentB');
    await expect(items).toHaveCount(1);
    await expect(items.first().getByTestId('select-family-row-1')).toHaveText('AlphaB (ParentB)');

    await filterInput.fill('Zelda');
    await expect(items).toHaveCount(1);
    await expect(zuluItem).toBeVisible();

    // Clicking on the family row proceeds to the existing "Kind hinzufügen zu Zulu" dialog
    await zuluItem.click();
    await expect(pickerModal).toBeHidden();

    const addChildModal = page.locator('.modal-container');
    await expect(addChildModal).toBeVisible();
    await expect(addChildModal).toContainText('Kind hinzufügen zu Zulu');
    await expect(page.locator('#c-last-name')).toHaveValue('Zulu');

    // Fill new child details and submit
    await page.locator('#c-first-name').fill('Zander');
    await page.locator('form').getByRole('button', { name: 'Kind hinzufügen' }).click();
    await expect(addChildModal).toBeHidden();

    // Locate the newly added child row for Zander
    const zanderRow = page.locator('tbody tr', { hasText: 'Zander' }).first();
    await expect(zanderRow).toBeVisible();
    await expect(zanderRow).toHaveClass(/highlighted-row/);
    await expect(zanderRow).toBeInViewport();
  });
});
