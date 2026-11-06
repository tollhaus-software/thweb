import { test, expect } from '@playwright/test';

test.describe('Test Case 38: Dashboard infoPages Grid and Video Guides', () => {
  test('verifies infoPages button opens 2-column grid of square buttons, renders placeholder pages with video support, and handles navigation', async ({
    request,
    page,
  }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Authenticate as regular user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Load dashboard
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    // 4. Verify embedded dashboard is visible
    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    // 5. Verify the "Anleitungen" button (infoPages key) exists in the bottom nav
    const infoPagesBtn = embeddedPage.locator('[data-testid="kiosk-info-pages-btn"]');
    await expect(infoPagesBtn).toBeVisible();
    await expect(infoPagesBtn).toContainText('Anleitungen');

    // 6. Click "Anleitungen" button to open info pages grid
    await infoPagesBtn.click();
    await expect(infoPagesBtn).toHaveClass(/active/);

    // 7. Verify the info pages container and 2-column grid are displayed
    const infoPagesContainer = embeddedPage.locator('[data-testid="kiosk-info-pages-container"]');
    await expect(infoPagesContainer).toBeVisible();

    const grid = embeddedPage.locator('[data-testid="kiosk-info-pages-grid"]');
    await expect(grid).toBeVisible();

    // Verify 2 columns in computed style
    const gridCols = await grid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);
    const colCount = gridCols.split(' ').length;
    expect(colCount).toBe(2);

    // 8. Verify the 4 square box buttons: Kaffeemaschine, Herd, Spülmaschine, Schneidehilfe
    const kaffeeBox = embeddedPage.locator('[data-testid="kiosk-info-page-box-kaffeemaschine"]');
    const herdBox = embeddedPage.locator('[data-testid="kiosk-info-page-box-herd"]');
    const spuelBox = embeddedPage.locator('[data-testid="kiosk-info-page-box-spuelmaschine"]');
    const schneidBox = embeddedPage.locator('[data-testid="kiosk-info-page-box-schneidehilfe"]');

    await expect(kaffeeBox).toBeVisible();
    await expect(kaffeeBox).toContainText('Kaffeemaschine');

    await expect(herdBox).toBeVisible();
    await expect(herdBox).toContainText('Herd');

    await expect(spuelBox).toBeVisible();
    await expect(spuelBox).toContainText('Spülmaschine');

    await expect(schneidBox).toBeVisible();
    await expect(schneidBox).toContainText('Schneidehilfe');

    // Verify square aspect ratio or box styling
    const kaffeeBoxStyle = await kaffeeBox.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        aspectRatio: style.aspectRatio,
        display: style.display,
      };
    });
    expect(kaffeeBoxStyle.aspectRatio).toMatch(/1(\s*\/\s*1)?/);

    // 9. Click on "Kaffeemaschine" page
    await kaffeeBox.click();

    // 10. Verify the info page view is rendered
    const pageView = embeddedPage.locator('[data-testid="kiosk-info-page-view"]');
    await expect(pageView).toBeVisible();
    await expect(pageView.locator('.kiosk-info-page-title')).toContainText('Kaffeemaschine');

    // 11. Verify the iframe is loaded with the HTML info page from /info-pages/
    const iframeElement = pageView.locator('iframe[data-testid="info-page-iframe"]');
    await expect(iframeElement).toBeVisible();
    await expect(iframeElement).toHaveAttribute('src', '/info-pages/kaffeemaschine.html');

    // Wait for iframe content to load and verify it contains video element
    const iframe = page.frameLocator('iframe[data-testid="info-page-iframe"]');
    await expect(iframe.locator('h1')).toContainText('Kaffeemaschine');
    const video = iframe.locator('video');
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute('controls', '');

    // 12. Click "Zurück" back button
    const backToGridBtn = pageView.locator('[data-testid="info-pages-back-to-grid-btn"]');
    await expect(backToGridBtn).toBeVisible();
    await backToGridBtn.click();

    // Returned to grid
    await expect(grid).toBeVisible();

    // 13. Click on "Herd" page
    await herdBox.click();
    await expect(pageView).toBeVisible();
    await expect(pageView.locator('.kiosk-info-page-title')).toContainText('Herd');
    const herdIframe = page.frameLocator('iframe[data-testid="info-page-iframe"]');
    await expect(herdIframe.locator('h1')).toContainText('Herd');
    await expect(herdIframe.locator('video')).toBeVisible();

    // 14. Click Home button in bottom nav to return to main dashboard
    const homeBtn = embeddedPage.locator('.kiosk-nav-home-btn');
    await homeBtn.click();

    // Verify back on main dashboard
    await expect(embeddedPage.locator('.kiosk-card-cook')).toBeVisible();
    await expect(pageView).toHaveCount(0);
    await expect(grid).toHaveCount(0);

    // 15. Re-open Info Pages and use "Home/Zurück" button in header
    await infoPagesBtn.click();
    await expect(grid).toBeVisible();

    const backToDashboardBtn = embeddedPage.locator('[data-testid="info-pages-back-to-dashboard-btn"]');
    await expect(backToDashboardBtn).toBeVisible();
    await backToDashboardBtn.click();

    await expect(embeddedPage.locator('.kiosk-card-cook')).toBeVisible();
    await expect(grid).toHaveCount(0);
  });
});
