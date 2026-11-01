import { test, expect } from '@playwright/test';

test.describe('Test Case 29: Navigation Improvements, Category Landing Pages, and Breadcrumbs', () => {
  test.beforeEach(async ({ request }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();
  });

  test('MGA category landing page displays cards with descriptions, reusable subtabs, and clickable breadcrumbs', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#mga');
    await page.waitForLoadState('networkidle');

    // Verify subtabs bar is rendered at the top of content area
    const subtabsBar = page.locator('.subtabs-bar');
    await expect(subtabsBar).toBeVisible();

    // Verify category landing page container is rendered and takes full horizontal width
    const landing = page.locator('[data-testid="category-landing-mga"]');
    await expect(landing).toBeVisible();
    const mainWidth = await page.locator('main').evaluate((el) => el.clientWidth);
    const landingWidth = await landing.evaluate((el) => el.clientWidth);
    expect(landingWidth).toBe(mainWidth);

    // Verify ChildcareFees and search bar are NOT rendered on the landing page
    await expect(page.locator('.fees-month-range-row')).toHaveCount(0);
    await expect(page.locator('.search-input')).toHaveCount(0);

    // Verify header title and description (description is centered)
    await expect(landing.locator('.category-landing-title')).toHaveText(/MGA/);
    const desc = landing.locator('.category-landing-desc');
    await expect(desc).toBeVisible();
    const descTextAlign = await desc.evaluate((el) => window.getComputedStyle(el).textAlign);
    expect(descTextAlign).toBe('center');

    // Verify all 5 sub-category cards are rendered with titles and descriptions
    const cards = landing.locator('.category-landing-card');
    await expect(cards).toHaveCount(5);

    await expect(landing.getByRole('listitem', { name: 'Familien(MGA)' })).toBeVisible();
    await expect(landing.getByRole('listitem', { name: 'Eltern(MGA)' })).toBeVisible();
    await expect(landing.getByRole('listitem', { name: 'Kinder(MGA)' })).toBeVisible();
    await expect(landing.getByRole('listitem', { name: 'Vereinsmitglieder' })).toBeVisible();
    await expect(landing.getByRole('listitem', { name: 'Jobs(MGA)' })).toBeVisible();

    // Verify breadcrumbs on landing page shows "TH Portal > MGA" with MGA as current (not a link)
    const breadcrumbs = page.locator('.header-breadcrumbs');
    await expect(breadcrumbs.locator('.breadcrumb-current')).toHaveText('MGA');

    // Click "Eltern" card to navigate to parents tab
    await landing.getByRole('listitem', { name: 'Eltern(MGA)' }).click();
    await expect(page).toHaveURL(/.*#parents/);

    // In breadcrumbs, "MGA" should now be an interactive link, and "Eltern" is current
    const mgaBreadcrumbLink = breadcrumbs.locator('a.breadcrumb-link.breadcrumb-category');
    await expect(mgaBreadcrumbLink).toBeVisible();
    await expect(mgaBreadcrumbLink).toHaveText('MGA');
    await expect(breadcrumbs.locator('.breadcrumb-current')).toHaveText('Eltern');

    // Click "MGA" in breadcrumbs to navigate back to MGA landing page
    await mgaBreadcrumbLink.click();
    await expect(page).toHaveURL(/.*#mga/);
    await expect(landing).toBeVisible();
    await expect(page.locator('.fees-month-range-row')).toHaveCount(0);
  });

  test('Kochen category landing page and breadcrumb navigation', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#kochen');
    await page.waitForLoadState('networkidle');

    const landing = page.locator('[data-testid="category-landing-kochen"]');
    await expect(landing).toBeVisible();
    await expect(landing.locator('.category-landing-title')).toHaveText('Kochen');

    // 2 sub-category cards: Allergene and Wochenplan
    const cards = landing.locator('.category-landing-card');
    await expect(cards).toHaveCount(2);
    await expect(landing.getByRole('listitem', { name: 'Essen/Allergene' })).toBeVisible();
    await expect(landing.getByRole('listitem', { name: 'Essen/Wochenplan' })).toBeVisible();

    // Click "Wochenplan" card
    await landing.getByRole('listitem', { name: 'Essen/Wochenplan' }).click();
    await expect(page).toHaveURL(/.*#mealPlan/);

    // Breadcrumb has clickable Kochen link
    const kochenBreadcrumbLink = page.locator('.header-breadcrumbs a.breadcrumb-link.breadcrumb-category');
    await expect(kochenBreadcrumbLink).toBeVisible();
    await expect(kochenBreadcrumbLink).toHaveText('Kochen');

    // Click Kochen link to return to landing page
    await kochenBreadcrumbLink.click();
    await expect(page).toHaveURL(/.*#kochen/);
    await expect(landing).toBeVisible();
  });

  test('single subtab category (PA) navigates directly without landing page', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click PA in sidebar
    const paSidebarBtn = page.getByRole('button', { name: 'PA', exact: true });
    await expect(paSidebarBtn).toBeVisible();
    await paSidebarBtn.click();

    // Should navigate directly to #employees (no landing page)
    await expect(page).toHaveURL(/.*#employees/);
    await expect(page.locator('[data-testid="category-landing-pa"]')).toHaveCount(0);

    // Reused subtabs bar is hidden when a category has only 1 subcategory
    const subtabsBar = page.locator('.subtabs-bar');
    await expect(subtabsBar).toHaveCount(0);

    // In breadcrumbs, PA has no landing page and skips the subcategory (shows only PA)
    const breadcrumbCategoryLink = page.locator('.header-breadcrumbs a.breadcrumb-link.breadcrumb-category');
    await expect(breadcrumbCategoryLink).toHaveCount(0);
    await expect(page.locator('.header-breadcrumbs .breadcrumb-category')).toHaveText('PA');
    await expect(page.locator('.header-breadcrumbs .breadcrumb-current')).toHaveText('PA');
    // Ensure Mitarbeitende is skipped
    await expect(page.locator('.header-breadcrumbs')).not.toContainText('Mitarbeitende');
  });

  test('responsive header displays "TH" in under breakpoint mode when no custom logo is configured', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 1. Desktop viewport (> 768px) displays "TH Portal"
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const brandTitle = page.locator('header .header-brand h1');
    await expect(brandTitle).toHaveText('TH Portal');

    // 2. Mobile viewport (<= 768px) displays "TH"
    await page.setViewportSize({ width: 600, height: 800 });
    await expect(brandTitle).toHaveText('TH');
  });

  test('responsive header displays full logo on desktop and favicon in under breakpoint mode (<= 768px)', async ({ page }) => {
    await page.addInitScript(() => {
      window.ENV = {
        GOOGLE_CLIENT_ID: 'mock',
        GOOGLE_PROTECTED_DATA_CLIENT_ID: 'mock-protected-data',
        APP_TITLE: 'Tollhaus Portal',
        APP_LOGO_URL: '/favicon.svg',
      };
      localStorage.setItem('token', 'developer@example.com');
    });

    // 1. Desktop viewport (> 768px)
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const desktopLogo = page.locator('header .header-brand img.app-header-logo');
    await expect(desktopLogo).toBeVisible();

    const mobileFavicon = page.locator('header .header-brand img.app-header-favicon');
    await expect(mobileFavicon).toBeHidden();

    // 2. Mobile viewport (<= 768px)
    await page.setViewportSize({ width: 600, height: 800 });

    await expect(desktopLogo).toBeHidden();
    await expect(mobileFavicon).toBeVisible();
    await expect(mobileFavicon).toHaveAttribute('src', '/favicon.svg');
  });
});
