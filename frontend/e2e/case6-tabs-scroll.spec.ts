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
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();

    // 5. Verify the tabs container has overflow and the right scroll button is visible
    const scrollRightBtn = page.getByRole('button', { name: 'Scroll right' });
    await expect(scrollRightBtn).toBeVisible();

    // The left scroll button should not be visible when at scrollLeft = 0
    const scrollLeftBtn = page.getByRole('button', { name: 'Scroll left' });
    await expect(scrollLeftBtn).toHaveCount(0);

    // 6. Click scroll right button
    await scrollRightBtn.click();

    // After scrolling right, the scroll left button should appear
    await expect(scrollLeftBtn).toBeVisible();

    // 7. Click on the far-right tab "Kiosk-Zertifikate"
    const kioskTab = page.getByRole('button', { name: 'Kiosk-Zertifikate' });
    await kioskTab.click();

    // Verify the kiosk tab becomes active
    await expect(kioskTab).toHaveClass(/active/);
    await expect(kioskTab).toHaveAttribute('data-active', 'true');

    // 8. Click scroll left button to scroll back
    await scrollLeftBtn.click();

    // Verify clicking a tab towards the left (e.g., "Familien(MGA)") works and activates it
    const familiesMgaTab = page.getByRole('button', { name: 'Familien(MGA)' });
    await familiesMgaTab.click();
    await expect(familiesMgaTab).toHaveClass(/active/);
    await expect(familiesMgaTab).toHaveAttribute('data-active', 'true');
  });
});
