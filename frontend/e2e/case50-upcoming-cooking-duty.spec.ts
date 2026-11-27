import { test, expect } from '@playwright/test';

test.describe('Test Case 50: Start Page Upcoming Cooking Duty Box (Kochdienst)', () => {
  test.beforeEach(async ({ request }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();
  });

  test('does not show upcoming events box when user has no upcoming resolved kochplan entry', async ({ request, page }) => {
    const parentEmail = 'nocook.parent@tollhaus-stuttgart.de';
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Clara',
            last_name: 'Sommer',
            emails: [{ value: parentEmail, identifier_email: true, address_list: true }],
            phones: [],
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const family = await famRes.json();
    const parentId = family.parents[0].id;

    // Seed only a past resolved entry and an ambiguous upcoming entry
    const seedRes = await request.post('/api/test/meal-plan', {
      data: [
        {
          date: '2026-11-24',
          cook_name: 'Clara Sommer',
          cooks: [{ id: parentId, type: 'parent', first_name: 'Clara', last_name: 'Sommer' }],
          cook_resolution_status: 'resolved',
          meal_components: ['Kartoffelsuppe'],
        },
        {
          date: '2026-11-26',
          cook_name: 'Clara',
          cooks: [],
          cook_resolution_status: 'ambiguous',
          meal_components: ['Nudeln'],
        },
      ],
    });
    expect(seedRes.ok()).toBeTruthy();

    await page.clock.setFixedTime(new Date('2026-11-25T10:00:00'));
    await page.addInitScript((email) => {
      localStorage.setItem('token', email);
    }, parentEmail);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('main-page')).toBeVisible();
    await expect(page.getByTestId('main-page-event-item-cooking_duty')).toHaveCount(0);
  });

  test('formats today, tomorrow (morgen), day after tomorrow (übermorgen), and future weekday date accurately', async ({ request, page }) => {
    const parentEmail = 'koch.parent@tollhaus-stuttgart.de';
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Markus',
            last_name: 'Weber',
            emails: [{ value: parentEmail, identifier_email: true, address_list: true }],
            phones: [],
          },
          {
            first_name: 'Hannah',
            last_name: 'Weber',
            emails: [],
            phones: [],
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const family = await famRes.json();
    const markusId = family.parents[0].id;
    const hannahId = family.parents[1].id;

    // Seed two upcoming entries for Markus (& Hannah): 2026-11-27 (Friday) and 2026-12-07 (Monday)
    const seedRes = await request.post('/api/test/meal-plan', {
      data: [
        {
          date: '2026-11-27',
          cook_name: 'Markus & Hannah Weber',
          cooks: [
            { id: markusId, type: 'parent', first_name: 'Markus', last_name: 'Weber' },
            { id: hannahId, type: 'parent', first_name: 'Hannah', last_name: 'Weber' },
          ],
          cook_resolution_status: 'resolved',
          meal_components: ['Gemüselasagne', 'Salat'],
        },
        {
          date: '2026-12-07',
          cook_name: 'Markus Weber',
          cooks: [{ id: markusId, type: 'parent', first_name: 'Markus', last_name: 'Weber' }],
          cook_resolution_status: 'resolved',
          meal_components: ['Linseneintopf'],
        },
      ],
    });
    expect(seedRes.ok()).toBeTruthy();

    await page.addInitScript((email) => {
      localStorage.setItem('token', email);
    }, parentEmail);

    // Case 1: 3+ days before (Tuesday 2026-11-24 -> Friday 27.11.2026 is in 3 days, no suffix)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.clock.setFixedTime(new Date('2026-11-24T09:00:00'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const card = page.getByTestId('main-page-upcoming-events-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('main-page-event-item-cooking_duty')).toContainText('Freitag, 27.11.2026');
    await expect(page.getByTestId('main-page-event-item-cooking_duty')).toContainText('Kochdienst');

    // Verify independent two-column desktop stack: expanding Essen heute does NOT push Schnellstart down
    await page.getByTestId('main-page-expand-week-btn').click();
    await expect(page.getByTestId('main-page-week-expanded')).toBeVisible();
    const eventsBox = await card.boundingBox();
    const quickStartBox = await page.getByTestId('main-page-quickstart-card').boundingBox();
    expect(eventsBox).not.toBeNull();
    expect(quickStartBox).not.toBeNull();
    const verticalGap = quickStartBox!.y - (eventsBox!.y + eventsBox!.height);
    expect(verticalGap).toBeGreaterThanOrEqual(20);
    expect(verticalGap).toBeLessThan(48);

    // Case 2: Day after tomorrow (Wednesday 2026-11-25 -> Friday 27.11.2026)
    await page.clock.setFixedTime(new Date('2026-11-25T09:00:00'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('main-page-event-item-cooking_duty')).toContainText('Freitag, 27.11.2026');
    await expect(page.getByTestId('main-page-event-item-cooking_duty')).toContainText('Kochdienst');

    // Case 3: Tomorrow (Thursday 2026-11-26 -> Friday 27.11.2026 is Morgen (Freitag, 27.11.2026))
    await page.clock.setFixedTime(new Date('2026-11-26T09:00:00'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('main-page-event-item-cooking_duty')).toContainText(
      'Morgen (Freitag, 27.11.2026)'
    );
    await expect(page.getByTestId('main-page-event-item-cooking_duty')).toContainText('Kochdienst');

    // Case 4: Today (Friday 2026-11-27 -> "Heute" header + "Kochdienst")
    await page.clock.setFixedTime(new Date('2026-11-27T09:00:00'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    const todayItem = page.getByTestId('main-page-event-item-cooking_duty');
    await expect(todayItem).toContainText('Heute');
    await expect(todayItem).toContainText('Kochdienst');
    await expect(todayItem).toHaveClass(/is-today/);

    // Case 5: Day after first cooking duty (Saturday 2026-11-28 -> advances to next entry on Monday 07.12.2026)
    await page.clock.setFixedTime(new Date('2026-11-28T09:00:00'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('main-page-event-item-cooking_duty')).toContainText('Montag, 07.12.2026');
    await expect(page.getByTestId('main-page-event-item-cooking_duty')).toContainText('Kochdienst');
  });

  test('shows upcoming cooking duty for signed-in employee and supports dark mode styling', async ({ request, page }) => {
    const empEmail = 'alex.koch@tollhaus-stuttgart.de';
    const empRes = await request.post('/api/employees', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        first_name: 'Alex',
        last_name: 'Bäcker',
        employee_type: 'caregiver',
        emails: [{ value: empEmail, identifier_email: true, address_list: true }],
        phones: [],
      },
    });
    expect(empRes.ok()).toBeTruthy();
    const emp = await empRes.json();

    const seedRes = await request.post('/api/test/meal-plan', {
      data: {
        date: '2026-11-26',
        cook_name: 'Alex',
        cooks: [{ id: emp.id, type: 'employee', first_name: 'Alex', last_name: 'Bäcker' }],
        cook_resolution_status: 'resolved',
        meal_components: ['Kürbisrisotto'],
      },
    });
    expect(seedRes.ok()).toBeTruthy();

    await page.clock.setFixedTime(new Date('2026-11-25T10:00:00'));
    await page.addInitScript((email) => {
      localStorage.setItem('token', email);
    }, empEmail);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const card = page.getByTestId('main-page-upcoming-events-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('main-page-event-item-cooking_duty')).toContainText(
      'Morgen (Donnerstag, 26.11.2026)'
    );
    await expect(page.getByTestId('main-page-event-item-cooking_duty')).toContainText('Kochdienst');

    // Switch to dark mode and verify surface and text contrast
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const darkCardBg = await card.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(darkCardBg).toBe('rgb(41, 42, 45)');

    const darkEventTextColor = await page
      .getByTestId('main-page-event-item-cooking_duty')
      .locator('.main-page-event-text')
      .evaluate((el) => window.getComputedStyle(el).color);
    expect(darkEventTextColor).toBe('rgb(232, 234, 237)');
  });
});
