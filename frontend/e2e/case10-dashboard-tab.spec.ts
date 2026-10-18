import { test, expect } from '@playwright/test';

test.describe('Test Case 10: Embedded Dashboard Tab', () => {
  test('verifies dashboard is embedded as a tab, navigates smoothly, and header link is removed', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Authenticate as regular user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Load application
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 4. Verify the old dashboard link in header is NOT present
    const header = page.locator('header');
    await expect(header).toBeVisible();
    await expect(header.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);

    // 5. Verify the "Dashboard" tab exists in the tab navigation bar
    const dashboardTab = page.locator('.tabs').getByRole('button', { name: 'Dashboard' });
    await expect(dashboardTab).toBeVisible();

    // 6. Click on the "Dashboard" tab
    await dashboardTab.click();

    // 7. Verify tab is active and hash updated to #dashboard
    await expect(dashboardTab).toHaveClass(/active/);
    await expect(dashboardTab).toHaveAttribute('data-active', 'true');
    expect(page.url()).toContain('#dashboard');

    // 8. Verify embedded dashboard content is rendered
    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    // Verify key dashboard sections are visible inside the embedded container
    await expect(embeddedPage.locator('.kiosk-header-date')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-cook')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-meal')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-card-todos')).toBeVisible();
    await expect(embeddedPage.locator('.kiosk-bottom-nav')).toBeVisible();

    // 9. Verify date navigation arrows
    const prevDayBtn = embeddedPage.locator('.kiosk-header-nav-btn.left');
    const nextDayBtn = embeddedPage.locator('.kiosk-header-nav-btn.right');
    await expect(prevDayBtn).toBeVisible();
    await expect(nextDayBtn).toBeVisible();

    const initialDateText = await embeddedPage.locator('.kiosk-header-date').innerText();
    await prevDayBtn.click();
    await page.waitForTimeout(300);
    const newDateText = await embeddedPage.locator('.kiosk-header-date').innerText();
    expect(newDateText).not.toBe(initialDateText);

    // Click Home button to return to today
    const homeBtn = embeddedPage.locator('.kiosk-nav-home-btn');
    await expect(homeBtn).toBeVisible();
    await homeBtn.click();
    await page.waitForTimeout(300);
    const resetDateText = await embeddedPage.locator('.kiosk-header-date').innerText();
    expect(resetDateText).toBe(initialDateText);

    // 10. Direct navigation with hash #dashboard
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');
    await expect(dashboardTab).toHaveClass(/active/);
    await expect(embeddedPage).toBeVisible();
  });
});
