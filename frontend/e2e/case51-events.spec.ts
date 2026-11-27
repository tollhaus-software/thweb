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
    await page.getByRole('button', { name: 'Termine', exact: true }).click();
    await expect(page.getByTestId('events-tab')).toBeVisible();
    await expect(page.getByTestId('events-month-label')).toContainText('Oktober 2026');

    // Verify 7-column weekday header including Samstag & Sonntag
    const headers = page.getByTestId('events-weekday-headers');
    await expect(headers).toContainText('Montag');
    await expect(headers).toContainText('Samstag');
    await expect(headers).toContainText('Sonntag');

    // 1. Navigate to Termine > TSV Import tab, verify copyable LLM prompt spec, paste TSV with 1 invalid row, fix inline, and import
    await page.getByTestId('sidebar-subtab-eventsImport').click();
    await expect(page.getByTestId('events-import-tab')).toBeVisible();

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
    await expect(page.getByTestId('events-import-success')).toBeVisible();

    // Switch back to Termine calendar subtab
    await page.getByTestId('sidebar-subtab-events').click();
    await expect(page.getByTestId('events-tab')).toBeVisible();

    // Verify weekend event (2026-10-10 Saturday = Bau-WE) and timed event (2026-10-20 = 20:00 EA Große Gr.) appear in calendar
    await expect(page.getByTestId('events-day-box-2026-10-10')).toContainText('Bau-WE');
    await expect(page.getByTestId('events-day-box-2026-10-20')).toContainText('20:00');
    await expect(page.getByTestId('events-day-box-2026-10-20')).toContainText('EA Große Gr.');

    // Click Bau-WE event pill on 2026-10-10 -> opens combined event editor popover
    await page.getByTestId('events-day-box-2026-10-10').locator('.events-pill').first().click();
    await expect(page.getByTestId('event-form-modal')).toBeVisible();
    await expect(page.getByTestId('event-form-description')).toHaveValue('Bitte Handschuhe mitbringen');
    await page.getByTestId('event-form-close-btn').click();

    // Re-open TSV Import tab and paste the first row again -> detected as Duplicate
    await page.getByTestId('sidebar-subtab-eventsImport').click();
    await page
      .getByTestId('events-import-paste-textarea')
      .fill('start_date\tend_date\tevent_type\tstart_time\tend_time\ttitle\tdescription\n2026-10-10\t2026-10-10\tbau_we\t\t\t\t');
    await expect(page.getByTestId('events-import-row-status-0')).toContainText('Duplikat');
    await expect(page.getByTestId('events-import-submit-btn')).toBeDisabled();
    await page.getByTestId('sidebar-subtab-events').click();

    // 2. Click on 2026-10-27 day box outside of existing event pills (e.g. on day header) -> opens create popover for 2026-10-27
    const dayBox27 = page.getByTestId('events-day-box-2026-10-27');
    await dayBox27.locator('.events-day-header').click();
    await expect(page.getByTestId('event-form-modal')).toBeVisible();
    // Default type is 'ea_gesamt' (expects specific time) -> may not be multi-day, so end-date field is hidden
    await expect(page.getByTestId('event-form-end-date')).toHaveCount(0);
    // Date input uses dd.mm.yyyy format
    await expect(page.getByTestId('event-form-start-date')).toHaveValue('27.10.2026');
    await page.getByTestId('event-form-type').selectOption('paedagogischer_tag');
    await expect(page.getByTestId('event-form-end-date')).toBeVisible();
    await expect(page.getByTestId('event-form-end-date')).toHaveValue('27.10.2026');
    await page.getByTestId('event-form-description').fill('Team-Konzeptionstag');
    await page.getByTestId('event-form-save-btn').click();

    // Add 3rd and 4th events on 2026-10-27 so the day box overflows and displays "<n> weitere"
    await dayBox27.locator('.events-day-header').click();
    await page.getByTestId('event-form-type').selectOption('ea_gesamt');
    await page.getByTestId('event-form-mode-timed').click();
    await page.getByTestId('event-form-start-time').fill('19:30');
    await page.getByTestId('event-form-save-btn').click();

    await dayBox27.locator('.events-day-header').click();
    await page.getByTestId('event-form-type').selectOption('laternenfest');
    await page.getByTestId('event-form-mode-timed').click();
    await page.getByTestId('event-form-start-time').fill('17:00');
    await page.getByTestId('event-form-save-btn').click();

    // Verify "<n> weitere" pill appears, clicking it opens the day list popover, and clicking an item inside opens the event popover
    const morePill = page.getByTestId('events-more-pill-2026-10-27');
    await expect(morePill).toContainText('weitere');
    await morePill.click();
    const morePopover = page.getByTestId('events-more-popover-2026-10-27');
    await expect(morePopover).toBeVisible();
    await expect(morePopover).toContainText('Pädagogischer Tag');
    await expect(morePopover).toContainText('Laternenfest');

    await morePopover.locator('.events-more-popover-item').last().click();
    await expect(page.getByTestId('event-form-modal')).toBeVisible();
    await page.getByTestId('event-form-close-btn').click();

    // Verify mobile week selector displays concise "KW <week>, <year>" format
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByTestId('events-week-label')).toHaveText('KW 41, 2026');
  });

  test('filters group Elternabende by child group on Start page, shows max 3 events with Zum Kalender button, and jumps to highlighted event in Termine tab', async ({
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

    // Import 7 events within 30 days of 2026-11-01 (including ferien + ea_hort which should be filtered out, leaving 5 relevant events; max 3 shown on Start page!)
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
          { event_type: 'paedagogischer_tag', start_date: '2026-11-16', end_date: '2026-11-16' }, // #4 (not shown on Start page)
          { event_type: 'custom', start_date: '2026-11-25', end_date: '2026-11-25', title: 'Adventsbasteln' }, // #5 (not shown on Start page)
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

    // Shows max 3 relevant events (excludes ferien and ea_hort)
    const items = page.getByTestId('main-page-upcoming-events-list').locator('li');
    await expect(items).toHaveCount(3);
    await expect(card).toContainText('Dienstag, 03.11.2026, 20:00 Uhr');
    await expect(card).toContainText('Elternabend Kleine Gruppe');
    await expect(card).not.toContainText('Elternabend Hort');
    await expect(card).not.toContainText('Ferien');
    await expect(card).not.toContainText('Pädagogischer Tag');
    await expect(card).not.toContainText('Adventsbasteln');

    // Shows "Zum Kalender" button after the 3 events
    const toCalBtn = page.getByTestId('main-page-upcoming-events-calendar-btn');
    await expect(toCalBtn).toContainText('Zum Kalender');

    // Clicking an event in the "Anstehende Termine" box switches to the Termine tab and highlights that event
    await page.getByTestId('main-page-event-item-ea_kleine_gruppe').click();
    await expect(page.getByTestId('events-tab')).toBeVisible();
    const highlightedPill = page.locator('.events-pill.is-highlighted');
    await expect(highlightedPill).toBeVisible();
    await expect(highlightedPill).toContainText('EA Kleine Gr.');
  });

  test('shows next 3 non-ferien events even if beyond 30 days, and shows cooking_duty within 30 days as 4th event when preceded by 3+ events', async ({
    request,
    page,
  }) => {
    const parentEmail = 'vierter.koch@tollhaus-stuttgart.de';

    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Lukas',
            last_name: 'Keller',
            emails: [{ value: parentEmail, identifier_email: true, address_list: true }],
            phones: [],
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const fam = await famRes.json();
    const parentId = fam.parents[0].id;

    // 1. Seed 3 non-ferien events where the 2nd and 3rd are >30 days after 2026-11-01, plus a ferien event
    // and a Christmas schliesszeit covering 2026-12-24..2027-01-06 so the winter state holidays are suppressed
    const impFarRes = await request.post('/api/events/import', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        mode: 'replace_range',
        replace_start_date: '2026-10-01',
        replace_end_date: '2027-03-01',
        events: [
          { event_type: 'ferien', start_date: '2026-11-02', end_date: '2026-11-06' }, // excluded
          { event_type: 'putz_we', start_date: '2026-11-14', end_date: '2026-11-14' }, // within 30 days
          { event_type: 'weihnachtsfeier', start_date: '2026-12-18', end_date: '2026-12-18', start_time: '16:00' }, // >30 days
          { event_type: 'custom', start_date: '2026-12-22', end_date: '2026-12-22', title: 'Neujahrsempfang' }, // >30 days
          { event_type: 'schliesszeit', start_date: '2026-12-24', end_date: '2027-01-06' }, // suppresses 12-25, 01-01, 01-06 state holidays
        ],
      },
    });
    expect(impFarRes.ok()).toBeTruthy();

    await page.clock.setFixedTime(new Date('2026-11-01T09:00:00'));
    await page.addInitScript((email) => {
      localStorage.setItem('token', email);
    }, parentEmail);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const card = page.getByTestId('main-page-upcoming-events-card');
    await expect(card).toBeVisible();
    const items = page.getByTestId('main-page-upcoming-events-list').locator('li');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText('Putz-Wochenende');
    await expect(items.nth(1)).toContainText('Weihnachtsfeier');
    await expect(items.nth(2)).toContainText('Neujahrsempfang');
    await expect(card).not.toContainText('Ferien');

    // 2. Now seed 3 events before 2026-11-20 and a cooking_duty for Lukas on 2026-11-20 (within 30 days of 2026-11-01)
    const impBeforeCookRes = await request.post('/api/events/import', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        mode: 'replace_range',
        replace_start_date: '2026-10-01',
        replace_end_date: '2027-03-01',
        events: [
          { event_type: 'ferien', start_date: '2026-11-02', end_date: '2026-11-06' }, // excluded
          { event_type: 'bau_we', start_date: '2026-11-07', end_date: '2026-11-07' }, // #1
          { event_type: 'laternenfest', start_date: '2026-11-11', end_date: '2026-11-11', start_time: '17:00' }, // #2
          { event_type: 'paedagogischer_tag', start_date: '2026-11-16', end_date: '2026-11-16' }, // #3
          { event_type: 'ea_gesamt_and_mgv', start_date: '2026-11-18', end_date: '2026-11-18', start_time: '20:00' }, // #4 in calendar, skipped on Start page in favor of cooking_duty
          { event_type: 'weihnachtsfeier', start_date: '2026-12-18', end_date: '2026-12-18' }, // after cooking_duty
        ],
      },
    });
    expect(impBeforeCookRes.ok()).toBeTruthy();

    const seedCookRes = await request.post('/api/test/meal-plan', {
      data: [
        {
          date: '2026-11-20',
          cook_name: 'Lukas Keller',
          cooks: [{ id: parentId, type: 'parent', first_name: 'Lukas', last_name: 'Keller' }],
          cook_resolution_status: 'resolved',
          meal_components: ['Spätzle mit Soße'],
        },
      ],
    });
    expect(seedCookRes.ok()).toBeTruthy();

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should show the first 3 events + cooking_duty as the 4th event!
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toContainText('Bau-Wochenende');
    await expect(items.nth(1)).toContainText('Laternenfest');
    await expect(items.nth(2)).toContainText('Pädagogischer Tag');
    await expect(items.nth(3)).toContainText('Freitag, 20.11.2026');
    await expect(items.nth(3)).toContainText('Kochdienst');
    await expect(card).not.toContainText('MGV');

    // 3. If the cooking_duty is >30 days in the future (e.g. on 2026-10-15, 2026-11-20 is 36 days away) and preceded by 3 events, only 3 events are shown
    await page.clock.setFixedTime(new Date('2026-10-15T09:00:00'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(items).toHaveCount(3);
    await expect(card).not.toContainText('Kochdienst');
  });
});
