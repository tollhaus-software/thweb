import { test, expect } from '@playwright/test';

test.describe('Test Case 51: Events Calendar, Day Editor, TSV Import & Start Page Upcoming Events', () => {
  test.beforeEach(async ({ request }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();
  });

  test('supports 7-column calendar, timed & multi-day overlapping events, and TSV import with preview validation & duplicate check', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 860 });
    await page.clock.setFixedTime(new Date('2026-10-05T09:00:00'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate to Termine tab from sidebar
    await page.getByRole('button', { name: 'Termine' }).click();
    await expect(page.getByTestId('events-tab')).toBeVisible();
    await expect(page.getByTestId('events-month-label')).toContainText('Oktober 2026');

    // Verify 7-column weekday header including Samstag & Sonntag
    const headers = page.getByTestId('events-weekday-headers');
    await expect(headers).toContainText('Montag');
    await expect(headers).toContainText('Samstag');
    await expect(headers).toContainText('Sonntag');

    // 1. Open TSV Import modal, verify copyable LLM prompt spec, paste TSV with 1 invalid row, fix inline, and import
    await page.getByTestId('events-open-import-btn').click();
    await expect(page.getByTestId('events-import-modal')).toBeVisible();

    await page.getByTestId('events-import-toggle-spec-btn').click();
    await expect(page.getByTestId('events-import-spec-text')).toContainText('schliesszeit_halbtags');

    const sampleTsv = [
      '```tsv',
      'start_date\tend_date\tevent_type\tstart_time\tend_time\ttitle\tdescription',
      '2026-10-10\t2026-10-10\tbau_we\t\t\t\tBitte Handschuhe mitbringen',
      '2026-10-20\t2026-10-20\tea_grosse_gruppe\t20:00\t22:00\t\tGruppenraum oben',
      '2026-10-26\t2026-10-30\tferien\t\t\t\tHerbstferien',
      '2026-10-18\t2026-10-18\tcustom\t\t\t\tFehlerzeile ohne Titel',
      '```',
    ].join('\n');

    await page.getByTestId('events-import-paste-textarea').fill(sampleTsv);
    await expect(page.getByTestId('events-import-preview-table')).toBeVisible();
    await expect(page.getByTestId('events-import-stat-err')).toContainText('1 Fehler');
    await expect(page.getByTestId('events-import-row-status-3')).toContainText('Titel fehlt');

    // Fix the missing custom title inline in the preview table -> error clears and row auto-includes!
    await page.getByTestId('events-import-row-title-3').fill('Flohmarkt');
    await expect(page.getByTestId('events-import-stat-valid')).toContainText('4 Neu');
    await expect(page.getByTestId('events-import-submit-btn')).toContainText('(4)');

    await page.getByTestId('events-import-submit-btn').click();
    await expect(page.getByTestId('events-import-modal')).toHaveCount(0);

    // Verify weekend event (2026-10-10 Saturday = Bau-WE) and timed event (2026-10-20 = 20:00 EA Große Gr.) appear in calendar
    await expect(page.getByTestId('events-day-box-2026-10-10')).toContainText('Bau-WE');
    await expect(page.getByTestId('events-day-box-2026-10-20')).toContainText('20:00');
    await expect(page.getByTestId('events-day-box-2026-10-20')).toContainText('EA Große Gr.');

    // Click 2026-10-10 (Bau-WE without specific time) -> verify "Noch keine Uhrzeit eingetragen" in detail view
    await page.getByTestId('events-day-box-2026-10-10').click();
    await expect(page.getByTestId('events-day-view')).toBeVisible();
    await expect(page.getByTestId('events-day-cards')).toContainText('Noch keine Uhrzeit eingetragen');
    await expect(page.getByTestId('events-day-cards')).not.toContainText('Ganztägig');
    await page.getByTestId('events-day-back-btn').click();

    // Re-open TSV Import and paste the first row again -> detected as Duplicate
    await page.getByTestId('events-open-import-btn').click();
    await page
      .getByTestId('events-import-paste-textarea')
      .fill('start_date\tend_date\tevent_type\tstart_time\tend_time\ttitle\tdescription\n2026-10-10\t2026-10-10\tbau_we\t\t\t\t');
    await expect(page.getByTestId('events-import-row-status-0')).toContainText('Duplikat');
    await expect(page.getByTestId('events-import-submit-btn')).toBeDisabled();
    await page.getByTestId('events-import-cancel-btn').click();

    // 2. Click on 2026-10-27 (inside Herbstferien) -> open Day View and add an overlapping event on the same day
    await page.getByTestId('events-day-box-2026-10-27').click();
    await expect(page.getByTestId('events-day-view')).toBeVisible();
    await expect(page.getByTestId('events-day-cards')).toContainText('Ferien / unterrichtsfreie Tage');
    await expect(page.getByTestId('events-day-cards')).toContainText('26.10.2026 – 30.10.2026');

    await page.getByTestId('events-day-add-btn').click();
    await expect(page.getByTestId('event-form-modal')).toBeVisible();
    await page.getByTestId('event-form-type').selectOption('paedagogischer_tag');
    await page.getByTestId('event-form-description').fill('Team-Konzeptionstag');
    await page.getByTestId('event-form-save-btn').click();

    // Both overlapping events are displayed on 2026-10-27 (Pädagogischer Tag shows Ganztägig, not Noch keine Uhrzeit eingetragen)
    await expect(page.getByTestId('events-day-cards')).toContainText('Ferien / unterrichtsfreie Tage');
    await expect(page.getByTestId('events-day-cards')).toContainText('Pädagogischer Tag');
    await expect(page.getByTestId('events-day-cards')).toContainText('Ganztägig');
    await expect(page.getByTestId('events-day-cards')).not.toContainText('Noch keine Uhrzeit eingetragen');
    await expect(page.getByTestId('events-day-cards')).toContainText('Team-Konzeptionstag');

    // Return to month grid and verify both pills appear on 2026-10-27
    await page.getByTestId('events-day-back-btn').click();
    const dayBox27 = page.getByTestId('events-day-box-2026-10-27');
    await expect(dayBox27).toContainText('Ferien');
    await expect(dayBox27).toContainText('Päd. Tag');
  });

  test('filters group Elternabende by child group on Start page and expands when more than 4 events exist', async ({
    request,
    page,
  }) => {
    const parentEmail = 'kleine.eltern@tollhaus-stuttgart.de';

    // Create family with parent + child in Kleine Gruppe (group 1)
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Nora',
            last_name: 'Berg',
            emails: [{ value: parentEmail, identifier_email: true, address_list: true }],
            phones: [],
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const fam = await famRes.json();

    const childId = crypto.randomUUID();
    const childRes = await request.put(`/api/children/${childId}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: childId,
        family_id: fam.id,
        first_name: 'Mila',
        last_name: 'Berg',
        birth_date: '2023-05-10',
      },
    });
    expect(childRes.ok()).toBeTruthy();

    const gcRes = await request.post(`/api/children/${childId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        child_id: childId,
        change_date: '2025-09-01',
        target_group: 1,
      },
    });
    expect(gcRes.ok()).toBeTruthy();

    // Import 7 events within 30 days of 2026-11-01 (including ferien + ea_hort which should be filtered out, leaving 5 visible events!)
    const impRes = await request.post('/api/events/import', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        mode: 'skip_duplicates',
        events: [
          { event_type: 'ferien', start_date: '2026-10-26', end_date: '2026-11-02' }, // hidden on Start page
          { event_type: 'ea_hort', start_date: '2026-11-04', end_date: '2026-11-04', start_time: '19:30' }, // filtered out (group 3)
          { event_type: 'ea_kleine_gruppe', start_date: '2026-11-03', end_date: '2026-11-03', start_time: '20:00' }, // #1
          { event_type: 'putz_we', start_date: '2026-11-07', end_date: '2026-11-07' }, // #2
          { event_type: 'laternenfest', start_date: '2026-11-12', end_date: '2026-11-12', start_time: '17:00' }, // #3
          { event_type: 'paedagogischer_tag', start_date: '2026-11-16', end_date: '2026-11-16' }, // #4
          { event_type: 'custom', start_date: '2026-11-25', end_date: '2026-11-25', title: 'Adventsbasteln' }, // #5 (behind expand button)
        ],
      },
    });
    expect(impRes.ok()).toBeTruthy();

    await page.clock.setFixedTime(new Date('2026-11-01T09:00:00'));
    await page.addInitScript((email) => {
      localStorage.setItem('token', email);
    }, parentEmail);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const card = page.getByTestId('main-page-upcoming-events-card');
    await expect(card).toBeVisible();

    // Initially shows first 4 relevant events (excludes ferien and ea_hort)
    const items = page.getByTestId('main-page-upcoming-events-list').locator('li');
    await expect(items).toHaveCount(4);
    await expect(card).toContainText('Elternabend Kleine Gruppe: Dienstag, 03.11.2026, 20:00 Uhr (übermorgen)');
    await expect(card).not.toContainText('Elternabend Hort');
    await expect(card).not.toContainText('Ferien');
    await expect(card).not.toContainText('Adventsbasteln');

    // Expand to show all 5 relevant events
    const expandBtn = page.getByTestId('main-page-upcoming-events-expand-btn');
    await expect(expandBtn).toContainText('Alle 5 Termine anzeigen');
    await expandBtn.click();

    await expect(items).toHaveCount(5);
    await expect(card).toContainText('Adventsbasteln: Mittwoch, 25.11.2026');

    // Collapse back to 4
    await expandBtn.click();
    await expect(items).toHaveCount(4);
  });
});
