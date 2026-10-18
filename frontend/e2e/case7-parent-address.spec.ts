import { test, expect } from '@playwright/test';
import { combineAddressesToShared } from '../src/utils/address';

test.describe('combineAddressesToShared helper unit tests', () => {
  test('handles empty and whitespace addresses', () => {
    expect(combineAddressesToShared([])).toBe('');
    expect(combineAddressesToShared(['', '   '])).toBe('');
    expect(combineAddressesToShared([null, undefined, ''])).toBe('');
  });

  test('handles single non-empty address when other is empty', () => {
    expect(combineAddressesToShared(['Hauptstr. 1', ''])).toBe('Hauptstr. 1');
    expect(combineAddressesToShared(['', 'Gartenweg 2'])).toBe('Gartenweg 2');
    expect(combineAddressesToShared(['  Hauptstr. 1  ', '   '])).toBe('Hauptstr. 1');
  });

  test('joins multiple distinct addresses on "; "', () => {
    expect(combineAddressesToShared(['Hauptstr. 1', 'Gartenweg 2'])).toBe('Hauptstr. 1; Gartenweg 2');
    expect(combineAddressesToShared(['Addr 1', '', 'Addr 2', 'Addr 3'])).toBe('Addr 1; Addr 2; Addr 3');
  });
});

