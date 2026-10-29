import { test, expect } from '@playwright/test';

test.describe('Test Case 11: Header Responsive Sign Out Overflow Menu & Branding Injection', () => {
  test.beforeEach(async ({ request }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();
  });

  test('on desktop layout (> 768px): 3-dots overflow menu is visible and functional with simulate and sign out options', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Default title is "TH Portal" and has compact font size (20px <= 24px)
    const headerTitle = header.locator('.header-brand h1');
    await expect(headerTitle).toHaveText('TH Portal');
    const desktopFontSize = await headerTitle.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    expect(desktopFontSize).toBeLessThanOrEqual(20);

    // Overflow 3-dots menu container should be visible on desktop as well
    const overflowMenu = header.locator('.header-overflow-menu-container');
    await expect(overflowMenu).toBeVisible();

    const threeDotsBtn = overflowMenu.locator('button.header-overflow-btn');
    await expect(threeDotsBtn).toBeVisible();

    // Click 3-dots button to open menu
    await threeDotsBtn.click();
    const dropdown = overflowMenu.locator('.header-overflow-dropdown');
    await expect(dropdown).toBeVisible();

    // Contains "Berechtigungen simulieren", "Impressum", and "Abmelden"
    const simulateItem = dropdown.locator('[data-testid="overflow-simulate-button"]');
    await expect(simulateItem).toBeVisible();
    await expect(simulateItem).toHaveText(/Berechtigungen simulieren|Simulate permissions/i);

    const impressumMenuItem = dropdown.locator('[data-testid="overflow-impressum-link"]');
    await expect(impressumMenuItem).toBeVisible();
    await expect(impressumMenuItem).toHaveText(/Impressum/i);
    await expect(impressumMenuItem).toHaveAttribute('href', 'https://www.tollhaus-stuttgart.de/impressum');
    await expect(impressumMenuItem).toHaveAttribute('target', '_blank');

    const signOutMenuItem = dropdown.locator('[data-testid="overflow-signout-button"]');
    await expect(signOutMenuItem).toBeVisible();
    await expect(signOutMenuItem).toHaveText(/Abmelden|Sign out/i);

    // Test closing via Escape key
    await page.keyboard.press('Escape');
    await expect(dropdown).toHaveCount(0);

    // Footer is visible on desktop layout
    const desktopFooter = page.locator('.dashboard-container .app-footer');
    await expect(desktopFooter).toBeVisible();
    const desktopFooterLink = desktopFooter.locator('a.footer-impressum-link');
    await expect(desktopFooterLink).toBeVisible();
    await expect(desktopFooterLink).toHaveText('Impressum');
    await expect(desktopFooterLink).toHaveAttribute('href', 'https://www.tollhaus-stuttgart.de/impressum');
    await expect(desktopFooterLink).toHaveAttribute('target', '_blank');
  });

  test('on small display layout (<= 768px): 3-dots overflow menu is visible and functional', async ({ page }) => {
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

    // Default title is "TH Portal" and has smaller font size on mobile (< 20px)
    const mobileHeaderTitle = header.locator('.header-brand h1');
    await expect(mobileHeaderTitle).toHaveText('TH Portal');
    const mobileFontSize = await mobileHeaderTitle.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    expect(mobileFontSize).toBeLessThan(20);

    // Overflow 3-dots menu container should BE visible
    const mobileOverflowMenu = header.locator('.header-overflow-menu-container');
    await expect(mobileOverflowMenu).toBeVisible();

    const threeDotsBtn = mobileOverflowMenu.locator('button.header-overflow-btn');
    await expect(threeDotsBtn).toBeVisible();

    // Menu dropdown initially not open
    const dropdown = mobileOverflowMenu.locator('.header-overflow-dropdown');
    await expect(dropdown).toHaveCount(0);

    // Click 3-dots button to open menu
    await threeDotsBtn.click();
    await expect(dropdown).toBeVisible();

    // Menu contains Sign out item, Simulate permissions item, and Impressum link
    const simulateItem = dropdown.locator('[data-testid="overflow-simulate-button"]');
    await expect(simulateItem).toBeVisible();

    const impressumMenuItem = dropdown.locator('[data-testid="overflow-impressum-link"]');
    await expect(impressumMenuItem).toBeVisible();
    await expect(impressumMenuItem).toHaveText(/Impressum/i);
    await expect(impressumMenuItem).toHaveAttribute('href', 'https://www.tollhaus-stuttgart.de/impressum');
    await expect(impressumMenuItem).toHaveAttribute('target', '_blank');

    const signOutMenuItem = dropdown.locator('[data-testid="overflow-signout-button"]');
    await expect(signOutMenuItem).toBeVisible();
    await expect(signOutMenuItem).toHaveText(/Abmelden|Sign out/i);

    // On mobile layout, footer inside dashboard is hidden to save vertical space
    const mobileFooter = page.locator('.dashboard-container .app-footer');
    await expect(mobileFooter).toBeHidden();

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

  test('injecting custom favicon updates favicon link tag', async ({ page }) => {
    await page.addInitScript(() => {
      window.ENV = {
        GOOGLE_CLIENT_ID: 'mock',
        GOOGLE_PROTECTED_DATA_CLIENT_ID: 'mock-protected-data',
        APP_FAVICON_URL: '/custom-favicon.ico',
      };
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const faviconLink = page.locator("link[rel~='icon']");
    await expect(faviconLink).toHaveAttribute('href', '/custom-favicon.ico');
  });

  test('Impressum link on landing page and oauth2-proxy sign-in page', async ({ page }) => {
    // 1. Unauthenticated landing page should show Impressum link in footer
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('token');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const landingFooter = page.locator('.app-footer');
    await expect(landingFooter).toBeVisible();
    const landingImpressumLink = landingFooter.locator('a.footer-impressum-link');
    await expect(landingImpressumLink).toBeVisible();
    await expect(landingImpressumLink).toHaveText('Impressum');
    await expect(landingImpressumLink).toHaveAttribute('href', 'https://www.tollhaus-stuttgart.de/impressum');
    await expect(landingImpressumLink).toHaveAttribute('target', '_blank');

    // 2. oauth2-proxy sign-in page should contain footer with Impressum link
    await page.goto('/oauth2/sign_in');
    const oauthFooter = page.locator('footer');
    await expect(oauthFooter).toBeVisible();
    const oauthImpressumLink = oauthFooter.locator('a[href="https://www.tollhaus-stuttgart.de/impressum"]');
    await expect(oauthImpressumLink).toBeVisible();
    await expect(oauthImpressumLink).toHaveText('Impressum');
  });

  test('Impressum link is consistently visible at the bottom of the screen across all pages (including mealAllergens and mealPlan)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    const testHashes = ['#familiesOverview', '#mealPlan', '#mealAllergens', '#childcareFees', '#members', '#audit', '#admin'];

    for (const hash of testHashes) {
      await page.goto('/' + hash);
      await page.waitForLoadState('networkidle');

      const footer = page.locator('.dashboard-container .app-footer');
      await expect(footer).toBeVisible();

      const footerLink = footer.locator('a.footer-impressum-link');
      await expect(footerLink).toBeVisible();
      await expect(footerLink).toHaveText('Impressum');
      await expect(footerLink).toHaveAttribute('href', 'https://www.tollhaus-stuttgart.de/impressum');

      // Verify the footer is positioned directly at the bottom of the viewport
      const isInViewport = await footer.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      });
      expect(isInViewport).toBe(true);
    }
  });
});
