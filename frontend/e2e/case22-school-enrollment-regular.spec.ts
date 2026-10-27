import { test, expect } from '@playwright/test';

test.describe('Test Case 22: Einschulung (regulär) Column in Children Tab', () => {
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

  test('verifies Einschulung (regulär) column order, backend calculation rules, and dynamic update on birthdate change', async ({ request, page }) => {
    // 1. Create a family
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Marge',
            last_name: 'Simpson',
            emails: [{ value: 'marge@example.com', address_list: true }],
            phones: [{ value: '0171 111111', type: 'mobile', address_list: true }],
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const family = await famRes.json();

    // 2. Add children with birth dates testing all rules:
    // c1: 2010-05-15 -> 6th bday 2016-05 (<=2019, <=Sep) -> 2016
    // c2: 2010-10-01 -> 6th bday 2016-10 (<=2019, >Sep)  -> 2017
    // c3: 2014-08-15 -> 6th bday 2020-08 (==2020, <=Aug) -> 2020
    // c4: 2014-09-15 -> 6th bday 2020-09 (==2020, >Aug)  -> 2021
    // c5: 2015-07-01 -> 6th bday 2021-07 (==2021, <=Jul) -> 2021
    // c6: 2015-08-01 -> 6th bday 2021-08 (==2021, >Jul)  -> 2022
    // c7: 2016-06-15 -> 6th bday 2022-06 (>=2022, <=Jun) -> 2022
    // c8: 2016-07-15 -> 6th bday 2022-07 (>=2022, >Jun)  -> 2023
    const childrenToCreate = [
      { id: crypto.randomUUID(), first_name: 'ChildOne', birth_date: '2010-05-15', expected: '2016' },
      { id: crypto.randomUUID(), first_name: 'ChildTwo', birth_date: '2010-10-01', expected: '2017' },
      { id: crypto.randomUUID(), first_name: 'ChildThree', birth_date: '2014-08-15', expected: '2020' },
      { id: crypto.randomUUID(), first_name: 'ChildFour', birth_date: '2014-09-15', expected: '2021' },
      { id: crypto.randomUUID(), first_name: 'ChildFive', birth_date: '2015-07-01', expected: '2021' },
      { id: crypto.randomUUID(), first_name: 'ChildSix', birth_date: '2015-08-01', expected: '2022' },
      { id: crypto.randomUUID(), first_name: 'ChildSeven', birth_date: '2016-06-15', expected: '2022' },
      { id: crypto.randomUUID(), first_name: 'ChildEight', birth_date: '2016-07-15', expected: '2023' },
    ];

    for (const c of childrenToCreate) {
      const res = await request.put(`/api/children/${c.id}`, {
        headers: { Authorization: 'Bearer developer@example.com' },
        data: {
          id: c.id,
          family_id: family.id,
          first_name: c.first_name,
          last_name: 'Simpson',
          birth_date: c.birth_date,
        },
      });
      expect(res.ok()).toBeTruthy();
    }

    // 3. Switch to Kinder(MGA) tab
    await page.getByRole('button', { name: 'Kinder(MGA)' }).click();

    // 4. Verify column order: Einschulung (regulär) must appear after birthdate column
    const tableHeaders = page.locator('.children-table thead th');
    const headerTexts = await tableHeaders.allTextContents();
    const cleanHeaders = headerTexts.map(h => h.trim()).filter(Boolean);

    const birthDateIdx = cleanHeaders.findIndex(h => h.includes('Geburt') || h.includes('Geb.'));
    const einschulungIdx = cleanHeaders.findIndex(h => h.includes('🏫(regulär)') || h.includes('Einschulung (regulär)'));

    expect(birthDateIdx).toBeGreaterThanOrEqual(0);
    expect(einschulungIdx).toBeGreaterThanOrEqual(0);
    expect(einschulungIdx).toBe(birthDateIdx + 1);

    // 5. Verify backend-determined values for each child
    for (const c of childrenToCreate) {
      const row = page.locator('tr').filter({ hasText: c.first_name }).first();
      await expect(row).toBeVisible();
      const cell = row.locator('td[data-column-id="school_enrollment_default"]');
      await expect(cell).toContainText(c.expected);
    }

    // 6. Test updating child seven's birth date from 2016-06-15 (<= June -> 2022) to 2016-07-15 (> June -> 2023)
    const childSevenRow = page.locator('tr').filter({ hasText: 'ChildSeven' }).first();
    const birthDateCell = childSevenRow.locator('td[data-column-id="birth_date"]');
    await birthDateCell.hover();
    await birthDateCell.locator('button[aria-label="Edit"], button.easy-edit-button, button').first().click();

    const dateInput = birthDateCell.locator('input');
    await dateInput.fill('15.07.2016');
    await dateInput.press('Enter');

    // Verify Einschulung (regulär) is recomputed by backend to 2023
    const childSevenEinschulungCell = childSevenRow.locator('td[data-column-id="school_enrollment_default"]');
    await expect(childSevenEinschulungCell).toContainText('2023');
  });
});
