import { test, expect } from '@playwright/test';

test.describe('Test Case 46: Contact Consent in Eltern Tab & Removal of Alumni Tab', () => {
  test.beforeEach(async ({ request, page }) => {
    // 1. Reset database state to ensure clean environment
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Mock authenticate as admin user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Load application
    await page.goto('/#families');
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();
  });

  test('default filter in Eltern is Aktive, contact_consent is hidden by default, can be toggled on via column picker, and Ehemalige subtab is removed', async ({ page }) => {
    // --- Step 1: Verify Ehemalige subtab button does NOT exist in MGA section ---
    const alumniTabBtn = page.getByRole('button', { name: 'Ehemalige(MGA)', exact: true });
    await expect(alumniTabBtn).toHaveCount(0);

    // --- Step 2: In Eltern tab, verify default lifecycle filter is "Aktive" ---
    await page.getByRole('button', { name: 'Eltern(MGA)', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Aktive', exact: true })).toHaveClass(/active/);

    // Verify contact_consent column is NOT present by default in Eltern tab
    const elternConsentHeader = page.locator('th', { hasText: 'Kontakt-Einwilligung' });
    await expect(elternConsentHeader).toHaveCount(0);

    // --- Step 3: Open Columns toggle popover and verify "Kontakt-Einwilligung" is unchecked by default ---
    const columnsBtn = page.locator('button.table-header-columns-btn');
    await expect(columnsBtn).toBeVisible();
    await columnsBtn.click();

    const columnPopover = page.locator('.glass-popup');
    await expect(columnPopover).toBeVisible();
    const consentCheckboxLabel = columnPopover.locator('label', { hasText: 'Kontakt-Einwilligung' });
    await expect(consentCheckboxLabel).toBeVisible();
    const consentCheckbox = consentCheckboxLabel.locator('input[type="checkbox"]');
    await expect(consentCheckbox).not.toBeChecked();

    // Toggle contact_consent ON
    await consentCheckbox.check();
    await page.keyboard.press('Escape');

    // Verify contact_consent column IS now visible in the Eltern table
    await expect(elternConsentHeader).toBeVisible();

    // --- Step 4: Add historical alumni family "Altmann" ---
    const addFamilyBtn = page.locator('button.add-family-button');
    await addFamilyBtn.click();
    const familyModal = page.locator('.modal-container');
    await expect(familyModal).toBeVisible();

    const historicalAlumniCheckbox = page.locator('#f-historical-alumni');
    await expect(historicalAlumniCheckbox).toBeVisible();
    await historicalAlumniCheckbox.check();

    await page.locator('#f-p1-first').fill('Johannes');
    await page.locator('#f-p1-last').fill('Altmann');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();
    await expect(familyModal).toBeHidden();

    // Altmann is former, so under "Aktive" filter he should not be visible
    await expect(page.locator('tr.family-group-row', { hasText: 'Altmann' })).toHaveCount(0);

    // Switch lifecycle filter in Eltern tab to "Ehemalige"
    await page.getByRole('button', { name: 'Ehemalige', exact: true }).click();
    const alumniRow = page.locator('tr.family-group-row', { hasText: 'Altmann' });
    await expect(alumniRow).toBeVisible();

    // Verify consent cell is visible for Johannes Altmann
    const consentCell = page.locator('td[data-column-id="contact_consent"]');
    await expect(consentCell).toBeVisible();

    // Switch lifecycle filter in Eltern tab to "Alle"
    await page.getByRole('button', { name: 'Alle', exact: true }).click();
    await expect(page.locator('tr.family-group-row', { hasText: 'Altmann' })).toBeVisible();
  });

  test('manages contact consent on desktop and mobile in Eltern tab', async ({ page }) => {
    // 1. Add historical alumni family Altmann
    await page.getByRole('button', { name: 'Eltern(MGA)', exact: true }).click();
    await page.locator('button.add-family-button').click();
    await page.locator('#f-historical-alumni').check();
    await page.locator('#f-p1-first').fill('Johannes');
    await page.locator('#f-p1-last').fill('Altmann');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    // 2. Switch filter to "Ehemalige" and enable Contact Consent column
    await page.getByRole('button', { name: 'Ehemalige', exact: true }).click();
    const columnsBtn = page.locator('button.table-header-columns-btn');
    await columnsBtn.click();
    const consentCheckboxLabel = page.locator('.glass-popup label', { hasText: 'Kontakt-Einwilligung' });
    await consentCheckboxLabel.locator('input[type="checkbox"]').check();
    await page.keyboard.press('Escape');

    // 3. Add an email to Johannes Altmann
    const parentRow = page.locator('tbody tr', { hasText: 'Johannes' });
    await expect(parentRow).toBeVisible();
    const emailCell = parentRow.locator('.emails-cell-wrapper');
    await emailCell.dblclick();
    const emailPopover = page.locator('.multivalue-popover');
    await expect(emailPopover).toBeVisible();
    const addInput = emailPopover.locator('input[type="text"]');
    await expect(addInput).toBeVisible();
    await addInput.fill('alumni.altmann@example.com');
    await addInput.press('Enter');
    await page.keyboard.press('Escape');
    await expect(parentRow).toContainText('alumni.altmann@example.com');

    // 4. Grant contact consent
    const consentCell = parentRow.locator('.consent-cell-wrapper');
    await expect(consentCell).toBeVisible();
    await consentCell.click();

    const consentModal = page.locator('.contact-consent-popover');
    await expect(consentModal).toBeVisible();

    // Verify date in editor is formatted as DD.MM.YYYY
    const dateInput = consentModal.locator('input[type="text"]').first();
    const dateVal = await dateInput.inputValue();
    expect(dateVal).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);

    const saveConsentBtn = consentModal.getByRole('button', { name: 'Speichern' });
    await expect(saveConsentBtn).toBeVisible();
    await saveConsentBtn.click();
    await consentModal.locator('button.secondary-button', { hasText: 'Schließen' }).click();
    await expect(consentModal).toBeHidden();

    // Verify cell updated to granted with date formatted ("Erteilt (DD.MM.TTTT)")
    await expect(consentCell).toContainText('Erteilt (');
    await expect(consentCell).toContainText(dateVal);

    // 5. Test multi-entry history: Add a newer consent entry ("Widerrufen")
    await consentCell.click();
    await expect(consentModal).toBeVisible();

    // History table currently has 1 entry
    const historyRows = consentModal.locator('tbody tr');
    await expect(historyRows).toHaveCount(1);

    // Click "+ Einwilligung hinzufügen"
    const addConsentBtn = consentModal.getByRole('button', { name: 'Einwilligung hinzufügen' });
    await expect(addConsentBtn).toBeVisible();
    await addConsentBtn.click();

    // New row appears: select Widerrufen and save
    const newStatusSelect = consentModal.locator('tbody tr').last().locator('select');
    await newStatusSelect.selectOption('revoked');
    await consentModal.locator('tbody tr').last().getByRole('button', { name: 'Speichern' }).click();
    await expect(consentModal.locator('tbody tr')).toHaveCount(2);
    await consentModal.locator('button.secondary-button', { hasText: 'Schließen' }).click();
    await expect(consentModal).toBeHidden();

    // Table cell now shows the newest entry: "Widerrufen (DD.MM.TTTT)"
    await expect(consentCell).toContainText('Widerrufen (');

    // 6. Test mobile responsive view (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('.table-zoom-control-container.desktop-only')).toBeHidden();

    // Mobile filter button exists and opens popover
    const mobileFilterBtn = page.locator('.lifecycle-filter-button.mobile-only');
    await expect(mobileFilterBtn).toBeVisible();
    await mobileFilterBtn.click();

    const formerFilterOption = page.locator('button.lifecycle-filter-option-btn', { hasText: 'Ehemalige' });
    await expect(formerFilterOption).toBeVisible();
    await formerFilterOption.click();
    await expect(formerFilterOption).toBeHidden();

    // Altmann is visible under Ehemalige filter on mobile
    await expect(page.locator('.table-container')).toContainText('Altmann');
  });

  test('navigating directly to /#alumni redirects to /#parents', async ({ page }) => {
    // Direct navigation to http://localhost/#alumni redirects to #parents
    await page.goto('/#alumni');
    await expect(page).toHaveURL(/#parents$/);
    await expect(page.locator('.search-input')).toHaveAttribute('placeholder', 'Eltern suchen...');
  });
});
