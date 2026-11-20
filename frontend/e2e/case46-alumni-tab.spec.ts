import { test, expect } from '@playwright/test';

test.describe('Test Case 46: Dedicated Alumni (Ehemalige) Tab & Lifecycle Filtering', () => {
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

  test('default filter in Eltern is Aktive, contact_consent is hidden, and Ehemalige tab shows alumni features', async ({ page }) => {
    // --- Step 1: In Eltern tab, verify default lifecycle filter is "Aktive" and contact_consent is not present ---
    await page.getByRole('button', { name: 'Eltern(MGA)', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Aktive', exact: true })).toHaveClass(/active/);

    // Verify contact_consent column is NOT present in Eltern tab
    const elternConsentHeader = page.locator('th', { hasText: 'Kontakt-Einwilligung' });
    await expect(elternConsentHeader).toHaveCount(0);

    // --- Step 2: Navigate to Ehemalige tab ---
    const alumniTabBtn = page.getByRole('button', { name: 'Ehemalige(MGA)', exact: true });
    await expect(alumniTabBtn).toBeVisible();
    await alumniTabBtn.click();

    // Verify search input placeholder
    const searchInput = page.locator('.mga-controls-row-1 input.search-input');
    await expect(searchInput).toHaveAttribute('placeholder', 'Ehemalige suchen...');

    // Verify Copy Emails button is not present
    await expect(page.locator('.alumni-copy-emails-btn')).toHaveCount(0);

    // Verify lifecycle filter segmented control is NOT shown in Ehemalige tab
    await expect(page.locator('.lifecycle-filter-toggle')).toHaveCount(0);

    // Verify Add button in Ehemalige tab says "Ehemalige hinzufügen"
    const addAlumniBtn = page.locator('button.add-family-button');
    await expect(addAlumniBtn).toBeVisible();
    await expect(addAlumniBtn).toContainText('Ehemalige hinzufügen');

    // --- Step 3: Open Add Alumni dialog and verify "Historische Ehemalige" checkbox is checked by default ---
    await addAlumniBtn.click();
    const familyModal = page.locator('.modal-container');
    await expect(familyModal).toBeVisible();

    const historicalAlumniCheckbox = page.locator('#f-historical-alumni');
    await expect(historicalAlumniCheckbox).toBeChecked();

    // Add historical alumni family "Altmann"
    await page.locator('#f-p1-first').fill('Johannes');
    await page.locator('#f-p1-last').fill('Altmann');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();
    await expect(familyModal).toBeHidden();

    // --- Step 4: Verify Altmann appears in Ehemalige tab ---
    const alumniRow = page.locator('tr.family-group-row', { hasText: 'Altmann' });
    await expect(alumniRow).toBeVisible();

    // Verify contact_consent column IS present in Ehemalige tab
    const alumniConsentHeader = page.locator('th', { hasText: 'Kontakt-Einwilligung' });
    await expect(alumniConsentHeader).toBeVisible();

    // Verify consent cell is visible for Johannes Altmann (defaults to no consent / not granted)
    const consentCell = page.locator('td[data-column-id="contact_consent"]');
    await expect(consentCell).toBeVisible();

    // --- Step 5: Switch back to Eltern tab and verify Altmann is not visible under default "Aktive" filter ---
    await page.getByRole('button', { name: 'Eltern(MGA)', exact: true }).click();
    await expect(page.locator('tr.family-group-row', { hasText: 'Altmann' })).toHaveCount(0);

    // Switch lifecycle filter in Eltern tab to "Ehemalige"
    await page.getByRole('button', { name: 'Ehemalige', exact: true }).click();
    await expect(page.locator('tr.family-group-row', { hasText: 'Altmann' })).toBeVisible();

    // Switch lifecycle filter in Eltern tab to "Alle"
    await page.getByRole('button', { name: 'Alle', exact: true }).click();
    await expect(page.locator('tr.family-group-row', { hasText: 'Altmann' })).toBeVisible();
  });

  test('manages contact consent on desktop and mobile', async ({ page }) => {
    // 1. Go to Alumni tab and add an alumni family with parent Johannes Altmann
    await page.getByRole('button', { name: 'Ehemalige(MGA)', exact: true }).click();
    await page.locator('button.add-family-button').click();
    await page.locator('#f-p1-first').fill('Johannes');
    await page.locator('#f-p1-last').fill('Altmann');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    // 2. Add an email to Johannes Altmann
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

    // 2b. Test membership default in Ehemalige tab: row without membership should default to Förder (supporting_member)
    const membershipCell = parentRow.locator('.membership-cell-wrapper');
    await expect(membershipCell).toBeVisible();
    await membershipCell.locator('.cell-edit-pencil-btn').click();
    const membershipsModal = page.locator('.memberships-popover');
    await expect(membershipsModal).toBeVisible();
    const membershipTypeSelect = membershipsModal.locator('select');
    await expect(membershipTypeSelect).toBeVisible();
    await expect(membershipTypeSelect).toHaveValue('supporting_member');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(membershipsModal).toBeHidden();

    // 3. Grant contact consent
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

    // 4. Test multi-entry history: Add a newer consent entry ("Widerrufen")
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

    // 5. Test mobile responsive view (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('.table-zoom-control-container.desktop-only')).toBeHidden();

    // Go to Eltern tab in mobile view
    await page.getByRole('button', { name: 'Eltern(MGA)', exact: true }).click();

    // Mobile filter button exists and opens popover
    const mobileFilterBtn = page.locator('.lifecycle-filter-button.mobile-only');
    await expect(mobileFilterBtn).toBeVisible();
    await mobileFilterBtn.click();

    const formerFilterOption = page.locator('button.lifecycle-filter-option-btn', { hasText: 'Ehemalige' });
    await expect(formerFilterOption).toBeVisible();
    await formerFilterOption.click();
    await expect(formerFilterOption).toBeHidden();

    // Altmann is now visible under Ehemalige filter on mobile
    await expect(page.locator('.table-container')).toContainText('Altmann');
  });

  test('navigating directly to /#alumni and switching from main menu shows existing data immediately', async ({ page, request }) => {
    // 1. Seed an alumni family via API first
    const createRes = await request.post('/api/families', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer developer@example.com',
      },
      data: {
        family_type: 'historical_alumni',
        parents: [
          {
            first_name: 'Erika',
            last_name: 'Muster-Alumni',
            emails: [],
            phones: [],
          },
        ],
      },
    });
    expect(createRes.ok()).toBeTruthy();

    // 2. Direct navigation to http://localhost/#alumni on fresh page load
    await page.goto('/#alumni');

    // Verify it stays on #alumni and does NOT redirect to main page
    await expect(page).toHaveURL(/#alumni$/);
    const searchInput = page.locator('.mga-controls-row-1 input.search-input');
    await expect(searchInput).toHaveAttribute('placeholder', 'Ehemalige suchen...');

    // Verify pre-existing data is visible immediately on initial load without adding a family
    await expect(page.locator('tr.family-group-row', { hasText: 'Muster-Alumni' })).toBeVisible();

    // 3. Navigate away to Eltern tab
    await page.getByRole('button', { name: 'Eltern(MGA)', exact: true }).click();
    await expect(page).toHaveURL(/#parents$/);

    // 4. Click through menu to Ehemalige tab
    const alumniTabBtn = page.getByRole('button', { name: 'Ehemalige(MGA)', exact: true });
    await expect(alumniTabBtn).toBeVisible();
    await alumniTabBtn.click();
    await expect(page).toHaveURL(/#alumni$/);

    // Verify pre-existing data is visible immediately after menu navigation as well
    await expect(page.locator('tr.family-group-row', { hasText: 'Muster-Alumni' })).toBeVisible();

    // 5. Navigate to MGA landing page and verify sidebar subtab works
    await page.goto('/#mga');
    const mgaSubTree = page.locator('[data-testid="sidebar-subtree-mga"]');
    await expect(mgaSubTree).toBeVisible();
    await mgaSubTree.locator('[data-testid="sidebar-subtab-alumni"]').click();
    await expect(page).toHaveURL(/#alumni$/);
    await expect(page.locator('tr.family-group-row', { hasText: 'Muster-Alumni' })).toBeVisible();
  });
});
