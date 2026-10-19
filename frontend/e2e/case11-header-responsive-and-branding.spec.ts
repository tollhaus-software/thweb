import { test, expect } from '@playwright/test';

test.describe('Test Case 11: Header Responsive Sign Out Overflow Menu & Branding Injection', () => {
  test.beforeEach(async ({ request }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();
  });

  test('on desktop layout (> 768px): sign out button is visible, overflow menu is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Desktop Sign Out button is visible
    const desktopSignOutBtn = header.locator('button.header-signout-desktop');
    await expect(desktopSignOutBtn).toBeVisible();

    // Mobile overflow menu is hidden on desktop
    const mobileOverflowMenu = header.locator('.header-overflow-mobile');
    await expect(mobileOverflowMenu).toBeHidden();
  });

  test('on small display layout (<= 768px): sign out button is hidden, 3-dots overflow menu is visible and functional', async ({ page }) => {
    // Set viewport to small screen (<= 768px)
    await page.setViewportSize({ width: 600, height: 800 });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Desktop Sign Out button should NOT be visible
    const desktopSignOutBtn = header.locator('button.header-signout-desktop');
    await expect(desktopSignOutBtn).toBeHidden();

    // Overflow 3-dots menu container should BE visible
    const mobileOverflowMenu = header.locator('.header-overflow-mobile');
    await expect(mobileOverflowMenu).toBeVisible();

    const threeDotsBtn = mobileOverflowMenu.locator('button.header-overflow-btn');
    await expect(threeDotsBtn).toBeVisible();

    // Menu dropdown initially not open
    const dropdown = mobileOverflowMenu.locator('.header-overflow-dropdown');
    await expect(dropdown).toHaveCount(0);

    // Click 3-dots button to open menu
    await threeDotsBtn.click();
    await expect(dropdown).toBeVisible();

    // Menu contains Sign out item
    const signOutMenuItem = dropdown.locator('.header-overflow-menu-item');
    await expect(signOutMenuItem).toBeVisible();
    await expect(signOutMenuItem).toHaveText(/Abmelden|Sign out/i);

    // Test closing via Escape key
    await page.keyboard.press('Escape');
    await expect(dropdown).toHaveCount(0);

    // Reopen and test clicking Sign out triggers logout navigation
    await threeDotsBtn.click();
    await expect(dropdown).toBeVisible();

    const [signOutRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/oauth2/sign_out')),
      signOutMenuItem.click(),
    ]);
    expect(signOutRequest).toBeTruthy();
  });

  test('injecting custom page title updates document.title and heading', async ({ page }) => {
    await page.addInitScript(() => {
      window.ENV = {
        GOOGLE_CLIENT_ID: 'mock',
        GOOGLE_PROTECTED_DATA_CLIENT_ID: 'mock-protected-data',
        APP_TITLE: 'Custom Test Kita Title',
      };
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveTitle('Custom Test Kita Title');
    const headerTitle = page.locator('header .header-brand h1');
    await expect(headerTitle).toBeVisible();
    await expect(headerTitle).toHaveText('Custom Test Kita Title');
  });

  test('injecting custom logo renders logo image instead of title text', async ({ page }) => {
    await page.addInitScript(() => {
      window.ENV = {
        GOOGLE_CLIENT_ID: 'mock',
        GOOGLE_PROTECTED_DATA_CLIENT_ID: 'mock-protected-data',
        APP_TITLE: 'Logo Brand Title',
        APP_LOGO_URL: '/favicon.svg',
      };
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Title should still be set in browser tab
    await expect(page).toHaveTitle('Logo Brand Title');

    // Logo image should be rendered instead of text h1
    const logoImg = page.locator('header .header-brand img.app-header-logo');
    await expect(logoImg).toBeVisible();
    await expect(logoImg).toHaveAttribute('src', '/favicon.svg');
    await expect(logoImg).toHaveAttribute('alt', 'Logo Brand Title');

    // Text heading inside header brand should not be rendered
    const textHeading = page.locator('header .header-brand h1');
    await expect(textHeading).toHaveCount(0);
  });
});
