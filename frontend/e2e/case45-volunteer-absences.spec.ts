import { test, expect } from '@playwright/test';

test.describe('Test Case 45: Volunteer Absences (Abwesenheit Freiwillige)', () => {
  test('verifies permissions scoping, calendar/list view, overlap validation, and CRUD operations', async ({ request, page }) => {
    // Step 1: Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    // Step 2: Seed reader user (volunteers.absences.read ONLY)
    const readerRes = await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'volunteer-reader@example.com',
        roles: [],
        permissions: ['volunteers.absences.read'],
      },
    });
    expect(readerRes.ok()).toBeTruthy();

    // Step 3: Seed writer user (volunteers.absences.write ONLY)
    const writerRes = await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'volunteer-writer@example.com',
        roles: [],
        permissions: ['volunteers.absences.write'],
      },
    });
    expect(writerRes.ok()).toBeTruthy();

    // =========================================================================
    // Part 1: Verify as Unauthorized User (viewer@example.com)
    // =========================================================================
    const unauthorizedPage = await page.context().newPage();
    await unauthorizedPage.addInitScript(() => {
      localStorage.setItem('token', 'viewer@example.com');
    });

    await unauthorizedPage.goto('/#volunteerAbsences');
    // Tab "Abwesenheit Freiwillige" should NOT be accessible or visible
    await expect(unauthorizedPage.getByRole('button', { name: /Abwesenheit Freiwillige/i })).toBeHidden();
    await unauthorizedPage.close();

    // =========================================================================
    // Part 2: Verify as Reader User (volunteers.absences.read)
    // =========================================================================
    const readerPage = await page.context().newPage();
    await readerPage.addInitScript(() => {
      localStorage.setItem('token', 'volunteer-reader@example.com');
    });

    await readerPage.goto('/');
    // Check PA section or direct navigation
    await readerPage.goto('/#volunteerAbsences');
    await expect(readerPage.getByTestId('volunteer-absences-tab')).toBeVisible();

    // Verify "+ Abwesenheit eintragen" is NOT visible for read-only user
    await expect(readerPage.getByRole('button', { name: /(Abwesenheit eintragen|Add Absence)/i })).toBeHidden();
    // Verify "BuFDI Name(n) (für Kochansicht):" field is present and disabled for read-only user
    await expect(readerPage.getByTestId('va-bufdi-name-input')).toBeVisible();
    await expect(readerPage.getByTestId('va-bufdi-name-input')).toBeDisabled();
    await expect(readerPage.getByTestId('va-bufdi-name-save-btn')).toBeHidden();
    await readerPage.close();

    // =========================================================================
    // Part 3: Verify as Writer User (volunteers.absences.write)
    // =========================================================================
    await page.addInitScript(() => {
      localStorage.setItem('token', 'volunteer-writer@example.com');
    });

    await page.goto('/#volunteerAbsences');
    await expect(page.getByTestId('volunteer-absences-tab')).toBeVisible();

    // Verify search bar and Undo/Redo are hidden on this view
    await expect(page.locator('.controls-row')).toBeHidden();
    await expect(page.locator('button[title="Undo"]')).toBeHidden();

    // Verify "BuFDI Name(n) (für Kochansicht):" field is editable and can be saved
    const bufdiNameInput = page.getByTestId('va-bufdi-name-input');
    await expect(bufdiNameInput).toBeVisible();
    await expect(bufdiNameInput).toBeEnabled();
    await bufdiNameInput.fill('Max');
    const bufdiSaveBtn = page.getByTestId('va-bufdi-name-save-btn');
    await expect(bufdiSaveBtn).toBeEnabled();
    await bufdiSaveBtn.click();
    await expect(page.getByTestId('va-bufdi-name-saved-badge')).toBeVisible();
    await expect(bufdiNameInput).toHaveValue('Max');

    // Verify "+ Abwesenheit eintragen" IS visible
    const addBtn = page.getByRole('button', { name: /(Abwesenheit eintragen|Add Absence)/i });
    await expect(addBtn).toBeVisible();

    // Open add modal
    await addBtn.click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit eintragen|Add Absence)/i })).toBeVisible();

    // Fill form: Start 2026-11-10, End 2026-11-15, Note "Bufdi Seminar A"
    const startInput = page.locator('.va-modal input[placeholder="TT.MM.JJJJ"]').first();
    const endInput = page.locator('.va-modal input[placeholder="TT.MM.JJJJ"]').nth(1);
    const noteInput = page.locator('#va-note-input');

    await startInput.fill('10.11.2026');
    await endInput.fill('15.11.2026');
    await noteInput.fill('Bufdi Seminar A');

    // Save
    await page.locator('.va-modal').getByRole('button', { name: /(Speichern|Save)/i }).click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit eintragen|Add Absence)/i })).toBeHidden();

    // Switch to List view (Desktop)
    await page.getByRole('button', { name: /(Liste|List)/i }).click();
    await expect(page.locator('.va-desktop-table')).toBeVisible();
    await expect(page.locator('.va-mobile-cards')).toBeHidden();
    await expect(page.locator('.va-desktop-table').getByText('10.11.2026 – 15.11.2026')).toBeVisible();
    await expect(page.locator('.va-desktop-table').getByText('Bufdi Seminar A')).toBeVisible();
    await expect(page.locator('.va-desktop-table').getByText(/6 (Tage|days)/i)).toBeVisible();

    // Switch back to Calendar view to test markings, colors, and hover
    await page.getByRole('button', { name: /(Kalender|Calendar)/i }).click();

    // Weekdays without absence should have greenish styling
    const day24 = page.locator('.va-day-cell:has-text("24")').first();
    await expect(day24).toHaveClass(/is-weekday-ok/);

    // Weekends should have weekend class and not greenish
    const day22 = page.locator('.va-day-cell:has-text("22")').first(); // Sunday
    await expect(day22).toHaveClass(/is-weekend/);
    await expect(day22).not.toHaveClass(/is-weekday-ok/);

    // Hover over existing absence (10.11 - 15.11)
    const day12 = page.locator('.va-day-cell:has-text("12")').first();
    await day12.hover();
    await expect(day12).toHaveClass(/is-absence-hovered/);
    await expect(day12.locator('.va-hover-pencil')).toBeVisible();

    // Test Two-Click Range Selection Flow:
    // Click Day 23 (start date)
    const day23 = page.locator('.va-day-cell:has-text("23")').first();
    await day23.click();

    // Selection bar appears with "Enddatum auswählen"
    const selectionBar = page.locator('.va-selection-bar');
    await expect(selectionBar).toBeVisible();
    await expect(selectionBar).toContainText('23.11.2026');
    await expect(selectionBar).toContainText(/(Enddatum auswählen|Select end date)/i);

    // Hover Day 26 to test preview
    const day26 = page.locator('.va-day-cell:has-text("26")').first();
    await day26.hover();
    await expect(day26).toHaveClass(/is-in-range/);

    // Click Day 26 to finalize range
    await day26.click();

    // Add Absence modal opens pre-filled with 23.11.2026 - 26.11.2026
    await expect(page.getByRole('heading', { name: /(Abwesenheit eintragen|Add Absence)/i })).toBeVisible();
    await expect(startInput).toHaveValue('23.11.2026');
    await expect(endInput).toHaveValue('26.11.2026');

    // Cancel modal
    await page.getByRole('button', { name: /(Abbrechen|Cancel)/i }).click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit eintragen|Add Absence)/i })).toBeHidden();

    // Mobile viewport verification: badge text should be hidden in calendar, and cards shown in List view
    await page.setViewportSize({ width: 375, height: 667 });
    const mobileBadgeText = page.locator('.va-badge-type').first();
    await expect(mobileBadgeText).toBeHidden();

    // In List view on mobile, cards should be displayed and desktop table hidden
    await page.getByRole('button', { name: /(Liste|List)/i }).click();
    await expect(page.locator('.va-mobile-cards')).toBeVisible();
    await expect(page.locator('.va-desktop-table')).toBeHidden();
    const firstCard = page.locator('.va-card').first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard).toContainText('10.11.2026 – 15.11.2026');
    await expect(firstCard).toContainText('Bufdi Seminar A');

    // Switch back to Calendar view and restore desktop viewport
    await page.getByRole('button', { name: /(Kalender|Calendar)/i }).click();
    await page.setViewportSize({ width: 1280, height: 800 });

    // Try creating an overlapping absence
    await addBtn.click();

    // Verify Date Picker dropdown opens and marks existing absence in November 2026
    await page.locator('.va-picker-btn').first().click();
    await expect(page.locator('.easy-edit-calendar-dropdown')).toBeVisible();
    const markedDay = page.locator('.easy-edit-calendar-dropdown [title*="Bufdi Seminar A"]').first();
    await expect(markedDay).toBeVisible();
    // Close picker by clicking the button
    await page.locator('.va-picker-btn').first().click();

    await startInput.fill('12.11.2026');
    await endInput.fill('18.11.2026');
    await noteInput.fill('Overlap Test');
    await page.locator('.va-modal').getByRole('button', { name: /(Speichern|Save)/i }).click();

    // Should display overlap error
    await expect(page.getByText(/(überschneidet sich mit einer bestehenden Abwesenheit|overlaps with an existing absence)/i)).toBeVisible();

    // Cancel modal
    await page.getByRole('button', { name: /(Abbrechen|Cancel)/i }).click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit eintragen|Add Absence)/i })).toBeHidden();

    // Switch to List view to edit and delete
    await page.getByRole('button', { name: /(Liste|List)/i }).click();

    // Edit the existing absence
    await page.locator('.va-icon-btn[title="Bearbeiten"]').first().click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit bearbeiten|Edit Absence)/i })).toBeVisible();

    // Verify Delete button is present in the Edit dialog
    const deleteInEditBtn = page.locator('.va-modal .va-btn-delete');
    await expect(deleteInEditBtn).toBeVisible();

    await noteInput.fill('Bufdi Seminar A (Aktualisiert)');
    await page.locator('.va-modal').getByRole('button', { name: /(Speichern|Save)/i }).click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit bearbeiten|Edit Absence)/i })).toBeHidden();
    await expect(page.locator('.va-desktop-table').getByText('Bufdi Seminar A (Aktualisiert)')).toBeVisible();

    // Reopen Edit dialog and delete directly from it!
    await page.locator('.va-icon-btn[title="Bearbeiten"]').first().click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit bearbeiten|Edit Absence)/i })).toBeVisible();
    await deleteInEditBtn.click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit löschen|Delete Absence)/i })).toBeVisible();
    await page.locator('.va-modal .va-btn-primary').click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit löschen|Delete Absence)/i })).toBeHidden();

    // Verify it is removed
    await expect(page.locator('.va-desktop-table').getByText('Bufdi Seminar A (Aktualisiert)')).toBeHidden();
    await expect(page.locator('.va-mobile-cards').getByText('Bufdi Seminar A (Aktualisiert)')).toBeHidden();

    // Verify Audit log contains INSERT, UPDATE, DELETE for volunteer_absence
    const auditRes = await request.get('/api/audit-logs?limit=50', {
      headers: { Authorization: 'Bearer developer@example.com' },
    });
    expect(auditRes.ok()).toBeTruthy();
    const auditData = await auditRes.json();
    const logs = Array.isArray(auditData) ? auditData : auditData.logs;
    const volunteerLogs = logs.filter((l: any) => l.entity_type === 'volunteer_absence');
    expect(volunteerLogs.length).toBeGreaterThanOrEqual(3);
    const ops = volunteerLogs.map((l: any) => l.operation);
    expect(ops).toContain('INSERT');
    expect(ops).toContain('UPDATE');
    expect(ops).toContain('DELETE');
  });

  test('verifies dashboard/Kochansicht header displays volunteer absence notice with custom name', async ({ request, page }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // 2. Open dashboard initially (no absence active today)
    await page.goto('/#dashboard');
    const todosHeader = page.locator('.kiosk-card-todos .kiosk-card-header span');
    await expect(todosHeader).toBeVisible();
    await expect(todosHeader).toHaveText('Hinweise & Aufgaben');

    // 3. Configure BuFDI name in volunteer absences management
    await page.goto('/#volunteerAbsences');
    await expect(page.getByTestId('volunteer-absences-tab')).toBeVisible();

    const bufdiNameInput = page.getByTestId('va-bufdi-name-input');
    await expect(bufdiNameInput).toBeVisible();
    await bufdiNameInput.fill('Max Mustermann');
    await page.getByTestId('va-bufdi-name-save-btn').click();
    await expect(page.getByTestId('va-bufdi-name-saved-badge')).toBeVisible();

    // 4. Create a volunteer absence covering today
    const addBtn = page.getByRole('button', { name: /(Abwesenheit eintragen|Add Absence)/i });
    await addBtn.click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit eintragen|Add Absence)/i })).toBeVisible();

    // Verify BuFDI name field in modal defaults to global name
    const modalBufdiName = page.getByTestId('va-modal-bufdi-name-input');
    await expect(modalBufdiName).toBeVisible();
    await expect(modalBufdiName).toHaveValue('Max Mustermann');

    const parts = todayStr.split('-');
    const todayDE = `${parts[2]}.${parts[1]}.${parts[0]}`;
    const startInput = page.locator('.va-modal input[placeholder="TT.MM.JJJJ"]').first();
    const endInput = page.locator('.va-modal input[placeholder="TT.MM.JJJJ"]').nth(1);
    const noteInput = page.locator('#va-note-input');

    await startInput.fill(todayDE);
    await endInput.fill(todayDE);
    await noteInput.fill('Krank');
    await page.locator('.va-modal').getByRole('button', { name: /(Speichern|Save)/i }).click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit eintragen|Add Absence)/i })).toBeHidden();

    // 5. Navigate to dashboard - header must show absence notice with configured name
    await page.goto('/#dashboard');
    await expect(todosHeader).toBeVisible();
    await expect(todosHeader).toHaveText('Hinweise & Aufgaben - ! Max Mustermann nicht im Haus !');

    // 6. Update the absence's BuFDI name to "Lisa & Tom"
    await page.goto('/#volunteerAbsences');
    await expect(page.getByTestId('volunteer-absences-tab')).toBeVisible();
    await page.getByRole('button', { name: /(Liste|List)/i }).click();
    await page.locator('.va-icon-btn[title="Bearbeiten"]').first().click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit bearbeiten|Edit Absence)/i })).toBeVisible();
    await expect(page.getByTestId('va-modal-bufdi-name-input')).toHaveValue('Max Mustermann');
    await page.getByTestId('va-modal-bufdi-name-input').fill('Lisa & Tom');
    await page.locator('.va-modal').getByRole('button', { name: /(Speichern|Save)/i }).click();
    await expect(page.getByRole('heading', { name: /(Abwesenheit bearbeiten|Edit Absence)/i })).toBeHidden();

    // 7. Verify dashboard immediately shows updated name from absence property
    await page.goto('/#dashboard');
    await expect(todosHeader).toBeVisible();
    await expect(todosHeader).toHaveText('Hinweise & Aufgaben - ! Lisa & Tom nicht im Haus !');

    // 8. Delete the absence and verify header reverts to regular "Hinweise & Aufgaben"
    await page.goto('/#volunteerAbsences');
    await page.getByRole('button', { name: /(Liste|List)/i }).click();
    await page.locator('.va-icon-btn[title="Bearbeiten"]').first().click();
    await page.locator('.va-modal .va-btn-delete').click();
    await page.locator('.va-modal .va-btn-primary').click();

    await page.goto('/#dashboard');
    await expect(todosHeader).toBeVisible();
    await expect(todosHeader).toHaveText('Hinweise & Aufgaben');
  });
});
