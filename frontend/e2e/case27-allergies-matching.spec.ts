import { test, expect } from '@playwright/test';
import {
  allergensMatch,
  findMatchingGroupsForComponentAllergen,
  findMatchingComponentsForAllergy,
  type AllergiesMatchContext,
  type MealAllergenComponent,
} from '../src/utils/mealAllergens';

test.describe('Test Case 27: Allergen & Allergy Matching (MealAllergens Tab & Allergies Tab)', () => {
  test('unit tests: allergensMatch, group matching, and component matching (case-insensitive)', () => {
    // 1. Direct case-insensitivity
    expect(allergensMatch('tomaten', 'Tomaten')).toBe(true);
    expect(allergensMatch('TOMATEN', 'tomaten')).toBe(true);
    expect(allergensMatch('Erdbeeren', 'erdbeeren')).toBe(true);
    expect(allergensMatch('Sellerie', 'sellerie')).toBe(true);

    // 2. Main allergen key vs display label
    expect(allergensMatch('gluten', 'Glutenhaltiges Getreide')).toBe(true);
    expect(allergensMatch('Glutenhaltiges Getreide', 'gluten')).toBe(true);
    expect(allergensMatch('laktose', 'Milch/Laktose')).toBe(true);
    expect(allergensMatch('Milch/Laktose', 'laktose')).toBe(true);
    expect(allergensMatch('erdnuesse', 'Erdnüsse')).toBe(true);
    expect(allergensMatch('Erdnüsse', 'erdnuesse')).toBe(true);
    expect(allergensMatch('sulfite', 'Sulphite/Schwefeldioxid')).toBe(true);

    // 3. Category icon key aliases
    expect(allergensMatch('Milch', 'Laktose')).toBe(true);
    expect(allergensMatch('Weizen', 'Gluten')).toBe(true);
    expect(allergensMatch('Erdnuss', 'Erdnüsse')).toBe(true);

    // 4. Non-matching allergens
    expect(allergensMatch('Tomaten', 'Sellerie')).toBe(false);
    expect(allergensMatch('gluten', 'erdnuesse')).toBe(false);

    // 5. findMatchingGroupsForComponentAllergen
    const context: AllergiesMatchContext = {
      date: '2026-10-30',
      groups: [
        {
          group_id: 1,
          group_name: 'Kleine Gruppe',
          allergies: ['Milch/Laktose', 'Tomaten'],
        },
        {
          group_id: 2,
          group_name: 'Große Gruppe',
          allergies: ['Sellerie'],
        },
        {
          group_id: 3,
          group_name: 'Hort',
          allergies: [],
        },
      ],
      employees: ['Erdnüsse', 'Hausstaub'],
    };

    expect(findMatchingGroupsForComponentAllergen('laktose', context)).toEqual(['Kleine Gruppe']);
    expect(findMatchingGroupsForComponentAllergen('TOMATEN', context)).toEqual(['Kleine Gruppe']);
    expect(findMatchingGroupsForComponentAllergen('sellerie', context)).toEqual(['Große Gruppe']);
    expect(findMatchingGroupsForComponentAllergen('erdnuesse', context)).toEqual(['Mitarbeitende']);
    expect(findMatchingGroupsForComponentAllergen('fisch', context)).toEqual([]);

    // 6. findMatchingComponentsForAllergy
    const components: MealAllergenComponent[] = [
      { name: 'Pfannkuchen', allergens: ['gluten', 'laktose'] },
      { name: 'Kartoffelsuppe', allergens: ['sellerie'] },
      { name: 'Snack', allergens: ['erdnuesse', 'tomaten'] },
    ];

    expect(findMatchingComponentsForAllergy('Milch/Laktose', components)).toEqual(['Pfannkuchen']);
    expect(findMatchingComponentsForAllergy('sellerie', components)).toEqual(['Kartoffelsuppe']);
    expect(findMatchingComponentsForAllergy('Tomaten', components)).toEqual(['Snack']);
    expect(findMatchingComponentsForAllergy('Erdnüsse', components)).toEqual(['Snack']);
    expect(findMatchingComponentsForAllergy('Fisch', components)).toEqual([]);
  });

  test('E2E: warning popups in mealAllergens tab and meal component warnings in dashboard Allergies tab', async ({
    request,
    page,
  }) => {
    // 1. Reset database state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const authHeaders = { Authorization: 'Bearer developer@example.com' };
    const todayStr = new Date().toISOString().slice(0, 10);

    // 2. Create family and child in database with allergies in Group 1
    const famRes = await request.post('/api/families', {
      headers: authHeaders,
      data: {
        parents: [
          {
            first_name: 'Anna',
            last_name: 'Schmidt',
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const createdFam = await famRes.json();
    const familyId = createdFam.id;

    const childId = crypto.randomUUID();
    const childRes = await request.put(`/api/children/${childId}`, {
      headers: authHeaders,
      data: {
        id: childId,
        family_id: familyId,
        first_name: 'Felix',
        last_name: 'Schmidt',
        birth_date: '2021-06-10',
        allergies: [
          { name: 'Milch/Laktose', category: 'lebensmittel' },
          { name: 'Tomaten', category: 'lebensmittel' },
        ],
      },
    });
    expect(childRes.ok()).toBeTruthy();

    // Group change: Felix is in Gruppe 1 (Kleine Gruppe)
    const addGcRes = await request.post(`/api/children/${childId}/group_changes`, {
      headers: authHeaders,
      data: {
        child_id: childId,
        change_date: todayStr,
        target_group: 1,
      },
    });
    expect(addGcRes.ok()).toBeTruthy();

    // 3. Create employee with allergy "Erdnüsse"
    const empRes = await request.post('/api/employees', {
      headers: authHeaders,
      data: {
        first_name: 'Julia',
        last_name: 'Betreuerin',
        employee_type: 'caregiver',
        allergies: [
          { name: 'Erdnüsse', category: 'lebensmittel' },
        ],
      },
    });
    expect(empRes.ok()).toBeTruthy();

    // 4. Authenticate as developer
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });

    // 5. Navigate to mealAllergens tab
    await page.goto('/#mealAllergens');
    await page.waitForLoadState('networkidle');

    // Click today's box in the calendar view
    const todayBox = page.locator(`[data-testid="meal-allergens-day-box-${todayStr}"]`);
    await expect(todayBox).toBeVisible();
    await todayBox.click();

    // Verify Meal Allergens Editor is open and metadata is loaded
    const editor = page.getByTestId('meal-allergens-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('data-loaded', 'true');
    await expect(page.getByTestId('components-empty-dropzone')).toBeVisible();

    // Add component: "Suppe"
    const addCompBtn = page.getByTestId('add-meal-component-btn').first();
    await addCompBtn.click();

    const nameInput = page.getByTestId('meal-component-name-input-0');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Suppe');

    // In the allergen picker panel:
    // Check that laktose option displays the warning "Kleine Gruppe"
    const laktoseWarning = page.getByTestId('allergen-picker-warning-0-laktose');
    await expect(laktoseWarning).toBeVisible();
    await expect(laktoseWarning).toContainText('Kleine Gruppe');

    // Check that erdnuesse option displays the warning "Mitarbeitende"
    const erdnuesseWarning = page.getByTestId('allergen-picker-warning-0-erdnuesse');
    await expect(erdnuesseWarning).toBeVisible();
    await expect(erdnuesseWarning).toContainText('Mitarbeitende');

    // Click "laktose" to select it
    const laktoseOption = page.getByTestId('allergen-option-0-laktose');
    await laktoseOption.click();

    // Also add custom allergen "tomaten" (case-insensitive test: user enters lowercase)
    const customInput = page.getByTestId('custom-allergen-input-0');
    const customAddBtn = page.getByTestId('custom-allergen-add-btn-0');
    await customInput.fill('tomaten');
    await customAddBtn.click();

    // Close the popover
    const popoverDoneBtn = page.getByTestId('popover-done-btn');
    await popoverDoneBtn.click();
    await expect(page.locator('.meal-component-popover')).toHaveCount(0);

    // Verify in meal component card:
    // 1. Next to "Milch/Laktose", warning says "Kleine Gruppe"
    const laktoseMatchWarning = page.getByTestId('allergen-match-warning-0-laktose');
    await expect(laktoseMatchWarning).toBeVisible();
    await expect(laktoseMatchWarning).toContainText('Kleine Gruppe');

    // 2. Next to "tomaten", warning says "Kleine Gruppe"
    const tomatenMatchWarning = page.getByTestId('allergen-match-warning-0-tomaten');
    await expect(tomatenMatchWarning).toBeVisible();
    await expect(tomatenMatchWarning).toContainText('Kleine Gruppe');

    // Add another component "Dessert" with allergen "erdnuesse"
    const addCompBtn2 = page.getByTestId('add-meal-component-btn').first();
    await addCompBtn2.click();

    const nameInput1 = page.getByTestId('meal-component-name-input-1');
    await expect(nameInput1).toBeVisible();
    await nameInput1.fill('Dessert');

    const erdnuesseOption = page.getByTestId('allergen-option-1-erdnuesse');
    await erdnuesseOption.click();

    const popoverDoneBtn2 = page.getByTestId('popover-done-btn');
    await popoverDoneBtn2.click();
    await expect(page.locator('.meal-component-popover')).toHaveCount(0);

    // Verify next to "Erdnüsse", warning says "Mitarbeitende"
    const erdnuesseMatchWarning = page.getByTestId('allergen-match-warning-1-erdnuesse');
    await expect(erdnuesseMatchWarning).toBeVisible();
    await expect(erdnuesseMatchWarning).toContainText('Mitarbeitende');

    // 6. Now navigate to Dashboard -> Allergies tab
    const dashboardTab = page.locator('.tabs').getByRole('button', { name: 'Dashboard' });
    await dashboardTab.click();
    await expect(dashboardTab).toHaveClass(/active/);

    const embeddedPage = page.locator('.kiosk-tablet-page.embedded');
    await expect(embeddedPage).toBeVisible();

    // Toggle to Allergies view
    const toggleAllergiesBtn = embeddedPage.locator('.kiosk-nav-btn', { hasText: 'Allergien' });
    await expect(toggleAllergiesBtn).toBeVisible();
    await toggleAllergiesBtn.click();

    const allergiesView = embeddedPage.locator('.kiosk-allergies-view');
    await expect(allergiesView).toBeVisible();

    // 7. Verify Group 1 (Kleine Gruppe) shows the meal component warnings:
    // - Card header warning shows "Suppe"
    const group1HeaderWarning = page.getByTestId('group-card-warning-1');
    await expect(group1HeaderWarning).toBeVisible();
    await expect(group1HeaderWarning).toContainText('Suppe');

    // - Next to "Milch/Laktose" badge, warning shows "Suppe"
    const group1LaktoseWarning = page.getByTestId('group-allergy-warning-1-0');
    await expect(group1LaktoseWarning).toBeVisible();
    await expect(group1LaktoseWarning).toContainText('Suppe');

    // - Next to "Tomaten" badge, warning shows "Suppe"
    const group1TomatenWarning = page.getByTestId('group-allergy-warning-1-1');
    await expect(group1TomatenWarning).toBeVisible();
    await expect(group1TomatenWarning).toContainText('Suppe');

    // 8. Verify Mitarbeitende shows the meal component warning:
    // - Card header warning shows "Dessert"
    const empHeaderWarning = page.getByTestId('employee-card-warning');
    await expect(empHeaderWarning).toBeVisible();
    await expect(empHeaderWarning).toContainText('Dessert');

    // - Next to "Erdnüsse" badge, warning shows "Dessert"
    const empErdnuesseWarning = page.getByTestId('employee-allergy-warning-0');
    await expect(empErdnuesseWarning).toBeVisible();
    await expect(empErdnuesseWarning).toContainText('Dessert');

    // 9. Verify editing allergens on a date before child's enrollment start date (yesterday):
    // Child is not yet started on yesterday, so child group warning does not appear.
    // Employee warning does appear because employees are active.
    const mealAllergensTab = page.locator('.tabs').getByRole('button', { name: 'Essen/Allergene' });
    await mealAllergensTab.click();
    await expect(mealAllergensTab).toHaveClass(/active/);

    await expect(page.getByTestId('meal-allergens-grid')).toBeVisible();

    // Select yesterday's box
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yYear = yesterdayDate.getFullYear();
    const yMonth = String(yesterdayDate.getMonth() + 1).padStart(2, '0');
    const yDay = String(yesterdayDate.getDate()).padStart(2, '0');
    const yesterdayKey = `${yYear}-${yMonth}-${yDay}`;

    const yesterdayBox = page.getByTestId(`meal-allergens-day-box-${yesterdayKey}`);
    await expect(yesterdayBox).toBeVisible();
    await yesterdayBox.click();

    // Wait for the editor to load on yesterday's date
    await expect(page.getByTestId('meal-allergens-editor')).toBeVisible();
    await expect(page.getByTestId('meal-allergens-editor')).toHaveAttribute('data-loaded', 'true');

    // Add component "Käsebrot" with "laktose" and "erdnuesse"
    const addCompBtnYesterday = page.getByTestId('add-meal-component-btn').first();
    await addCompBtnYesterday.click();

    const compNameInput = page.getByTestId('meal-component-name-input-0');
    await expect(compNameInput).toBeVisible();
    await compNameInput.fill('Käsebrot');

    const laktoseYesterday = page.getByTestId('allergen-option-0-laktose');
    await laktoseYesterday.click();
    const erdnuesseYesterday = page.getByTestId('allergen-option-0-erdnuesse');
    await erdnuesseYesterday.click();

    const popoverDoneBtnYesterday = page.getByTestId('popover-done-btn');
    await popoverDoneBtnYesterday.click();
    await expect(page.locator('.meal-component-popover')).toHaveCount(0);

    // Verify on yesterday's date:
    // - Laktose warning for child (Kleine Gruppe) does NOT appear because Felix has not yet started
    const laktoseYesterdayWarning = page.getByTestId('allergen-match-warning-0-laktose');
    await expect(laktoseYesterdayWarning).toHaveCount(0);

    // - Erdnüsse warning for employee ("Mitarbeitende") DOES appear
    const erdnuesseYesterdayWarning = page.getByTestId('allergen-match-warning-0-erdnuesse');
    await expect(erdnuesseYesterdayWarning).toBeVisible();
    await expect(erdnuesseYesterdayWarning).toContainText('Mitarbeitende');
  });
});