test.describe('Test Case 7: Parent Address Feature', () => {
  test.beforeEach(async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // 2. Mock authenticate as admin user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 3. Load application
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Familie hinzufügen' })).toBeVisible();
  });

  test('supports shared and individual parent addresses and transition edge case', async ({ page }) => {
    // --- Step 1: Create a family "Mustermann" with Parent 1 "Erika" and Parent 2 "Markus" ---
    await page.getByRole('button', { name: 'Familie hinzufügen' }).click();
    await page.locator('#f-p1-first').fill('Erika');
    await page.locator('#f-p1-last').fill('Mustermann');
    await page.locator('#f-p2-first').fill('Markus');
    await page.locator('#f-p2-last').fill('Mustermann');
    await page.locator('form').getByRole('button', { name: 'Familie hinzufügen' }).click();

    // Navigate to Parents tab ("Eltern(MGA)")
    const parentsTabBtn = page.getByRole('button', { name: 'Eltern(MGA)' });
    await expect(parentsTabBtn).toBeVisible();
    await parentsTabBtn.click();

    // Verify "Adresse" column header is present
    await expect(page.getByRole('columnheader', { name: 'Adresse' })).toBeVisible();

    // Locate parent rows for Erika and Markus
    const erikaRow = page.locator('tr', { hasText: 'Erika' });
    const markusRow = page.locator('tr', { hasText: 'Markus' });
    await expect(erikaRow).toBeVisible();
    await expect(markusRow).toBeVisible();

    // --- Step 2: Open Address Popover for Erika ---
    // Initially empty placeholder
    const erikaAddrCell = erikaRow.locator('td').filter({ hasText: /Adresse hinzufügen/i }).first();
    // Verify single-click does not open, double-click opens address popover
    await erikaAddrCell.click();
    const popover = page.locator('.glass-popup');
    await expect(popover).toBeHidden();
    await erikaAddrCell.dblclick();
    await expect(popover).toBeVisible();

    // Verify radio buttons: "gemeinsame Adresse" and "individuelle Adressen"
    const sharedRadio = popover.getByRole('radio', { name: 'gemeinsame Adresse' });
    const individualRadio = popover.getByRole('radio', { name: 'individuelle Adressen' });
    await expect(sharedRadio).toBeVisible();
    await expect(individualRadio).toBeVisible();

    // Since both parents have no address (equal empty), "gemeinsame Adresse" should be selected
    await expect(sharedRadio).toBeChecked();

    // Verify there is simply one text box for shared address
    const sharedInput = popover.getByRole('textbox', { name: 'gemeinsame Adresse' });
    await expect(sharedInput).toBeVisible();

    // Enter shared address and save
    await sharedInput.fill('Königstraße 1, 70173 Stuttgart');
    await popover.getByRole('button', { name: 'Speichern' }).click();
    await expect(popover).toBeHidden();

    // Verify both parents in the family now have the shared address
    await expect(erikaRow.locator('td', { hasText: 'Königstraße 1, 70173 Stuttgart' })).toBeVisible();
    await expect(markusRow.locator('td', { hasText: 'Königstraße 1, 70173 Stuttgart' })).toBeVisible();

    // --- Step 3: Switch to "individuelle Adressen" and set different addresses ---
    const markusAddrCell = markusRow.locator('td', { hasText: 'Königstraße 1, 70173 Stuttgart' });
    await markusAddrCell.locator('.cell-edit-pencil-btn').click();
    await expect(popover).toBeVisible();

    // Switch to individual mode
    await popover.getByRole('radio', { name: 'individuelle Adressen' }).click();
    await expect(popover.getByRole('radio', { name: 'individuelle Adressen' })).toBeChecked();

    // Verify one text box per parent given name appears
    const erikaIndInput = popover.getByRole('textbox', { name: 'Erika Adresse' });
    const markusIndInput = popover.getByRole('textbox', { name: 'Markus Adresse' });
    await expect(erikaIndInput).toBeVisible();
    await expect(markusIndInput).toBeVisible();

    // Change Markus's address to individual address
    await markusIndInput.fill('Schlossplatz 2, 70173 Stuttgart');
    await popover.getByRole('button', { name: 'Speichern' }).click();
    await expect(popover).toBeHidden();

    // Verify Erika still has Königstraße 1 and Markus has Schlossplatz 2
    await expect(erikaRow.locator('td', { hasText: 'Königstraße 1, 70173 Stuttgart' })).toBeVisible();
    await expect(markusRow.locator('td', { hasText: 'Schlossplatz 2, 70173 Stuttgart' })).toBeVisible();

    // --- Step 4: Edge Case - Going back from "individuelle Adressen" to "gemeinsame Adresse" ---
    // Open popover again via pencil button (parents now have different addresses, so individual mode opens initially)
    await erikaRow.locator('td', { hasText: 'Königstraße 1, 70173 Stuttgart' }).locator('.cell-edit-pencil-btn').click();
    await expect(popover).toBeVisible();
    await expect(popover.getByRole('radio', { name: 'individuelle Adressen' })).toBeChecked();

    // Switch to "gemeinsame Adresse": more than one address left -> joined on "; "
    await popover.getByRole('radio', { name: 'gemeinsame Adresse' }).click();
    await expect(popover.getByRole('textbox', { name: 'gemeinsame Adresse' })).toHaveValue(
      'Königstraße 1, 70173 Stuttgart; Schlossplatz 2, 70173 Stuttgart'
    );

    // Switch back to "individuelle Adressen" and test empty address ignored edge case
    await popover.getByRole('radio', { name: 'individuelle Adressen' }).click();
    await popover.getByRole('textbox', { name: 'Markus Adresse' }).fill('');

    // Erika has "Königstraße 1, 70173 Stuttgart", Markus is empty
    await popover.getByRole('radio', { name: 'gemeinsame Adresse' }).click();
    // Only 1 address left -> should be Erika's address without semicolon
    await expect(popover.getByRole('textbox', { name: 'gemeinsame Adresse' })).toHaveValue(
      'Königstraße 1, 70173 Stuttgart'
    );

    // Switch to individual, clear both addresses
    await popover.getByRole('radio', { name: 'individuelle Adressen' }).click();
    await popover.getByRole('textbox', { name: 'Erika Adresse' }).fill('');
    await popover.getByRole('textbox', { name: 'Markus Adresse' }).fill('');

    // Switch to shared: 0 addresses left -> should be empty
    await popover.getByRole('radio', { name: 'gemeinsame Adresse' }).click();
    await expect(popover.getByRole('textbox', { name: 'gemeinsame Adresse' })).toHaveValue('');

    // Cancel to discard without saving empty
    await popover.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(popover).toBeHidden();

    // --- Step 5: Reload page and verify persistence in DB and UI ---
    await page.reload();
    await parentsTabBtn.click();
    await expect(erikaRow.locator('td', { hasText: 'Königstraße 1, 70173 Stuttgart' })).toBeVisible();
    await expect(markusRow.locator('td', { hasText: 'Schlossplatz 2, 70173 Stuttgart' })).toBeVisible();
  });
});
