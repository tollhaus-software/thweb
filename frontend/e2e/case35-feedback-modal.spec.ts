import { test, expect } from '@playwright/test';

test.describe('Test Case 35: Dashboard Feedback Modal', () => {
  test('opens feedback modal, allows choosing type, entering description and optional contact name, and submits successfully', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Authenticate as developer user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Load application and navigate to dashboard
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    // 4. Verify embedded dashboard is visible
    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    // 5. Verify the "Feedback" button in bottom nav
    const feedbackBtn = embeddedPage.locator('[data-testid="kiosk-feedback-btn"]');
    await expect(feedbackBtn).toBeVisible();
    await expect(feedbackBtn).toContainText('Feedback');

    // 6. Click the Feedback button
    await feedbackBtn.click();

    // 7. Verify modal appears
    const modal = page.locator('[data-testid="feedback-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.feedback-modal-title')).toHaveText('Feedback geben');

    // 8. Verify the 3 feedback types
    const improvementBtn = modal.locator('[data-testid="feedback-type-improvement"]');
    const errorBtn = modal.locator('[data-testid="feedback-type-error"]');
    const otherBtn = modal.locator('[data-testid="feedback-type-other"]');

    await expect(improvementBtn).toBeVisible();
    await expect(errorBtn).toBeVisible();
    await expect(otherBtn).toBeVisible();

    // By default, Verbesserungsvorschlag is active
    await expect(improvementBtn).toHaveClass(/active/);

    // Switch to Fehlermeldung
    await errorBtn.click();
    await expect(errorBtn).toHaveClass(/active/);
    await expect(improvementBtn).not.toHaveClass(/active/);

    // 9. Verify description field, pre-filled contact email for authenticated user, and submit button disabled state
    const descInput = modal.locator('[data-testid="feedback-description-input"]');
    const submitBtn = modal.locator('[data-testid="feedback-submit-btn"]');
    const contactInput = modal.locator('[data-testid="feedback-contact-input"]');

    await expect(descInput).toBeVisible();
    await expect(contactInput).toBeVisible();
    // Should be pre-filled with authenticated user's email
    await expect(contactInput).toHaveValue('developer@example.com');
    await expect(submitBtn).toBeDisabled();

    // 10. Enter description (keeps pre-filled email or can be updated)
    await descInput.fill('Kaffeemaschine meldet Entkalken');
    await expect(submitBtn).toBeEnabled();

    // 11. Submit feedback
    await submitBtn.click();

    // 12. Verify success confirmation is displayed
    const successView = page.locator('[data-testid="feedback-modal-success"]');
    await expect(successView).toBeVisible();
    await expect(successView).toContainText('Vielen Dank für Ihr Feedback!');

    // 13. Verify feedback is stored via backend API
    const adminRes = await request.get('/api/admin/feedback', {
      headers: {
        Authorization: 'Bearer developer@example.com',
      },
    });
    expect(adminRes.ok()).toBeTruthy();
    const feedbacks = await adminRes.json();
    const created = feedbacks.find(
      (f: { description: string }) => f.description === 'Kaffeemaschine meldet Entkalken'
    );
    expect(created).toBeDefined();
    expect(created.feedback_type).toBe('Fehlermeldung');
    expect(created.contact_name).toBe('developer@example.com');
  });

  test('can cancel and close feedback modal via cancel button and escape key', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const feedbackBtn = page.locator('[data-testid="kiosk-feedback-btn"]');
    await feedbackBtn.click();

    const modal = page.locator('[data-testid="feedback-modal"]');
    await expect(modal).toBeVisible();

    // Cancel with Abbrechen button
    const cancelBtn = modal.locator('[data-testid="feedback-cancel-btn"]');
    await cancelBtn.click();
    await expect(modal).not.toBeVisible();

    // Open again and close with ESC key
    await feedbackBtn.click();
    await expect(modal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });

  test('does not pre-fill contact name when running in kiosk mode', async ({ page }) => {
    // Navigate with ?kiosk=true
    await page.goto('/?kiosk=true');
    await page.waitForLoadState('networkidle');

    const feedbackBtn = page.locator('[data-testid="kiosk-feedback-btn"]');
    await expect(feedbackBtn).toBeVisible();
    await feedbackBtn.click();

    const modal = page.locator('[data-testid="feedback-modal"]');
    await expect(modal).toBeVisible();

    // Verify contact input is empty in kiosk mode
    const contactInput = modal.locator('[data-testid="feedback-contact-input"]');
    await expect(contactInput).toBeVisible();
    await expect(contactInput).toHaveValue('');
  });

  test('button text remains black in light mode when selected', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');

    const feedbackBtn = page.locator('[data-testid="kiosk-feedback-btn"]');
    await feedbackBtn.click();

    const modal = page.locator('[data-testid="feedback-modal"]');
    await expect(modal).toBeVisible();

    const improvementBtn = modal.locator('[data-testid="feedback-type-improvement"]');
    await expect(improvementBtn).toHaveClass(/active/);
    await expect(improvementBtn).toHaveCSS('color', 'rgb(0, 0, 0)');

    const errorBtn = modal.locator('[data-testid="feedback-type-error"]');
    await errorBtn.click();
    await expect(errorBtn).toHaveClass(/active/);
    await expect(errorBtn).toHaveCSS('color', 'rgb(0, 0, 0)');
  });

  test('can open feedback modal from top right overflow menu in main app', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click header overflow menu (three dots / user icon)
    const overflowBtn = page.locator('[data-testid="header-overflow-btn"]');
    await expect(overflowBtn).toBeVisible();
    await overflowBtn.click();

    // Click "Feedback senden" in the overflow dropdown
    const feedbackMenuItem = page.locator('[data-testid="overflow-feedback-button"]');
    await expect(feedbackMenuItem).toBeVisible();
    await expect(feedbackMenuItem).toContainText('Feedback senden');
    await feedbackMenuItem.click();

    // Verify modal is open
    const modal = page.locator('[data-testid="feedback-modal"]');
    await expect(modal).toBeVisible();

    // Close modal
    const cancelBtn = modal.locator('[data-testid="feedback-cancel-btn"]');
    await cancelBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test('admin sections: Admin/Benutzer has users and roles tabs, and Admin/Feedback und Aktivität has feedback and activity tabs', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 1. Visit Admin/Feedback und Aktivität (#activity)
    await page.goto('/#activity');
    await page.waitForLoadState('networkidle');

    const feedbackActivityContainer = page.locator('[data-testid="feedback-and-activity-container"]');
    await expect(feedbackActivityContainer).toBeVisible();

    // Verify two sub-tabs: 1. Feedback, 2. Aktivität & Feature-Nutzung
    const subtabFeedback = page.locator('[data-testid="subtab-feedback"]');
    const subtabActivity = page.locator('[data-testid="subtab-activity"]');
    await expect(subtabFeedback).toBeVisible();
    await expect(subtabActivity).toBeVisible();

    // Feedback tab is selected by default
    await expect(subtabFeedback).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-testid="feedback-dashboard"]')).toBeVisible();

    // Switch to Aktivität subtab
    await subtabActivity.click();
    await expect(subtabActivity).toHaveAttribute('aria-selected', 'true');
    const activityDashboard = page.locator('[data-testid="activity-dashboard"]');
    await expect(activityDashboard).toBeVisible();

    // Verify filter input does not stick out of the container layout
    const filterInput = activityDashboard.locator('input[placeholder*="filtern"]');
    await expect(filterInput).toBeVisible();
    const filterBox = await filterInput.boundingBox();
    const containerBox = await feedbackActivityContainer.boundingBox();
    expect(filterBox).not.toBeNull();
    expect(containerBox).not.toBeNull();
    if (filterBox && containerBox) {
      expect(filterBox.x + filterBox.width).toBeLessThanOrEqual(containerBox.x + containerBox.width + 1);
    }

    // 2. Visit Admin/Benutzer (#admin)
    await page.goto('/#admin');
    await page.waitForLoadState('networkidle');

    const adminContainer = page.locator('.admin-container');
    await expect(adminContainer).toBeVisible();

    // Verify users and roles tabs
    const usersBtn = adminContainer.locator('[data-testid="admin-subtab-users"]');
    const rolesBtn = adminContainer.locator('[data-testid="admin-subtab-roles"]');
    await expect(usersBtn).toBeVisible();
    await expect(rolesBtn).toBeVisible();
  });
});
