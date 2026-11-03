import { test, expect } from '@playwright/test';
import {
  formatMentorDatePrefix,
  getEarliestGroupStartDate,
  getMentorsDisplay,
  getMentoredFamiliesForParent,
  getMentoredFamiliesForFamily,
  type FamilyLike,
} from '../src/utils/family';

test.describe('Mentor helpers unit tests', () => {
  test('formatMentorDatePrefix formats MM/YYYY and planned correctly', () => {
    expect(formatMentorDatePrefix(null)).toBe('geplant');
    expect(formatMentorDatePrefix('')).toBe('geplant');
    expect(formatMentorDatePrefix('2024-09-15')).toBe('09/2024');
    expect(formatMentorDatePrefix('2025-01-01T00:00:00Z')).toBe('01/2025');
  });

  test('getEarliestGroupStartDate selects the earliest valid target_group > 0 date', () => {
    const family: FamilyLike = {
      id: 'f1',
      children: [
        {
          group_changes: [
            { change_date: '2024-10-01', target_group: 0 },
            { change_date: '2024-05-01', target_group: 2 },
          ],
        },
        {
          group_changes: [
            { change_date: '2023-09-01', target_group: 1 },
          ],
        },
      ],
    };
    expect(getEarliestGroupStartDate(family)).toBe('2023-09-01');

    const noStartFamily: FamilyLike = {
      id: 'f2',
      children: [{ group_changes: [{ change_date: '2024-01-01', target_group: 0 }] }],
    };
    expect(getEarliestGroupStartDate(noStartFamily)).toBeNull();
  });

  test('getMentorsDisplay formats whole family and individual parents', () => {
    const mentorFamily: FamilyLike = {
      id: 'mentor-1',
      parents: [
        { id: 'p1', first_name: 'Anna', last_name: 'Schmidt' },
        { id: 'p2', first_name: 'Bernd', last_name: 'Becker' },
      ],
    };

    // Whole family
    const targetWhole: FamilyLike = {
      id: 'target-1',
      mentor_family_id: 'mentor-1',
      mentor_parent_ids: [],
    };
    const wholeRes = getMentorsDisplay(targetWhole, [mentorFamily, targetWhole]);
    expect(wholeRes.isFamily).toBe(true);
    expect(wholeRes.text).toBe('Familie Becker / Schmidt');

    // Individual parent
    const targetIndiv: FamilyLike = {
      id: 'target-2',
      mentor_family_id: 'mentor-1',
      mentor_parent_ids: ['p2'],
    };
    const indivRes = getMentorsDisplay(targetIndiv, [mentorFamily, targetIndiv]);
    expect(indivRes.isFamily).toBe(false);
    expect(indivRes.text).toBe('Bernd Becker');
  });

  test('getMentoredFamiliesForParent and getMentoredFamiliesForFamily', () => {
    const mentorFamily: FamilyLike = {
      id: 'mentor-1',
      parents: [
        { id: 'p1', first_name: 'Anna', last_name: 'Schmidt' },
        { id: 'p2', first_name: 'Bernd', last_name: 'Schmidt' },
      ],
    };

    const targetWhole: FamilyLike = {
      id: 't-whole',
      mentor_family_id: 'mentor-1',
      mentor_parent_ids: [],
      children: [{ group_changes: [{ change_date: '2024-03-01', target_group: 1 }] }],
      parents: [{ id: 'tp1', first_name: 'Clara', last_name: 'Target' }],
    };

    const targetIndiv: FamilyLike = {
      id: 't-indiv',
      mentor_family_id: 'mentor-1',
      mentor_parent_ids: ['p2'],
      children: [], // No group changes -> planned
      parents: [{ id: 'tp2', first_name: 'David', last_name: 'Zimmermann' }],
    };

    const all = [mentorFamily, targetWhole, targetIndiv];

    // Family level
    const famMentored = getMentoredFamiliesForFamily(mentorFamily, all);
    expect(famMentored).toHaveLength(2);
    expect(famMentored[0].displayName).toBe('03/2024 - Familie Target');
    expect(famMentored[1].displayName).toBe('geplant - Familie Zimmermann (Bernd)');

    // Parent Anna (p1): only targetWhole (since p2 was individually selected for t-indiv)
    const annaMentored = getMentoredFamiliesForParent({ id: 'p1', family_id: 'mentor-1' }, all);
    expect(annaMentored).toHaveLength(1);
    expect(annaMentored[0].displayName).toBe('03/2024 - Familie Target');

    // Parent Bernd (p2): both targetWhole and targetIndiv
    const berndMentored = getMentoredFamiliesForParent({ id: 'p2', family_id: 'mentor-1' }, all);
    expect(berndMentored).toHaveLength(2);
    expect(berndMentored[0].displayName).toBe('03/2024 - Familie Target');
    expect(berndMentored[1].displayName).toBe('geplant - Familie Zimmermann');
  });
});

