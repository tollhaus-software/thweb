import { test, expect } from '@playwright/test';

test.describe('Test Case 6: Horizontal Tabs Scrolling on Narrow Viewports', () => {
  test('allows scrolling and selecting tabs when browser width is insufficient to display all tab names', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Authenticate as admin user with all permissions so all tabs are visible
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Set a narrow viewport width where 9 tabs cannot all fit simultaneously
    await page.setViewportSize({ width: 600, height: 800 });

    // 4. Load application
    await page.goto('/#families');
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();

    // 5. Open responsive drawer on narrow viewport
    const toggleSidebarBtn = page.getByRole('button', { name: 'Seitenleiste umschalten' });
    await expect(toggleSidebarBtn).toBeVisible();
    await toggleSidebarBtn.click();

    // 6. Click on "Kiosk-Zertifikate" in the drawer
    const kioskTab = page.getByRole('button', { name: 'Kiosk-Zertifikate' });
    await expect(kioskTab).toBeVisible();
    await kioskTab.click();

    // Verify the kiosk tab becomes active
    await expect(kioskTab).toHaveClass(/active/);
    await expect(kioskTab).toHaveAttribute('data-active', 'true');

    // 7. Re-open drawer and click "MGA"
    await toggleSidebarBtn.click();
    const mgaTab = page.getByRole('button', { name: 'MGA', exact: true });
    await expect(mgaTab).toBeVisible();
    await mgaTab.click();
    await expect(mgaTab).toHaveClass(/active/);
    await expect(mgaTab).toHaveAttribute('data-active', 'true');
  });

  test('on desktop layout (> 768px): tab bar has reduced vertical padding and default font size', async ({ request, page }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/#families');
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();

    const tabBtn = page.locator('.tab-btn').first();
    const styles = await tabBtn.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        paddingTop: parseFloat(computed.paddingTop),
        paddingBottom: parseFloat(computed.paddingBottom),
        fontSize: parseFloat(computed.fontSize),
      };
    });

    // Vertical padding reduced to 0.5rem (8px), smaller than the original 0.75rem (12px)
    expect(styles.paddingTop).toBeLessThanOrEqual(8);
    expect(styles.paddingBottom).toBeLessThanOrEqual(8);
    expect(styles.fontSize).toBe(16);
  });

  test('on small display layout (<= 768px): tab bar has significantly smaller vertical padding and smaller font size', async ({ request, page }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/#families');
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();

    const tabBtn = page.locator('.tab-btn').first();
    const styles = await tabBtn.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        paddingTop: parseFloat(computed.paddingTop),
        paddingBottom: parseFloat(computed.paddingBottom),
        fontSize: parseFloat(computed.fontSize),
      };
    });

    // Vertical padding is significantly smaller on small displays (0.25rem = 4px)
    expect(styles.paddingTop).toBeLessThanOrEqual(4);
    expect(styles.paddingBottom).toBeLessThanOrEqual(4);
    // Font size is smaller on small displays (0.85rem = 13.6px < 16px)
    expect(styles.fontSize).toBeLessThan(16);
  });
});
