import { test, expect } from '@playwright/test';

test.describe('Test Case 43: Hygienebelehrung (§ 43 IfSG) - Personal View, Management, and Recertification', () => {
  test.beforeEach(async ({ request }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();
  });

  const samplePdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000059 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
  );

  test('admin uploads hygiene document via wizard, parent self-certifies, new document versions do not force recertification, and document deletion is handled', async ({ request, browser }) => {
    test.setTimeout(90000);

    // Step 1: Create a family with a parent who has identifier email parent.hygiene@example.com
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Helena',
            last_name: 'Hygiene',
            emails: [
              {
                value: 'parent.hygiene@example.com',
                identifier_email: true,
                address_list: true,
              },
            ],
            phones: [],
            address: 'Sauberweg 7',
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const fam = await famRes.json();
    const parentId = fam.parents[0].id;

    // Family start = earliest group start of the children: 11 months + 5 days ago,
    // i.e. the 12-month due date is ~25 days away (inside the reminder window)
    const start = new Date();
    start.setMonth(start.getMonth() - 11);
    start.setDate(start.getDate() - 5);
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const childId = crypto.randomUUID();
    const childRes = await request.post(`/api/families/${fam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: childId, first_name: 'Hanno', last_name: 'Hygiene', birth_date: '2021-02-15' },
    });
    expect(childRes.ok()).toBeTruthy();
    const gcRes = await request.post(`/api/children/${childId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { change_date: startStr, target_group: 1 },
    });
    expect(gcRes.ok()).toBeTruthy();

    // Step 2: Admin session in isolated context
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await adminPage.setViewportSize({ width: 1280, height: 800 });
    await adminPage.goto('/#hygieneDocument');
    await adminPage.waitForLoadState('networkidle');

    // Verify "Eltern suchen..." is NOT present on hygieneDocument
    await expect(adminPage.getByPlaceholder('Eltern suchen...')).toHaveCount(0);

    // Initially, verify that no document is present
    await expect(adminPage.getByTestId('hygiene-no-active-doc')).toBeVisible();

    // Step 2a: Launch upload wizard modal
    await adminPage.locator('button[data-testid="hygiene-add-doc-btn"]').click();
    const wizardModal = adminPage.getByTestId('hygiene-upload-wizard-modal');
    await expect(wizardModal).toBeVisible();

    // Wizard Step 1: Upload file
    await adminPage.locator('input[data-testid="hygiene-wizard-file-input"]').setInputFiles({
      name: 'ifsg-belehrung-v1.pdf',
      mimeType: 'application/pdf',
      buffer: samplePdf,
    });
    // Selecting the file auto-continues to step 2

    // Wizard Step 2: Document Preview and Title
    await expect(adminPage.getByTestId('hygiene-wizard-preview-frame')).toBeVisible();
    await adminPage.locator('input[data-testid="hygiene-wizard-title-input"]').fill('Infektionsschutz Belehrung Leitfaden 2026');
    // The wizard states that the new document is used in the regular cycle
    await expect(adminPage.getByTestId('hygiene-wizard-regular-note')).toContainText('regulären Turnus');
    await adminPage.locator('button[data-testid="hygiene-wizard-submit"]').click();

    // Modal closes
    await expect(wizardModal).toHaveCount(0);

    // Verify documents table lists the document, shows active badge, title, and "In neuem Tab ansehen" action
    await expect(adminPage.getByTestId('hygiene-documents-table')).toBeVisible();
    await expect(adminPage.getByTestId('badge-active-version')).toBeVisible();
    await expect(adminPage.getByTestId('hygiene-active-doc-title')).toContainText('Infektionsschutz Belehrung Leitfaden 2026');
    const viewBtn = adminPage.locator('a[data-testid^="hygiene-doc-view-"]').first();
    await expect(viewBtn).toHaveAttribute('title', 'In neuem Tab ansehen');

    // Verify cards view for "under breakpoint" small viewports (<= 768px)
    await adminPage.setViewportSize({ width: 500, height: 800 });
    await expect(adminPage.getByTestId('hygiene-documents-cards-list')).toBeVisible();
    await expect(adminPage.getByTestId('hygiene-documents-table')).toHaveCount(0);
    await expect(adminPage.getByTestId('hygiene-active-doc-title')).toContainText('Infektionsschutz Belehrung Leitfaden 2026');
    await expect(adminPage.getByTestId('badge-active-version')).toBeVisible();

    // Restore desktop viewport
    await adminPage.setViewportSize({ width: 1280, height: 800 });
    await expect(adminPage.getByTestId('hygiene-documents-table')).toBeVisible();
    await expect(adminPage.getByTestId('hygiene-documents-cards-list')).toHaveCount(0);

    // Step 3: Parent session in isolated context
    const parentContext = await browser.newContext();
    const parentPage = await parentContext.newPage();
    await parentPage.addInitScript(() => {
      localStorage.setItem('token', 'parent.hygiene@example.com');
    });

    // 1. A regular parent without the hygiene_pilot role must NOT see the task card
    await parentPage.goto('/?exp_main=1#main');
    await parentPage.waitForLoadState('networkidle');
    await expect(parentPage.getByTestId('main-page-hygiene-task-card')).toHaveCount(0);

    // 2. Admin assigns hygiene_pilot role to parent.hygiene@example.com for PoC participation
    const assignPilotRes = await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'parent.hygiene@example.com',
        roles: ['hygiene_pilot'],
      },
    });
    expect(assignPilotRes.ok()).toBeTruthy();

    // 3. Reload MainPage: task card must now appear for the pilot parent!
    await parentPage.reload();
    await parentPage.waitForLoadState('networkidle');
    const hygieneTask = parentPage.getByTestId('main-page-hygiene-task-card');
    await expect(hygieneTask).toBeVisible();
    await expect(hygieneTask).toContainText('Hygiene-Folgebelehrung');
    // Never certified before: due date = family start + 12 months, shown with a day count
    await expect(parentPage.getByTestId('main-page-hygiene-task-desc')).toHaveText(
      /^Hygiene-Folgebelehrung bis \d{2}\.\d{2}\.\d{4} durchführen \(\d+ Tage\)\.$/,
    );

    // Click "Jetzt durchführen" to open the modal
    await parentPage.getByTestId('main-page-hygiene-task-start-btn').click();
    const modal = parentPage.getByTestId('hygiene-cert-modal');
    await expect(modal).toBeVisible();

    // Verify modal contains document preview iframe and checkbox
    await expect(parentPage.getByTestId('hygiene-cert-pdf-viewer')).toBeVisible();
    await expect(parentPage.getByTestId('hygiene-cert-pdf-page-1')).toBeVisible();
    await expect(parentPage.getByTestId('hygiene-cert-pdf-error')).toHaveCount(0);
    const confirmCheckbox = parentPage.getByTestId('hygiene-cert-checkbox');
    const submitBtn = parentPage.getByTestId('hygiene-cert-submit-btn');

    // Zoom controls re-render the pages and can be reset again
    await expect(parentPage.getByTestId('hygiene-cert-zoom-value')).toHaveText('100%');
    await parentPage.getByTestId('hygiene-cert-zoom-in').click();
    await expect(parentPage.getByTestId('hygiene-cert-zoom-value')).toHaveText('125%');
    await expect(parentPage.getByTestId('hygiene-cert-pdf-page-1')).toBeVisible();
    await parentPage.getByTestId('hygiene-cert-zoom-out').click();
    await expect(parentPage.getByTestId('hygiene-cert-zoom-value')).toHaveText('100%');
    await expect(parentPage.getByTestId('hygiene-cert-pdf-page-1')).toBeVisible();

    // Before scrolling to the end: scroll hint visible, confirmation locked
    await expect(parentPage.getByTestId('hygiene-cert-scroll-hint')).toBeVisible();
    await expect(confirmCheckbox).toBeDisabled();
    await expect(submitBtn).toBeDisabled();

    // Make sure the end of the document has been reached (scroll the dialog body to the bottom)
    await parentPage.getByTestId('hygiene-cert-scroll-body').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(confirmCheckbox).toBeEnabled();

    // Toolbar stays visible while scrolled to the bottom; statement contains the user's full name
    await expect(parentPage.getByTestId('hygiene-cert-zoom-in')).toBeInViewport();
    await expect(parentPage.getByTestId('hygiene-cert-checkbox-card')).toContainText('Ich, Helena Hygiene, habe die Folgebelehrung');

    // Submit should be disabled before checking
    await expect(submitBtn).toBeDisabled();
    await confirmCheckbox.check();
    await expect(submitBtn).toBeEnabled();

    // Submit certification
    await submitBtn.click();
    await expect(parentPage.getByTestId('hygiene-cert-success-banner')).toBeVisible();
    // Success banner must persist until the user explicitly closes it
    await parentPage.waitForTimeout(1500);
    await expect(parentPage.getByTestId('hygiene-cert-success-banner')).toBeVisible();
    await parentPage.getByTestId('hygiene-cert-success-close-btn').click();
    await expect(modal).toHaveCount(0);

    // After certification, home page task must disappear!
    await expect(parentPage.getByTestId('main-page-hygiene-task-card')).toHaveCount(0);

    // Step 4: Visit Kochen > Hygiene (Personal Hygiene Tab)
    await parentPage.goto('/#kochenHygiene');
    await parentPage.waitForLoadState('networkidle');

    // Verify "Eltern suchen..." is NOT present on kochenHygiene
    await expect(parentPage.getByPlaceholder('Eltern suchen...')).toHaveCount(0);

    await expect(parentPage.getByTestId('personal-hygiene-tab')).toBeVisible();
    await expect(parentPage.getByTestId('hygiene-status-badge-valid')).toBeVisible();
    await expect(parentPage.getByTestId('hygiene-status-badge-valid')).toContainText('Gültig');
    await expect(parentPage.getByTestId('personal-hygiene-message')).toHaveCount(0);

    // Should indicate certification was completed and show next due date (~11 months from now)
    await expect(parentPage.getByTestId('hygiene-next-date-val')).toBeVisible();

    // Step 5: Switch back to Admin to check Hygieneamt > Belehrungen table
    await adminPage.goto('/#hygieneBelehrung');
    await adminPage.waitForLoadState('networkidle');

    // Verify "Letzte Auffrischung" cell for Helena shows the date and the document link [📄]
    const refreshCell = adminPage.locator(`#cell-hygiene-refresh-${parentId}`);
    await expect(refreshCell).toBeVisible();
    const docLink = refreshCell.locator(`[data-testid="hygiene-pdf-link-${parentId}"]`);
    await expect(docLink).toBeVisible();

    // Step 6: Admin uploads a new document version (used in the regular cycle only)
    await adminPage.getByRole('button', { name: 'Hygieneamt/Belehrungsdokument' }).click();
    await expect(adminPage.getByTestId('hygiene-documents-table')).toBeVisible();

    await adminPage.locator('button[data-testid="hygiene-add-doc-btn"]').click();
    await expect(adminPage.getByTestId('hygiene-upload-wizard-modal')).toBeVisible();
    await adminPage.locator('input[data-testid="hygiene-wizard-file-input"]').setInputFiles({
      name: 'ifsg-belehrung-v2.pdf',
      mimeType: 'application/pdf',
      buffer: samplePdf,
    });
    // Selecting the file auto-continues to step 2
    await expect(adminPage.getByTestId('hygiene-wizard-preview-frame')).toBeVisible();
    await adminPage.locator('input[data-testid="hygiene-wizard-title-input"]').fill('Neufassung Belehrung 2026');
    await adminPage.locator('button[data-testid="hygiene-wizard-submit"]').click();
    await expect(adminPage.getByTestId('hygiene-upload-wizard-modal')).toHaveCount(0);
    await expect(adminPage.getByTestId('hygiene-active-doc-title')).toContainText('Neufassung Belehrung 2026');

    // Step 7: A new document does NOT trigger an immediate re-certification
    await parentPage.goto('/?exp_main=1#main');
    await parentPage.reload();
    await parentPage.waitForLoadState('networkidle');
    await expect(parentPage.getByTestId('main-page-hygiene-task-card')).toHaveCount(0);
    await parentPage.goto('/#kochenHygiene');
    await parentPage.reload();
    await parentPage.waitForLoadState('networkidle');
    await expect(parentPage.getByTestId('hygiene-status-badge-valid')).toBeVisible();
    await expect(parentPage.getByTestId('personal-hygiene-message')).toHaveCount(0);

    // Step 8: Document deletion test
    // Auto-accept confirmation dialogs
    adminPage.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await adminPage.goto('/#hygieneDocument');
    await adminPage.waitForLoadState('networkidle');

    // Delete both documents
    while ((await adminPage.locator('button[data-testid^="hygiene-doc-delete-"]').count()) > 0) {
      const deletePromise = adminPage.waitForResponse(
        (resp) => resp.url().includes('/api/hygiene/instruction-document/') && resp.request().method() === 'DELETE'
      );
      await adminPage.locator('button[data-testid^="hygiene-doc-delete-"]').first().click();
      await deletePromise;
      await adminPage.waitForTimeout(100);
    }

    // After deleting all documents, the empty state must be shown
    await expect(adminPage.getByTestId('hygiene-no-active-doc')).toBeVisible();

    // Step 9: In Hygieneamt > Belehrungen, Helena's certification should show document was deleted
    await adminPage.goto('/#hygieneBelehrung');
    await adminPage.waitForLoadState('networkidle');

    const deletedDocIndicator = adminPage.locator(`[data-testid="hygiene-pdf-deleted-${parentId}"]`);
    await expect(deletedDocIndicator).toBeVisible();
    await expect(deletedDocIndicator).toContainText('gelöscht');

    // Cleanup contexts
    await adminContext.close();
    await parentContext.close();
  });
});
