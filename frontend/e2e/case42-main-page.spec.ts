import { test, expect } from '@playwright/test';

test.describe('Test Case 42: Main Page (Default Homepage, Cook, Food, and Rest of Week)', () => {
  test.beforeEach(async ({ request }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();
  });

  test('experiment toggle: root URL / shows main page by default; /?exp_main=0 opts out', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 1. Default: main page and "Start" tab are visible
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('main-page')).toBeVisible();
    await expect(page.locator('.tabs').getByRole('button', { name: 'Start' })).toBeVisible();

    // 2. Explicitly opt out with ?exp_main=0
    await page.goto('/?exp_main=0#main');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('main-page')).toHaveCount(0);

    // 4. Visit with ?exp_main=1 -> main page is displayed
    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('main-page')).toBeVisible();
    await expect(page.locator('.tabs').getByRole('button', { name: 'Start' })).toBeVisible();

    // 5. Query param alias ?experiment=main_page also enables it
    await page.goto('/?experiment=main_page');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('main-page')).toBeVisible();
  });

  test('default landing on root URL / displays the main page with left-aligned header, welcome greeting, single food & cook box, and expanding week', async ({ request, page }) => {
    // 1. Seed meal allergens / components and cook for today
    const now = new Date();
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isFridayOrWeekend = isWeekend || dayOfWeek === 5;

    // Date for the main food box
    const targetDate = new Date(now);
    if (isWeekend) {
      const daysToMonday = dayOfWeek === 0 ? 1 : 2;
      targetDate.setDate(now.getDate() + daysToMonday);
    }
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    const targetDateStr = `${y}-${m}-${d}`;

    const putRes = await request.put(`/api/meal-allergens/${targetDateStr}`, {
      headers: {
        Authorization: 'Bearer developer@example.com',
        'Content-Type': 'application/json',
      },
      data: {
        cook_custom_name: 'Sabine Koch',
        meal_components: [
          { name: 'Kürbissuppe', allergens: ['sellerie'] },
          { name: 'Vollkornnudeln mit Tomatensauce', allergens: ['gluten'] },
        ],
      },
    });
    expect(putRes.ok()).toBeTruthy();

    // 2. Pre-populate localStorage with a different active tab to verify root URL / ALWAYS defaults to Main Page
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
      localStorage.setItem('thweb_active_tab', 'families');
    });

    // 3. Open application at root URL / without hash on desktop viewport with experiment enabled
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');

    // 4. Verify the Main Page is the default view displayed (did NOT redirect to #families)
    const mainPage = page.getByTestId('main-page');
    await expect(mainPage).toBeVisible();

    // Verify sidebar shows "Start" active
    const mainTab = page.locator('.tabs').getByRole('button', { name: 'Start' });
    await expect(mainTab).toBeVisible();
    await expect(mainTab).toHaveClass(/active/);

    // 5. Verify Header: "Heute ist <day>, <date>" and "Willkommen, <email>!"
    const pageTitle = page.getByTestId('main-page-title');
    await expect(pageTitle).toBeVisible();
    await expect(pageTitle).toContainText('Heute ist');

    const welcomeGreeting = page.getByTestId('main-page-welcome');
    await expect(welcomeGreeting).toBeVisible();
    await expect(welcomeGreeting).toHaveText('Willkommen, developer@example.com!');

    // 6. Verify SINGLE box layout: title is "Essen heute" (or "Essen am Montag" on Sat/Sun)
    const foodCard = page.getByTestId('main-page-food-card');
    await expect(foodCard).toBeVisible();

    const foodTitle = page.getByTestId('main-page-food-title');
    if (isWeekend) {
      await expect(foodTitle).toHaveText('Essen am Montag');
    } else {
      await expect(foodTitle).toHaveText('Essen heute');
    }

    // Food components list
    const mealList = page.getByTestId('main-page-meal-components');
    await expect(mealList).toContainText('Kürbissuppe');
    await expect(mealList).toContainText('Vollkornnudeln mit Tomatensauce');

    // Cook name in parentheses under food components
    const cookName = page.getByTestId('main-page-cook-name');
    await expect(cookName).toHaveText('(Sabine Koch)');

    // 7. Verify "Zur Kochansicht" is skipped/not shown on the main page
    await expect(page.getByTestId('main-page-kochansicht-btn')).toHaveCount(0);
    await expect(page.locator('.main-page-kochansicht-top-btn')).toHaveCount(0);

    // 8. Expand button logic:
    // If Fri, Sat, Sun: "Kommende Woche anzeigen"
    // If Mon-Thu: "Restliche Woche anzeigen"
    const expandBtn = page.getByTestId('main-page-expand-week-btn');
    await expect(expandBtn).toBeVisible();

    if (isFridayOrWeekend) {
      await expect(expandBtn).toContainText('Kommende Woche anzeigen');
      await expandBtn.click();
      await expect(page.getByTestId('main-page-week-expanded')).toBeVisible();
      await expect(page.locator('.main-page-week-title')).toHaveText('Kommende Woche');
      await expect(expandBtn).toContainText('Kommende Woche ausblenden');
    } else {
      await expect(expandBtn).toContainText('Restliche Woche anzeigen');
      await expandBtn.click();
      await expect(page.getByTestId('main-page-week-expanded')).toBeVisible();
      await expect(page.locator('.main-page-week-title')).toHaveText('Restliche Woche');
      await expect(expandBtn).toContainText('Restliche Woche ausblenden');
    }

    // 9. Verify no sub-headers ESSEN HEUTE or KOCH / KÖCHIN are present in the week cards
    const weekCards = page.locator('.main-page-week-day-card');
    if (await weekCards.count() > 0) {
      const firstWeekCard = weekCards.first();
      await expect(firstWeekCard.locator('.main-page-week-field-label')).toHaveCount(0);
      await expect(firstWeekCard.locator('.main-page-week-cook-name')).toBeVisible();
      // Cook name is wrapped in parentheses
      const cookText = await firstWeekCard.locator('.main-page-week-cook-name').innerText();
      expect(cookText).toMatch(/^\(.*\)$/);
    }

    // 10. Verify vertical scrolling on the page when expanded
    const scrollContainer = page.getByTestId('main-page-scroll-container');
    await expect(scrollContainer).toBeVisible();
    const isScrollable = await scrollContainer.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(isScrollable).toBe(true);

    // Scroll down and verify scrollTop updates
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 150;
    });
    const scrolledTop = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(scrolledTop).toBeGreaterThan(0);

    // 11. Admin has mealplan.view permission -> link to meal plan must be present after expanding
    const mealPlanLink = page.getByTestId('main-page-mealplan-link');
    await expect(mealPlanLink).toBeVisible();

    // Clicking the link navigates to #mealPlan
    await mealPlanLink.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('#mealPlan');
    await expect(page.getByTestId('meal-plan-tab')).toBeVisible();

    // 12. Clicking header logo navigates back to Main Page
    const headerLogo = page.locator('.header-brand');
    await headerLogo.click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('main-page')).toBeVisible();
  });

  test('parents default access: opens main page with first name greeting, no Kochansicht link, and mealplan link visible', async ({ request, page }) => {
    // 1. Create a parent with identifier email (parent_default role)
    const parentEmail = 'eltern.kontakt@tollhaus-stuttgart.de';
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Maria',
            last_name: 'Musterfrau',
            emails: [{ value: parentEmail, identifier_email: true, address_list: true }],
            phones: [{ value: '0171999999', address_list: true }],
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();

    // 2. Log in as parent
    await page.addInitScript((email) => {
      localStorage.setItem('token', email);
    }, parentEmail);

    // 3. Open application at / with experiment enabled
    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');

    // 4. Verify main page is displayed
    await expect(page.getByTestId('main-page')).toBeVisible();

    // 5. Verify greeting uses parent first name: "Willkommen, Maria!"
    const welcomeGreeting = page.getByTestId('main-page-welcome');
    await expect(welcomeGreeting).toBeVisible();
    await expect(welcomeGreeting).toHaveText('Willkommen, Maria!');

    // 6. Verify "Zur Kochansicht" is not shown on the main page itself, while "Kochansicht" IS available under "Kochen" in the sidebar navigation
    await expect(page.getByTestId('main-page-kochansicht-btn')).toHaveCount(0);
    await page.getByRole('button', { name: 'Toggle Kochen subtabs' }).click();
    await expect(page.locator('.tabs').getByRole('button', { name: 'Kochansicht' })).toBeVisible();

    // 7. Expand the rest/upcoming of the week
    const expandBtn = page.getByTestId('main-page-expand-week-btn');
    await expandBtn.click();
    await expect(page.getByTestId('main-page-week-expanded')).toBeVisible();

    // 8. Parent (parent_default) has mealplan.view permission -> link to meal plan is visible
    const mealPlanLink = page.getByTestId('main-page-mealplan-link');
    await expect(mealPlanLink).toBeVisible();
  });

  test('weekend handling: on Saturday/Sunday, shows "Essen am Montag" and upcoming week', async ({ request, page }) => {
    // 2026-11-14 is a Saturday. Next Monday is 2026-11-16.
    const saturday = new Date('2026-11-14T10:00:00');
    const mondayStr = '2026-11-16';

    const putRes = await request.put(`/api/meal-allergens/${mondayStr}`, {
      headers: {
        Authorization: 'Bearer developer@example.com',
        'Content-Type': 'application/json',
      },
      data: {
        cook_custom_name: 'Montags-Koch Peter',
        meal_components: [{ name: 'Spaghetti Bolognese' }],
      },
    });
    expect(putRes.ok()).toBeTruthy();

    await page.clock.setFixedTime(saturday);

    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');

    // On Saturday, title must be "Essen am Montag"
    const foodTitle = page.getByTestId('main-page-food-title');
    await expect(foodTitle).toHaveText('Essen am Montag');

    // Meal components and cook for Monday
    const mealList = page.getByTestId('main-page-meal-components');
    await expect(mealList).toContainText('Spaghetti Bolognese');

    const cookName = page.getByTestId('main-page-cook-name');
    await expect(cookName).toHaveText('(Montags-Koch Peter)');

    // Expand button must say "Kommende Woche anzeigen"
    const expandBtn = page.getByTestId('main-page-expand-week-btn');
    await expect(expandBtn).toHaveText(/Kommende Woche anzeigen/);

    await expandBtn.click();
    await expect(page.getByTestId('main-page-week-expanded')).toBeVisible();
    await expect(page.locator('.main-page-week-title')).toHaveText('Kommende Woche');
  });

  test('Friday handling: shows "Essen heute" and "Kommende Woche anzeigen"', async ({ request, page }) => {
    // 2026-11-13 is a Friday.
    const friday = new Date('2026-11-13T10:00:00');
    const fridayStr = '2026-11-13';

    const putRes = await request.put(`/api/meal-allergens/${fridayStr}`, {
      headers: {
        Authorization: 'Bearer developer@example.com',
        'Content-Type': 'application/json',
      },
      data: {
        cook_custom_name: 'Freitags-Köchin Lisa',
        meal_components: [{ name: 'Gemüseeintopf' }],
      },
    });
    expect(putRes.ok()).toBeTruthy();

    await page.clock.setFixedTime(friday);

    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');

    // On Friday, title must be "Essen heute"
    const foodTitle = page.getByTestId('main-page-food-title');
    await expect(foodTitle).toHaveText('Essen heute');

    const mealList = page.getByTestId('main-page-meal-components');
    await expect(mealList).toContainText('Gemüseeintopf');

    const cookName = page.getByTestId('main-page-cook-name');
    await expect(cookName).toHaveText('(Freitags-Köchin Lisa)');

    // Expand button on Friday must say "Kommende Woche anzeigen"
    const expandBtn = page.getByTestId('main-page-expand-week-btn');
    await expect(expandBtn).toHaveText(/Kommende Woche anzeigen/);

    await expandBtn.click();
    await expect(page.getByTestId('main-page-week-expanded')).toBeVisible();
    await expect(page.locator('.main-page-week-title')).toHaveText('Kommende Woche');
  });

  test('quick start box: admin user with full access sees all 4 links and can jump to each', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');

    // 1. Verify Quick Start Card and Title
    const quickStartCard = page.getByTestId('main-page-quickstart-card');
    await expect(quickStartCard).toBeVisible();

    const quickStartTitle = page.getByTestId('main-page-quickstart-title');
    await expect(quickStartTitle).toHaveText('Schnellstart');

    // 2. Verify all 4 links are present for admin
    const addressLink = page.getByTestId('main-page-quickstart-contacts');
    await expect(addressLink).toBeVisible();
    await expect(addressLink).toContainText('Adressliste');

    const feesLink = page.getByTestId('main-page-quickstart-childcareFees');
    await expect(feesLink).toBeVisible();
    await expect(feesLink).toContainText('Betreuungsgebühren');

    const allergensLink = page.getByTestId('main-page-quickstart-mealAllergens');
    await expect(allergensLink).toBeVisible();
    await expect(allergensLink).toContainText('Allergene fürs Kochen eintragen');

    const mgaLink = page.getByTestId('main-page-quickstart-mga');
    await expect(mgaLink).toBeVisible();
    await expect(mgaLink).toContainText('MGA Verwaltung');

    // 3. Test navigation: Adressliste -> #contacts
    await addressLink.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('#contacts');

    // 4. Test navigation: Betreuungsgebühren -> #childcareFees
    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('main-page-quickstart-childcareFees').click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('#childcareFees');

    // 5. Test navigation: Allergene fürs Kochen eintragen -> #mealAllergens
    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('main-page-quickstart-mealAllergens').click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('#mealAllergens');

    // 6. Test navigation: MGA Verwaltung -> #mga
    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('main-page-quickstart-mga').click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('#mga');
    await expect(page.locator('.category-landing-title')).toContainText('MGA');
  });

  test('quick start box permissions: parent user sees only address list, fees, and allergens (no MGA)', async ({ request, page }) => {
    // 1. Seed a parent with identifier email
    const parentEmail = 'parent.quickstart@tollhaus-stuttgart.de';
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Julia',
            last_name: 'Beispiel',
            emails: [{ value: parentEmail, identifier_email: true, address_list: true }],
            phones: [{ value: '01701234567', address_list: true }],
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();

    // 2. Log in as parent
    await page.addInitScript((email) => {
      localStorage.setItem('token', email);
    }, parentEmail);

    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');

    // 3. Quick start box is visible
    const quickStartCard = page.getByTestId('main-page-quickstart-card');
    await expect(quickStartCard).toBeVisible();

    // 4. Address list, fees, allergens are present
    await expect(page.getByTestId('main-page-quickstart-contacts')).toBeVisible();
    await expect(page.getByTestId('main-page-quickstart-childcareFees')).toBeVisible();
    await expect(page.getByTestId('main-page-quickstart-mealAllergens')).toBeVisible();

    // 5. MGA is NOT accessible to standard parent
    await expect(page.getByTestId('main-page-quickstart-mga')).toHaveCount(0);
  });

  test('quick start box permissions: simulated MGA role sees address list, fees, and MGA (no allergens)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // Start simulation with MGA role
    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');

    // Simulate MGA role via API
    const simRes = await page.request.post('/api/simulation', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        mode: 'custom',
        roles: ['mga'],
      },
    });
    expect(simRes.ok()).toBeTruthy();

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Quick start box is visible
    const quickStartCard = page.getByTestId('main-page-quickstart-card');
    await expect(quickStartCard).toBeVisible();

    // MGA role has overview, fees, and MGA
    await expect(page.getByTestId('main-page-quickstart-contacts')).toBeVisible();
    await expect(page.getByTestId('main-page-quickstart-childcareFees')).toBeVisible();
    await expect(page.getByTestId('main-page-quickstart-mga')).toBeVisible();

    // MGA role does NOT have meal allergens
    await expect(page.getByTestId('main-page-quickstart-mealAllergens')).toHaveCount(0);
  });

  test('quick start box permissions: user with only meal_allergens sees only allergen entry', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');

    // Simulate custom user with only meal_allergens permissions
    const simRes = await page.request.post('/api/simulation', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        mode: 'custom',
        roles: [],
        permissions: ['meal_allergens.read', 'meal_allergens.write'],
      },
    });
    expect(simRes.ok()).toBeTruthy();

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Quick start box is visible because 1 link is accessible
    const quickStartCard = page.getByTestId('main-page-quickstart-card');
    await expect(quickStartCard).toBeVisible();

    // Allergen entry is visible
    await expect(page.getByTestId('main-page-quickstart-mealAllergens')).toBeVisible();

    // The other 3 links are NOT present
    await expect(page.getByTestId('main-page-quickstart-contacts')).toHaveCount(0);
    await expect(page.getByTestId('main-page-quickstart-childcareFees')).toHaveCount(0);
    await expect(page.getByTestId('main-page-quickstart-mga')).toHaveCount(0);
  });

  test('quick start box permissions: user with no matching permissions does not see quick start box at all', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');

    // Simulate custom user with only audit.view permission (none of the 4 quick start items)
    const simRes = await page.request.post('/api/simulation', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        mode: 'custom',
        roles: [],
        permissions: ['audit.view'],
      },
    });
    expect(simRes.ok()).toBeTruthy();

    await page.reload();
    await page.waitForLoadState('networkidle');

    // The whole quick start box must NOT be present
    await expect(page.getByTestId('main-page-quickstart-card')).toHaveCount(0);
  });

  test('dark mode theme styling: cards have dark surfaces and titles/welcome text have high contrast', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    await page.goto('/?exp_main=1');
    await page.waitForLoadState('networkidle');

    const mainPage = page.getByTestId('main-page');
    await expect(mainPage).toBeVisible();

    const pageTitle = page.getByTestId('main-page-title');
    const welcomeGreeting = page.getByTestId('main-page-welcome');
    const foodCard = page.getByTestId('main-page-food-card');
    const quickStartCard = page.getByTestId('main-page-quickstart-card');

    // 1. Verify light mode colors
    const lightTitleColor = await pageTitle.evaluate((el) => window.getComputedStyle(el).color);
    const lightWelcomeColor = await welcomeGreeting.evaluate((el) => window.getComputedStyle(el).color);
    const lightCardBg = await foodCard.evaluate((el) => window.getComputedStyle(el).backgroundColor);

    expect(lightTitleColor).toBe('rgb(15, 23, 42)'); // #0f172a
    expect(lightWelcomeColor).toBe('rgb(71, 85, 105)'); // #475569
    expect(lightCardBg).toBe('rgb(255, 255, 255)'); // #ffffff

    // 2. Switch to dark mode
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

    // 3. Verify dark mode header contrast
    const darkTitleColor = await pageTitle.evaluate((el) => window.getComputedStyle(el).color);
    const darkWelcomeColor = await welcomeGreeting.evaluate((el) => window.getComputedStyle(el).color);

    expect(darkTitleColor).toBe('rgb(241, 243, 244)'); // #f1f3f4 (--text-h)
    expect(darkWelcomeColor).toBe('rgb(154, 160, 166)'); // #9aa0a6 (--text-secondary)

    // 4. Verify dark mode card surfaces are dark (not white)
    const darkFoodCardBg = await foodCard.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    const darkQuickStartCardBg = await quickStartCard.evaluate((el) => window.getComputedStyle(el).backgroundColor);

    expect(darkFoodCardBg).toBe('rgb(41, 42, 45)'); // #292a2d (--bg-surface)
    expect(darkQuickStartCardBg).toBe('rgb(41, 42, 45)'); // #292a2d (--bg-surface)

    // Quickstart buttons have dark background
    const firstQuickStartBtn = quickStartCard.locator('.main-page-quickstart-btn').first();
    const darkBtnBg = await firstQuickStartBtn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(darkBtnBg).toBe('rgb(41, 42, 45)'); // #292a2d (--bg-surface)

    // Quickstart button label has high contrast
    const darkBtnLabelColor = await firstQuickStartBtn.locator('.main-page-quickstart-btn-label').evaluate((el) => window.getComputedStyle(el).color);
    expect(darkBtnLabelColor).toBe('rgb(232, 234, 237)'); // #e8eaed (--text)

    // 5. Expand week section and verify expanded week container and day cards have dark surfaces
    const expandBtn = page.getByTestId('main-page-expand-week-btn');
    await expandBtn.click();

    const weekExpanded = page.getByTestId('main-page-week-expanded');
    await expect(weekExpanded).toBeVisible();

    const darkExpandedBg = await weekExpanded.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(darkExpandedBg).toBe('rgb(53, 54, 58)'); // #35363a (--bg-subtle)

    const firstWeekDayCard = weekExpanded.locator('.main-page-week-day-card').first();
    if (await firstWeekDayCard.count() > 0) {
      const darkDayCardBg = await firstWeekDayCard.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(darkDayCardBg).toBe('rgb(41, 42, 45)'); // #292a2d (--bg-surface)

      const darkDayNameColor = await firstWeekDayCard.locator('.main-page-week-day-name').evaluate((el) => window.getComputedStyle(el).color);
      expect(darkDayNameColor).toBe('rgb(241, 243, 244)'); // #f1f3f4 (--text-h)
    }
  });

  test('PWA manifest is served with application/manifest+json MIME type', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await res.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('iOS PWA install UI: adapts to Safari, Chrome on iOS, and in-app WebViews, and can be reopened from header menu after dismissal', async ({ browser }) => {
    // 1. iOS Safari context
    const safariContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    });
    const safariPage = await safariContext.newPage();
    await safariPage.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await safariPage.goto('/');
    await safariPage.waitForLoadState('networkidle');

    const pwaCard = safariPage.getByTestId('main-page-pwa-card');
    await expect(pwaCard).toBeVisible();
    await expect(safariPage.getByTestId('pwa-ios-safari-steps')).toBeVisible();
    await expect(safariPage.getByTestId('pwa-ios-safari-steps')).toContainText('•••');
    await expect(safariPage.getByTestId('pwa-ios-safari-steps')).toContainText('Hinzufügen');
    await expect(safariPage.getByTestId('pwa-ios-safari-hint')).toContainText('Safari-Symbol (Kompass)');

    // Dismiss the card -> disappears from main page
    await safariPage.getByTestId('main-page-pwa-dismiss-btn').click();
    await expect(pwaCard).toHaveCount(0);

    // Reopen install instructions from header overflow menu even after dismissal
    await safariPage.getByTestId('header-overflow-btn').click();
    const installMenuBtn = safariPage.getByTestId('overflow-install-pwa-button');
    await expect(installMenuBtn).toBeVisible();
    await expect(installMenuBtn).toContainText('Als App installieren');
    await installMenuBtn.click();

    const pwaModal = safariPage.getByTestId('pwa-install-modal');
    await expect(pwaModal).toBeVisible();
    await expect(pwaModal.getByTestId('pwa-ios-safari-steps')).toBeVisible();

    await safariPage.getByTestId('pwa-install-modal-close').click();
    await expect(pwaModal).toHaveCount(0);
    await safariContext.close();

    // 2. Chrome on iOS (CriOS) context
    const chromeIosContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
    });
    const chromeIosPage = await chromeIosContext.newPage();
    await chromeIosPage.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await chromeIosPage.goto('/');
    await chromeIosPage.waitForLoadState('networkidle');

    await expect(chromeIosPage.getByTestId('pwa-ios-chrome-steps')).toBeVisible();
    await expect(chromeIosPage.getByTestId('pwa-ios-chrome-steps')).toContainText('oben rechts');
    await chromeIosContext.close();

    // 3. iOS In-App Browser (WhatsApp / WKWebView) context
    const inAppContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [WhatsApp/2.24.22.78]',
    });
    const inAppPage = await inAppContext.newPage();
    await inAppPage.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await inAppPage.goto('/');
    await inAppPage.waitForLoadState('networkidle');

    await expect(inAppPage.getByTestId('pwa-ios-inapp-steps')).toBeVisible();
    await expect(inAppPage.getByTestId('pwa-ios-inapp-steps')).toContainText('In-App-Browser');
    const copyBtn = inAppPage.getByTestId('pwa-copy-link-btn');
    await expect(copyBtn).toBeVisible();
    await expect(copyBtn).toContainText('Link kopieren');
    await copyBtn.click();
    await expect(copyBtn).toContainText('Link kopiert!');
    await inAppContext.close();
  });
});
