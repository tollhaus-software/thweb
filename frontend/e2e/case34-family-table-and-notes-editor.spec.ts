import { test, expect } from '@playwright/test';

test.describe('Test Case 34: 1-Row-Per-Family Table View and Universal Family Notes Editor', () => {
  test('families(MGA) single row per family layout with 6 columns and universal family notes editor', async ({ request, page }) => {
    // 1. Reset DB
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const todayStr = new Date().toISOString().split('T')[0];

    // 2. Create Family A with parent and child
    const fRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Erika',
            last_name: 'Mustermann',
            address: 'Musterweg 1',
            notes: 'Notes for parent Erika',
            emails: [{ value: 'erika@tollhaus.de', address_list: true }],
            phones: [{ value: '0170 123456', address_list: true }],
          },
          {
            first_name: 'Hans',
            last_name: 'Mustermann',
            address: 'Musterweg 1',
          },
        ],
      },
    });
    expect(fRes.ok()).toBeTruthy();
    const fam = await fRes.json();

    // Create child
    const childId = crypto.randomUUID();
    const cRes = await request.post(`/api/families/${fam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: childId,
        first_name: 'Max',
        last_name: 'Mustermann',
        birth_date: '2021-02-15',
        notes: 'Notes for child Max',
      },
    });
    expect(cRes.ok()).toBeTruthy();

    // Add group change for child
    await request.post(`/api/children/${childId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        change_date: todayStr,
        target_group: 1,
      },
    });

    // Update family-level notes
    const fNotesRes = await request.put(`/api/families/${fam.id}/notes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { notes: 'Family-wide notes for Mustermann' },
    });
    expect(fNotesRes.ok()).toBeTruthy();

    // Authenticate
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto('/');

    // Collapse sidebar if open
    const toggleSidebarBtn = page.getByRole('button', { name: 'Seitenleiste umschalten' });
    if (await toggleSidebarBtn.isVisible()) {
      await toggleSidebarBtn.click();
    }

    // Navigate to MGA -> Familien(MGA)
    const mgaCatBtn = page.getByRole('button', { name: 'MGA', exact: true });
    if (await mgaCatBtn.isVisible()) {
      await mgaCatBtn.click();
    }
    const familiesMgaBtn = page.getByRole('button', { name: 'Familien(MGA)' });
    await expect(familiesMgaBtn).toBeVisible();
    await familiesMgaBtn.click();

    // --- Verification of 1-row-per-family table structure ---
    const famRow = page.locator(`tr#row-${fam.id}`);
    await expect(famRow).toBeVisible();

    // Column 1: Familienname
    const famNameCell = famRow.locator('td[data-column-id="family_name"]');
    await expect(famNameCell).toContainText('Mustermann');

    // Column 2: Parents
    const parentsCell = famRow.locator('td[data-column-id="parents"]');
    await expect(parentsCell).toContainText('Erika Mustermann');
    // Check right-aligned add parent '+' button exists on the parent row
    const addParentBtn = parentsCell.locator('button.family-add-button');
    await expect(addParentBtn).toBeVisible();

    // Column 3: Children
    const childrenCell = famRow.locator('td[data-column-id="children"]');
    await expect(childrenCell).toContainText('Max Mustermann');
    // Check birth date and group summary are displayed
    await expect(childrenCell).toContainText('15.02.2021');
    await expect(childrenCell).toContainText('Kleine Gr.');
    // Check that child birth date has no easy-edit button, but group summary has pencil button
    await expect(childrenCell.locator('.easy-edit-button')).toHaveCount(0);
    const groupPencilBtn = childrenCell.locator('.cell-edit-pencil-btn');
    await expect(groupPencilBtn).toHaveCount(1);
    await expect(groupPencilBtn).toBeVisible();
    // Check right-aligned add child '+' button exists on the child row
    const addChildBtn = childrenCell.locator('button.family-add-button');
    await expect(addChildBtn).toBeVisible();

    // Column 4: Paten
    const patenCell = famRow.locator('td[data-column-id="paten"]');
    await expect(patenCell).toContainText('-');
    const patenManageBtn = patenCell.locator('button[title="Paten verwalten"]');
    await expect(patenManageBtn).toBeVisible();
    // Check that the Paten pencil button is right-aligned in the paten cell
    const patenCellBox = await patenCell.boundingBox();
    const patenBtnBox = await patenManageBtn.boundingBox();
    expect(patenCellBox).not.toBeNull();
    expect(patenBtnBox).not.toBeNull();
    expect(patenBtnBox!.x + patenBtnBox!.width).toBeGreaterThan(patenCellBox!.x + patenCellBox!.width - 40);

    // Column 5: Paten von
    const patenVonCell = famRow.locator('td[data-column-id="paten_von"]');
    await expect(patenVonCell).toContainText('-');

    // Column 6: Notes (family-wide)
    const notesCell = famRow.locator('td[data-column-id="notes"]');
    await expect(notesCell).toContainText('Family-wide notes for Mustermann');

    // --- Open Family Notes Editor from Family Row ---
    const editFamilyNotesBtn = notesCell.locator('button[title="Notizen bearbeiten"]');
    await editFamilyNotesBtn.click();

    // Popover opens
    const popover = page.locator('.glass-popup');
    await expect(popover).toBeVisible();
    await expect(popover).toContainText('Familiennotizen: Mustermann');

    // Exactly 1 textarea editor exists in the popover (for the family notes card)
    await expect(popover.locator('textarea')).toHaveCount(1);

    // 1. Family section has active textarea editor
    const familySection = popover.locator('#family-notes-section-family');
    await expect(familySection).toBeVisible();
    await expect(familySection.locator('textarea')).toHaveValue('Family-wide notes for Mustermann');

    // 2. Parent section (Erika) rendered as formatted text card, no textarea, has "Bearbeiten" button
    const erikaSection = popover.locator(`[id*="family-notes-section-parent-"]:has-text("Erika")`);
    await expect(erikaSection).toBeVisible();
    await expect(erikaSection).toContainText('Erika Mustermann');
    await expect(erikaSection).toContainText('Notes for parent Erika');
    await expect(erikaSection.locator('textarea')).toHaveCount(0);
    const erikaEditBtn = erikaSection.getByRole('button', { name: 'Bearbeiten' });
    await expect(erikaEditBtn).toBeVisible();

    // Parent section (Hans) has no notes and must display "(keine Notizen)"
    const hansSection = popover.locator(`[id*="family-notes-section-parent-"]:has-text("Hans")`);
    await expect(hansSection).toBeVisible();
    await expect(hansSection).toContainText('(keine Notizen)');

    // 3. Child section (Max) rendered as formatted text card, no textarea
    const childSection = popover.locator(`[id*="family-notes-section-child-"]`);
    await expect(childSection).toBeVisible();
    await expect(childSection).toContainText('Max Mustermann');
    await expect(childSection).toContainText('Notes for child Max');
    await expect(childSection.locator('textarea')).toHaveCount(0);

    // Stable order check: Family is 1st, Erika is 2nd, Hans is 3rd, Child is 4th
    const allCards = popover.locator('[id^="family-notes-section-"]');
    await expect(allCards).toHaveCount(4);
    await expect(allCards.nth(0)).toHaveId('family-notes-section-family');
    await expect(allCards.nth(1)).toContainText('Erika Mustermann');
    await expect(allCards.nth(2)).toContainText('Hans Mustermann');
    await expect(allCards.nth(3)).toContainText('Max Mustermann');

    // Clicking "Bearbeiten" on Erika's card switches the editor in-place without changing card order
    await erikaEditBtn.click();
    await expect(popover.locator('textarea')).toHaveCount(1);
    await expect(erikaSection.locator('textarea')).toHaveValue('Notes for parent Erika');
    await expect(familySection.locator('textarea')).toHaveCount(0);
    // Order remains stable
    await expect(allCards.nth(0)).toHaveId('family-notes-section-family');
    await expect(allCards.nth(1)).toContainText('Erika Mustermann');
    await expect(allCards.nth(2)).toContainText('Hans Mustermann');
    await expect(allCards.nth(3)).toContainText('Max Mustermann');

    // Close popover
    await popover.getByRole('button', { name: 'Schließen' }).click();
    await expect(popover).not.toBeVisible();

    // --- Open Family Notes Editor from Eltern(MGA) tab ---
    const parentsTabBtn = page.getByRole('button', { name: 'Eltern(MGA)' });
    await parentsTabBtn.click();

    const parentNotesCell = page.locator('td[data-column-id="notes"]').first();
    await expect(parentNotesCell).toContainText('Notes for parent Erika');
    await parentNotesCell.locator('button[title="Notizen bearbeiten"]').click();

    await expect(popover).toBeVisible();
    // Erika's card is in edit mode in its stable second position
    await expect(popover.locator('textarea')).toHaveCount(1);
    await expect(erikaSection.locator('textarea')).toHaveValue('Notes for parent Erika');
    await expect(allCards).toHaveCount(4);
    await expect(allCards.nth(0)).toHaveId('family-notes-section-family');
    await expect(allCards.nth(1)).toContainText('Erika Mustermann');
    await expect(allCards.nth(2)).toContainText('Hans Mustermann');
    await expect(allCards.nth(3)).toContainText('Max Mustermann');

    // Close popover
    await popover.getByRole('button', { name: 'Schließen' }).click();
    await expect(popover).not.toBeVisible();

    // --- Open Family Notes Editor from Kinder(MGA) tab ---
    const childrenTabBtn = page.getByRole('button', { name: 'Kinder(MGA)' });
    await childrenTabBtn.click();

    const childNotesCell = page.locator('td[data-column-id="notes"]').first();
    await expect(childNotesCell).toContainText('Notes for child Max');
    await childNotesCell.locator('button[title="Notizen bearbeiten"]').click();

    await expect(popover).toBeVisible();
    // Child card is in edit mode in its stable fourth position
    await expect(popover.locator('textarea')).toHaveCount(1);
    const childTextarea = childSection.locator('textarea');
    await expect(childTextarea).toHaveValue('Notes for child Max');
    await expect(allCards).toHaveCount(4);
    await expect(allCards.nth(0)).toHaveId('family-notes-section-family');
    await expect(allCards.nth(1)).toContainText('Erika Mustermann');
    await expect(allCards.nth(2)).toContainText('Hans Mustermann');
    await expect(allCards.nth(3)).toContainText('Max Mustermann');

    // Test editing child notes inside the universal editor
    await childTextarea.fill('Updated child notes for Max!');
    const childSaveBtn = childSection.getByRole('button', { name: 'Speichern' });
    await expect(childSaveBtn).toBeEnabled();
    await childSaveBtn.click();
    await expect(childSection).toContainText('Gespeichert');

    // Close popover and verify updated notes show in the table cell
    await popover.getByRole('button', { name: 'Schließen' }).click();
    await expect(page.locator('td[data-column-id="notes"]').first()).toContainText('Updated child notes for Max!');
  });

  test('displays "(nicht im Tollhaus)" with pencil button for child with no group changes and allows adding group change', async ({ request, page }) => {
    // Reset DB
    await request.post('/api/test/reset');

    // Create family with a child that has NO group changes
    const createFamRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [{ first_name: 'Julia', last_name: 'Klaus', emails: [{ value: 'julia@example.com', identifier_email: true, address_list: true }] }],
      },
    });
    expect(createFamRes.ok()).toBeTruthy();
    const fam = await createFamRes.json();

    const childId = crypto.randomUUID();
    const createChildRes = await request.post(`/api/families/${fam.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: childId,
        family_id: fam.id,
        first_name: 'Lukas',
        last_name: 'Klaus',
        birth_date: '2023-05-10',
      },
    });
    expect(createChildRes.ok()).toBeTruthy();
    // No group changes added for Lukas

    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto('/');

    const toggleSidebarBtn = page.getByRole('button', { name: 'Seitenleiste umschalten' });
    if (await toggleSidebarBtn.isVisible()) {
      await toggleSidebarBtn.click();
    }

    // Navigate to MGA -> Familien(MGA)
    const mgaCatBtn = page.getByRole('button', { name: 'MGA', exact: true });
    if (await mgaCatBtn.isVisible()) {
      await mgaCatBtn.click();
    }
    const familiesMgaBtn = page.getByRole('button', { name: 'Familien(MGA)' });
    await expect(familiesMgaBtn).toBeVisible();
    await familiesMgaBtn.click();

    const famRow = page.locator(`tr#row-${fam.id}`);
    await expect(famRow).toBeVisible();

    const childrenCell = famRow.locator('td[data-column-id="children"]');
    await expect(childrenCell).toContainText('Lukas Klaus');
    // Field must display "(nicht im Tollhaus)"
    await expect(childrenCell).toContainText('(nicht im Tollhaus)');

    // Pencil button must exist next to "(nicht im Tollhaus)"
    const groupPencilBtn = childrenCell.locator('.cell-edit-pencil-btn');
    await expect(groupPencilBtn).toBeVisible();

    // Switch to mobile viewport (<= 768px) and verify adaptive card layout also displays "(nicht im Tollhaus)" with pencil
    await page.setViewportSize({ width: 500, height: 800 });
    const mobileFamCard = page.locator(`tr#row-${fam.id}`);
    await expect(mobileFamCard).toBeVisible();
    const mobileChildrenCell = mobileFamCard.locator('td[data-column-id="children"]');
    await expect(mobileChildrenCell).toContainText('(nicht im Tollhaus)');
    const mobileGroupPencilBtn = mobileChildrenCell.locator('.cell-edit-pencil-btn');
    await expect(mobileGroupPencilBtn).toBeVisible();

    // Reset back to desktop viewport
    await page.setViewportSize({ width: 1280, height: 850 });

    // Click pencil button to open GroupChangesPopover
    await groupPencilBtn.click();

    // Popover opens
    const popover = page.locator('.glass-popup');
    await expect(popover).toBeVisible();
    await expect(popover).toContainText('Kleine Gruppe');

    // Add row form is open; save a new group change for Lukas (Kleine Gruppe)
    const saveGroupBtn = popover.locator('button[title="Speichern"]');
    await expect(saveGroupBtn).toBeVisible();
    await saveGroupBtn.click();

    // Close popover by pressing Escape or clicking outside
    await page.keyboard.press('Escape');
    await expect(popover).not.toBeVisible();

    // Lukas now displays the newly assigned group instead of "(nicht im Tollhaus)"
    await expect(childrenCell).toContainText('Kleine Gr.');
    await expect(childrenCell).not.toContainText('(nicht im Tollhaus)');
  });
});
