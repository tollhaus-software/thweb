import { test, expect } from '@playwright/test';

test.describe('Test Case 44: Network & Auth Reachability Diagnostics', () => {
  test('internal error (e.g. empty response / abort on endpoint while origin and auth succeed) shows internal error dialog and opens feedback modal', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // Abort a specific API call to simulate net::ERR_EMPTY_RESPONSE / connection reset
    await page.route('**/api/hygiene/instruction-document**', (route) => {
      route.abort('connectionreset');
    });

    await page.goto('/#familiesOverview');
    await page.waitForLoadState('networkidle');

    // Trigger fetch to the failing endpoint from within the app
    await page.evaluate(() => {
      fetch('/api/hygiene/instruction-document').catch(() => {});
    });

    // Verify: "Sitzung abgelaufen" is NOT shown
    await expect(page.locator('text=Sitzung abgelaufen')).toHaveCount(0);

    // Verify: "Interner Serverfehler" is shown
    const internalErrorHeading = page.locator('h2:has-text("Interner Serverfehler")');
    await expect(internalErrorHeading).toBeVisible();

    // Verify endpoint info is shown
    await expect(page.locator('.modal-container').getByText('Endpoint: /api/hygiene/instruction-document')).toBeVisible();

    // Click "Feedback melden"
    const feedbackBtn = page.locator('button.submit-btn:has-text("Feedback melden")');
    await expect(feedbackBtn).toBeVisible();
    await feedbackBtn.click();

    // Verify feedback modal opened with "Fehlermeldung" selected and prefilled description
    const feedbackModal = page.locator('[data-testid="feedback-modal"]');
    await expect(feedbackModal).toBeVisible();
    const errorPill = feedbackModal.locator('[data-testid="feedback-type-error"]');
    await expect(errorPill).toHaveClass(/active/);

    const descInput = feedbackModal.locator('[data-testid="feedback-description-input"]');
    await expect(descInput).toHaveValue(/instruction-document/);
  });

  test('no network (unauth probe fails) shows connection error dialog instead of session expired', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#familiesOverview');
    await page.waitForLoadState('networkidle');

    // Simulate complete network loss: unauth probe fails as well as API call
    await page.route('**/favicon.svg**', (route) => {
      route.abort('failed');
    });
    await page.route('**/api/families/overview**', (route) => {
      route.abort('failed');
    });

    // Trigger API call
    await page.evaluate(() => {
      fetch('/api/families/overview').catch(() => {});
    });

    // Verify: "Sitzung abgelaufen" is NOT shown
    await expect(page.locator('text=Sitzung abgelaufen')).toHaveCount(0);

    // Verify: "Keine Verbindung" is shown
    const connErrorHeading = page.locator('h2:has-text("Keine Verbindung")');
    await expect(connErrorHeading).toBeVisible();
    await expect(page.locator('button:has-text("Erneut versuchen")')).toBeVisible();

    // Click "Schließen" to dismiss
    await page.locator('button.cancel-btn:has-text("Schließen")').click();
    await expect(connErrorHeading).toHaveCount(0);
  });

  test('true session expiration (unauth probe succeeds, auth probe fails) shows session expired dialog', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/#familiesOverview');
    await page.waitForLoadState('networkidle');

    // Simulate expired session: unauth probe (/favicon.svg) succeeds, but /api/me probe fails with 401
    await page.route('**/api/me**', (route) => {
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Unauthorized"}' });
    });
    await page.route('**/api/families/overview**', (route) => {
      route.abort('failed');
    });

    // Trigger API call
    await page.evaluate(() => {
      fetch('/api/families/overview').catch(() => {});
    });

    // Verify: "Sitzung abgelaufen" IS shown
    const sessionExpiredHeading = page.locator('h2:has-text("Sitzung abgelaufen")');
    await expect(sessionExpiredHeading).toBeVisible();
    await expect(page.locator('button:has-text("Als Entwickler erneut anmelden")')).toBeVisible();
  });
});