test.describe('Test Case 32: Mentors and "Paten von"', () => {
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

  test('persists whole family or individual parents as mentors, shows in Paten and Paten von columns with links', async ({
    request,
    page,
  }) => {
    // Seed 3 families:
    // Family 1: Mentor Family (Parents: Anna Mentor & Bernd Mentor, Child with start 2023-09-01)
    const f1Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          { first_name: 'Anna', last_name: 'Mentor' },
          { first_name: 'Bernd', last_name: 'Mentor' },
        ],
      },
    });
    expect(f1Res.ok()).toBeTruthy();
    const f1 = await f1Res.json();
    const _pAnnaId = f1.parents[0].id;
    const pBerndId = f1.parents[1].id;

    const c1Id = crypto.randomUUID();
    const c1Res = await request.post(`/api/families/${f1.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: c1Id, first_name: 'Mimi', last_name: 'Mentor', birth_date: '2020-01-01' },
    });
    expect(c1Res.ok()).toBeTruthy();

    await request.post(`/api/children/${c1Id}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { change_date: '2023-09-01T00:00:00Z', target_group: 1 },
    });

    // Family 2: Target Family 1 (Parent: Tina Target, Child with start 2024-04-01)
    const f2Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          { first_name: 'Tina', last_name: 'Target' },
        ],
      },
    });
    expect(f2Res.ok()).toBeTruthy();
    const f2 = await f2Res.json();

    const c2Id = crypto.randomUUID();
    const c2Res = await request.post(`/api/families/${f2.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: c2Id, first_name: 'Tim', last_name: 'Target', birth_date: '2021-02-02' },
    });
    expect(c2Res.ok()).toBeTruthy();

    await request.post(`/api/children/${c2Id}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { change_date: '2024-04-01T00:00:00Z', target_group: 2 },
    });

    // Family 3: Target Family 2 (Parent: Zoe Neuer, Child with no group changes yet)
    const f3Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          { first_name: 'Zoe', last_name: 'Neuer' },
        ],
      },
    });
    expect(f3Res.ok()).toBeTruthy();
    const f3 = await f3Res.json();

    const c3Id = crypto.randomUUID();
    const c3Res = await request.post(`/api/families/${f3.id}/children`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { id: c3Id, first_name: 'Leo', last_name: 'Neuer', birth_date: '2023-05-05' },
    });
    expect(c3Res.ok()).toBeTruthy();

    // 1. Assign whole Family 1 as mentor for Family 2 via API
    const putF2Mentor = await request.put(`/api/families/${f2.id}/mentor`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { mentor_family_id: f1.id, mentor_parent_ids: [] },
    });
    expect(putF2Mentor.ok()).toBeTruthy();

    // 2. Assign only Bernd Mentor as mentor for Family 3 via API
    const putF3Mentor = await request.put(`/api/families/${f3.id}/mentor`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { mentor_family_id: f1.id, mentor_parent_ids: [pBerndId] },
    });
    expect(putF3Mentor.ok()).toBeTruthy();

    // Reload page to display changes
    await page.reload();

    // Navigate to "Familien(MGA)" tab
    const familiesTabBtn = page.getByRole('button', { name: 'Familien(MGA)' });
    await expect(familiesTabBtn).toBeVisible();
    await familiesTabBtn.click();

    // Verify column headers in Familien(MGA): "Paten" and "Paten von" exist as family-level columns, "Allergien" does NOT exist
    await expect(page.getByRole('columnheader', { name: 'Paten', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Paten von', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Allergien', exact: true })).not.toBeVisible();

    // Check Family 2 (Target):
    // In family row Paten column, it should show "Familie Mentor" (whole family)
    const f2Header = page.locator(`tr#row-${f2.id}`);
    await expect(f2Header).toBeVisible();
    await expect(f2Header.locator('td[data-column-id="paten"]')).toContainText('Familie Mentor');

    // Check Family 3 (Neuer):
    // In family row Paten column, it should show "Bernd Mentor" (only individual parent)
    const f3Header = page.locator(`tr#row-${f3.id}`);
    await expect(f3Header).toBeVisible();
    await expect(f3Header.locator('td[data-column-id="paten"]')).toContainText('Bernd Mentor');

    // Check Family 1 (Mentor):
    // In family row "Paten von" column, it should show:
    // "04/2024 - Familie Target" AND "geplant - Familie Neuer (Bernd)"
    const f1Header = page.locator(`tr#row-${f1.id}`);
    await expect(f1Header).toBeVisible();
    const f1PatenVon = f1Header.locator('td[data-column-id="paten_von"]');
    await expect(f1PatenVon).toContainText('04/2024 - Familie Target');
    await expect(f1PatenVon).toContainText('geplant - Familie Neuer (Bernd)');

    // Verify Family 1 has no mentor yet (shows "-"), but edit pencil is present
    await expect(f1Header.locator('td[data-column-id="paten"]')).toContainText('-');
    const mentorPatenPencil = f1Header.locator('button[title="Paten verwalten"]');
    await expect(mentorPatenPencil).toBeVisible();

    // Click on "Familie Target" in "Paten von" -> should navigate/highlight Family Target
    const targetLink = f1Header.getByRole('button', { name: /Familie Target/ });
    await expect(targetLink).toBeVisible();
    await targetLink.click();
    await expect(page.locator(`tr#row-${f2.id}`)).toHaveClass(/highlighted-row/);

    // Navigate to "Eltern(MGA)" tab
    const parentsTabBtn = page.getByRole('button', { name: 'Eltern(MGA)' });
    await expect(parentsTabBtn).toBeVisible();
    await parentsTabBtn.click();

    // Verify column headers "Paten" and "Paten von" exist in Eltern(MGA)
    await expect(page.getByRole('columnheader', { name: 'Paten', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Paten von', exact: true })).toBeVisible();

    // Tina Target has Family 1 (Familie Mentor) as Paten
    const tinaRow = page.locator('tr').filter({ has: page.locator('td[data-column-id="first_name"]', { hasText: 'Tina' }) });
    await expect(tinaRow).toBeVisible();
    await expect(tinaRow.locator('td[data-column-id="paten"]')).toContainText('Familie Mentor');

    // Zoe Neuer has Bernd Mentor as Paten
    const zoeRow = page.locator('tr').filter({ has: page.locator('td[data-column-id="first_name"]', { hasText: 'Zoe' }) });
    await expect(zoeRow).toBeVisible();
    await expect(zoeRow.locator('td[data-column-id="paten"]')).toContainText('Bernd Mentor');

    // Locate rows for Anna Mentor and Bernd Mentor
    const annaRow = page.locator('tr').filter({ has: page.locator('td[data-column-id="first_name"]', { hasText: 'Anna' }) });
    const berndRow = page.locator('tr').filter({ has: page.locator('td[data-column-id="first_name"]', { hasText: 'Bernd' }) });
    await expect(annaRow).toBeVisible();
    await expect(berndRow).toBeVisible();

    // Anna was only whole-family mentor for Target (not Neuer)
    const annaPatenVon = annaRow.locator('td[data-column-id="paten_von"]');
    await expect(annaPatenVon).toContainText('04/2024 - Familie Target');
    await expect(annaPatenVon).not.toContainText('Neuer');

    // Bernd was mentor for BOTH Target (whole family) and Neuer (individual)
    const berndPatenVon = berndRow.locator('td[data-column-id="paten_von"]');
    await expect(berndPatenVon).toContainText('04/2024 - Familie Target');
    await expect(berndPatenVon).toContainText('geplant - Familie Neuer');

    // Clicking "Familie Neuer" in Bernd's "Paten von" navigates to Familien(MGA) and highlights Neuer
    const neuerLink = berndPatenVon.getByRole('button', { name: /Familie Neuer/ });
    await expect(neuerLink).toBeVisible();
    await neuerLink.click();

    // We should now be in Familien tab and row for Family 3 highlighted
    await expect(page.locator(`tr#row-${f3.id}`)).toHaveClass(/highlighted-row/);

    // --- Verification of MentorPopover rules ---
    // Open edit popover for Family 2 (Target) via family header pencil button
    const targetPatenBtn = page.locator(`tr#row-${f2.id}`).locator('button[title="Paten verwalten"]');
    await targetPatenBtn.click();
    const mentorPopover = page.locator('.mentor-popover');
    await expect(mentorPopover).toBeVisible();

    // Rule 1: No "Paten entfernen" button
    await expect(mentorPopover.getByRole('button', { name: 'Paten entfernen' })).not.toBeVisible();

    // Rule 2: When selecting "Nur bestimmte Elternteile", none are checked by default, and saving is disabled until at least one is checked
    await mentorPopover.getByLabel('Nur bestimmte Elternteile').click();
    const annaCheckbox = mentorPopover.getByRole('checkbox', { name: 'Anna Mentor' });
    const berndCheckbox = mentorPopover.getByRole('checkbox', { name: 'Bernd Mentor' });
    await expect(annaCheckbox).not.toBeChecked();
    await expect(berndCheckbox).not.toBeChecked();

    const saveBtn = mentorPopover.getByRole('button', { name: 'Speichern' });
    await expect(saveBtn).toBeDisabled();

    // Check one parent -> save button enabled
    await annaCheckbox.check();
    await expect(saveBtn).toBeEnabled();

    // Uncheck -> save button disabled again
    await annaCheckbox.uncheck();
    await expect(saveBtn).toBeDisabled();

    // Switch back to "Ganze Familie" -> save button enabled
    await mentorPopover.getByLabel('Ganze Familie').click();
    await expect(saveBtn).toBeEnabled();

    // Select "-- Keine Patenfamilie --" -> save button enabled
    await mentorPopover.locator('select').selectOption({ label: '-- Keine Patenfamilie --' });
    await expect(saveBtn).toBeEnabled();

    await mentorPopover.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(mentorPopover).not.toBeVisible();

    // --- Verification of Cards View (under breakpoint <= 768px) ---
    await page.setViewportSize({ width: 500, height: 800 });
    // In card view, verify "Paten von" is shown on family card
    const f1Card = page.locator(`tr#row-${f1.id}`);
    await expect(f1Card).toBeVisible();
    const f1CardPatenVon = f1Card.locator('td[data-column-id="paten_von"]');
    await expect(f1CardPatenVon).toContainText('04/2024 - Familie Target');
    await expect(f1CardPatenVon).toContainText('geplant - Familie Neuer (Bernd)');
  });
});
