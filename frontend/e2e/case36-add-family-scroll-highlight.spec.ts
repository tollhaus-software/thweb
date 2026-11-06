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

  test('scrolls to and highlights new family when added in Children MGA tab', async ({ page }) => {
    await page.goto('/#children');
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();

    // Add family at the end of alphabet ("Zulu")
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();
    await page.locator('#f-p1-first').fill('Zach');
    await page.locator('#f-p1-last').fill('Zulu');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    // Locate the family group row for Zulu
    const zuluHeader = page.locator('tr.family-group-row', { hasText: 'Zulu' }).first();
    await expect(zuluHeader).toBeVisible();
    await expect(zuluHeader).toHaveClass(/highlighted-row/);

    // Verify it is in the viewport (scrolled into view)
    await expect(zuluHeader).toBeInViewport();
  });
});
