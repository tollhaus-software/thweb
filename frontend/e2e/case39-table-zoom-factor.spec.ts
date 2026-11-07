import { test, expect } from '@playwright/test';

test.describe('Test Case 39: Table Zoom Factor in Desktop Mode', () => {
  test.beforeEach(async ({ request, page }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#families');
    await expect(page.locator('[data-testid="table-zoom-button"]')).toBeVisible();
  });

  test('displays default 100% zoom and opens zoom menu with all preset options', async ({ page }) => {
    const zoomBtn = page.locator('[data-testid="table-zoom-button"]');
    await expect(zoomBtn).toBeVisible();
    await expect(page.locator('[data-testid="table-zoom-label"]')).toHaveText('100%');

    // Click to open zoom options
    await zoomBtn.click();

    // Verify presets are visible
    await expect(page.locator('[data-testid="zoom-option-50"]')).toBeVisible();
    await expect(page.locator('[data-testid="zoom-option-75"]')).toBeVisible();
    await expect(page.locator('[data-testid="zoom-option-90"]')).toBeVisible();
    await expect(page.locator('[data-testid="zoom-option-100"]')).toBeVisible();
    await expect(page.locator('[data-testid="zoom-option-125"]')).toBeVisible();
    await expect(page.locator('[data-testid="zoom-option-150"]')).toBeVisible();
    await expect(page.locator('[data-testid="zoom-option-200"]')).toBeVisible();
  });

  test('changes zoom factor, applies CSS custom property, and persists across reload', async ({ page }) => {
    const zoomBtn = page.locator('[data-testid="table-zoom-button"]');

    // Open menu and select 75%
    await zoomBtn.click();
    await page.locator('[data-testid="zoom-option-75"]').click();

    // Verify button label updated
    await expect(page.locator('[data-testid="table-zoom-label"]')).toHaveText('75%');

    // Verify CSS variable on :root
    const zoomCssVar = await page.evaluate(() => {
      return document.documentElement.style.getPropertyValue('--table-zoom');
    });
    expect(zoomCssVar).toBe('0.75');

    // Verify localStorage persistence
    const savedZoom = await page.evaluate(() => localStorage.getItem('thweb_table_zoom'));
    expect(savedZoom).toBe('0.75');

    // Reload page and verify persisted zoom
    await page.reload();
    await expect(page.locator('[data-testid="table-zoom-label"]')).toHaveText('75%');

    const reloadedCssVar = await page.evaluate(() => {
      return document.documentElement.style.getPropertyValue('--table-zoom');
    });
    expect(reloadedCssVar).toBe('0.75');

    // Reset back to 100% using the reset button
    await zoomBtn.click();
    await expect(page.locator('[data-testid="zoom-reset-btn"]')).toBeVisible();
    await page.locator('[data-testid="zoom-reset-btn"]').click();

    await expect(page.locator('[data-testid="table-zoom-label"]')).toHaveText('100%');
    const resetCssVar = await page.evaluate(() => {
      return document.documentElement.style.getPropertyValue('--table-zoom');
    });
    expect(resetCssVar).toBe('1');
  });

  test('hides zoom control on mobile viewport', async ({ page }) => {
    // Switch to mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const zoomBtn = page.locator('[data-testid="table-zoom-button"]');
    await expect(zoomBtn).not.toBeVisible();
  });

  test('zoom factor is available in childcare fees tab', async ({ page }) => {
    // Navigate to Childcare Fees tab
    await page.goto('/#childcareFees');

    // Wait for container
    const zoomBtn = page.locator('[data-testid="table-zoom-button"]');
    await expect(zoomBtn).toBeVisible();

    await zoomBtn.click();
    await page.locator('[data-testid="zoom-option-90"]').click();
    await expect(page.locator('[data-testid="table-zoom-label"]')).toHaveText('90%');
  });
});
