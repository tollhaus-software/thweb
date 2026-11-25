import { test, expect } from '@playwright/test';

test.describe('Test Case 49: Parent and Employee Nicknames (MGA/PA Scoped)', () => {
  test.beforeEach(async ({ request }) => {
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();
  });

  test('manages nicknames in Eltern(MGA) and Mitarbeitende(PA), enforces strict visibility scoping, and preserves nicknames on self-service updates', async ({
    request,
    page,
  }) => {
    // 1. Seed a family with an identifier email (for self-service check) and an enrolled child (for overview visibility)
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Eva-Maria',
            last_name: 'Beispiel',
            emails: [{ value: 'eva-maria@example.com', identifier_email: true, address_list: true }],
            phones: [{ value: '0171 999888', type: 'mobile', address_list: true }],
          },
          {
            first_name: 'Max',
            last_name: 'Beispiel',
            emails: [{ value: 'max@example.com', identifier_email: false, address_list: true }],
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const family = await famRes.json();

    const childId = crypto.randomUUID();
    const childRes = await request.put(`/api/children/${childId}`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        id: childId,
        family_id: family.id,
        first_name: 'Lukas',
        last_name: 'Beispiel',
        birth_date: '2021-06-15',
      },
    });
    expect(childRes.ok()).toBeTruthy();
    await request.post(`/api/children/${childId}/group_changes`, {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: { child_id: childId, change_date: '2024-01-01', target_group: 1 },
    });

    // 2. Seed an employee
    const empRes = await request.post('/api/employees', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        first_name: 'Rosalia',
        last_name: 'Küche',
        employee_type: 'cook',
        emails: [],
        phones: [],
      },
    });
    expect(empRes.ok()).toBeTruthy();
    const seededEmp = await empRes.json();

    // 3. Seed an employee reader user and an allergy-only employee reader user
    await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'pa-reader@example.com',
        roles: [],
        permissions: ['employees.all.read'],
      },
    });
    await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'allergy-emp-only@example.com',
        roles: [],
        permissions: ['allergies.employees.read', 'allergies.employees.write'],
      },
    });

    // =========================================================================
    // Part 1: Admin edits & searches Parent nicknames in Eltern(MGA)
    // =========================================================================
    await page.addInitScript(() => {
      localStorage.setItem('token', 'developer@example.com');
    });
    await page.goto('/#parents');

    const evaRow = page.locator('tr').filter({ hasText: 'Eva-Maria' }).first();
    await expect(evaRow).toBeVisible();

    const evaFirstNameCell = evaRow.locator('td[data-column-id="first_name"]');
    await evaFirstNameCell.locator('.cell-edit-pencil-btn').click();

    const popover = page.locator('.glass-popup');
    await expect(popover).toBeVisible();
    await expect(popover.locator('label', { hasText: 'Vorname:' })).toBeVisible();
    await expect(popover.locator('label', { hasText: 'Abweichend für Addressliste:' })).toBeVisible();
    await expect(popover.locator('label', { hasText: 'Spitznamen:' })).toBeVisible();

    // Add one nickname via + button and another typed directly before Save
    const nickInput = popover.locator('input.nicknames-input');
    await nickInput.fill('Mimi');
    await popover.locator('button.btn-add-nickname').click();
    await expect(popover.locator('.nickname-chip', { hasText: 'Mimi' })).toBeVisible();

    await nickInput.fill('Evchen');
    await popover.locator('button.btn-save').click();
    await expect(popover).toBeHidden();

    // Badge is visible in Eltern(MGA)
    await expect(evaFirstNameCell.getByTestId('nicknames-badge')).toContainText('Mimi, Evchen');

    // Search in Eltern(MGA) finds Eva-Maria by nickname "Mimi"
    const searchInput = page.locator('input[type="search"], input[placeholder*="suchen"]').first();
    await searchInput.fill('Mimi');
    await expect(page.locator('tr').filter({ hasText: 'Eva-Maria' }).first()).toBeVisible();
    await searchInput.fill('');

    // Remove "Evchen" chip and keep only "Mimi"
    await evaFirstNameCell.locator('.cell-edit-pencil-btn').click();
    await expect(popover).toBeVisible();
    await popover.getByRole('button', { name: 'Spitzname entfernen: Evchen' }).click();
    await popover.locator('button.btn-save').click();
    await expect(popover).toBeHidden();
    await expect(evaFirstNameCell.getByTestId('nicknames-badge')).toHaveText('🏷️ Mimi');

    // Verify Kinder(MGA) FirstNameEditor does NOT show Spitznamen field
    await page.getByRole('button', { name: 'Kinder(MGA)' }).click();
    const lukasRow = page.locator('tr').filter({ hasText: 'Lukas' }).first();
    await lukasRow.locator('td[data-column-id="first_name"] .cell-edit-pencil-btn').click();
    await expect(popover).toBeVisible();
    await expect(popover.locator('label', { hasText: 'Spitznamen:' })).toHaveCount(0);
    await popover.locator('button.btn-cancel').click();

    // Verify Familien(MGA) does NOT display the nickname
    await page.getByRole('button', { name: 'Familien(MGA)' }).click();
    await expect(page.locator('table')).toContainText('Eva-Maria Beispiel');
    await expect(page.locator('table')).not.toContainText('Mimi');

    // Verify Familien (Overview / Address List) does NOT display the nickname
    await page.locator('.sidebar-nav-item', { hasText: 'Familien' }).click();
    const overviewTable = page.locator('.overview-table');
    await expect(overviewTable).toContainText('Eva-Maria');
    await expect(overviewTable).not.toContainText('Mimi');

    // Verify API /api/families/overview does NOT expose nicknames
    const ovRes = await request.get('/api/families/overview', {
      headers: { Authorization: 'Bearer eva-maria@example.com' },
    });
    expect(ovRes.ok()).toBeTruthy();
    const ovJson = await ovRes.json();
    expect(JSON.stringify(ovJson)).not.toContain('Mimi');
    expect(JSON.stringify(ovJson)).not.toContain('nicknames');

    // =========================================================================
    // Part 2: Self-Service Parent cannot see nicknames AND updating phones preserves nicknames
    // =========================================================================
    const selfGetRes = await request.get('/api/self-service/parents', {
      headers: { Authorization: 'Bearer eva-maria@example.com' },
    });
    expect(selfGetRes.ok()).toBeTruthy();
    const selfData = await selfGetRes.json();
    expect(JSON.stringify(selfData)).not.toContain('Mimi');
    expect(JSON.stringify(selfData)).not.toContain('nicknames');

    // Update phone via self-service
    const updatedSelfParents = selfData.parents.map((p: any) =>
      p.first_name === 'Eva-Maria'
        ? { ...p, phones: [{ value: '0171 555444', type: 'mobile', address_list: true }] }
        : p
    );
    const selfPutRes = await request.put('/api/self-service/parents', {
      headers: { Authorization: 'Bearer eva-maria@example.com' },
      data: { parents: updatedSelfParents },
    });
    expect(selfPutRes.ok()).toBeTruthy();
    const selfPutData = await selfPutRes.json();
    expect(JSON.stringify(selfPutData)).not.toContain('Mimi');

    // Verify MGA still has Eva-Maria's nickname "Mimi"!
    const adminFamRes = await request.get('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
    });
    expect(adminFamRes.ok()).toBeTruthy();
    const adminFams = await adminFamRes.json();
    const savedEva = adminFams[0].parents.find((p: any) => p.first_name === 'Eva-Maria');
    expect(savedEva.nicknames).toEqual(['Mimi']);

    // =========================================================================
    // Part 3: Admin & PA-Reader Employee nicknames in Mitarbeitende(PA)
    // =========================================================================
    await page.goto('/#employees');
    const rosaliaRow = page.locator('tr').filter({ hasText: 'Rosalia' }).first();
    await expect(rosaliaRow).toBeVisible();

    const rosaliaFirstNameCell = rosaliaRow.locator('td[data-column-id="first_name"]');
    await rosaliaFirstNameCell.locator('.cell-edit-pencil-btn').click();
    await expect(popover).toBeVisible();
    // Employees do NOT have "Abweichend für Addressliste:", only "Vorname:" and "Spitznamen:"
    await expect(popover.locator('label', { hasText: 'Vorname:' })).toBeVisible();
    await expect(popover.locator('label', { hasText: 'Abweichend für Addressliste:' })).toHaveCount(0);
    await expect(popover.locator('label', { hasText: 'Spitznamen:' })).toBeVisible();

    await popover.locator('input.nicknames-input').fill('Rosi');
    await popover.locator('input.nicknames-input').press('Enter');
    await expect(popover).toBeHidden();

    await expect(rosaliaFirstNameCell.getByTestId('nicknames-badge')).toHaveText('🏷️ Rosi');

    // Search in Mitarbeitende(PA) finds Rosalia by nickname "Rosi"
    const empSearch = page.locator('input[type="search"], input[placeholder*="suchen"]').first();
    await empSearch.fill('Rosi');
    await expect(page.locator('tr').filter({ hasText: 'Rosalia' }).first()).toBeVisible();
    await empSearch.fill('');

    // PA reader (employees.all.read) CAN see nickname badge in Mitarbeitende(PA), without edit pencil
    const paReaderPage = await page.context().newPage();
    await paReaderPage.addInitScript(() => {
      localStorage.setItem('token', 'pa-reader@example.com');
    });
    await paReaderPage.goto('/#employees');
    const readerRosaliaCell = paReaderPage
      .locator('tr')
      .filter({ hasText: 'Rosalia' })
      .first()
      .locator('td[data-column-id="first_name"]');
    await expect(readerRosaliaCell.getByTestId('nicknames-badge')).toHaveText('🏷️ Rosi');
    await expect(readerRosaliaCell.locator('.cell-edit-pencil-btn')).toHaveCount(0);
    await paReaderPage.close();

    // Allergy-only employee user (no employees.all.read) does NOT receive employee nicknames via API
    // and cannot modify employee nicknames
    const allergyEmpGet = await request.get('/api/employees', {
      headers: { Authorization: 'Bearer allergy-emp-only@example.com' },
    });
    expect(allergyEmpGet.ok()).toBeTruthy();
    const allergyEmps = await allergyEmpGet.json();
    expect(JSON.stringify(allergyEmps)).not.toContain('Rosi');
    expect(JSON.stringify(allergyEmps)).not.toContain('nicknames');

    const forbiddenNickUpdate = await request.put(`/api/employees/${seededEmp.id}`, {
      headers: { Authorization: 'Bearer allergy-emp-only@example.com' },
      data: {
        first_name: 'Rosalia',
        last_name: 'Küche',
        employee_type: 'cook',
        nicknames: ['HackedNick'],
        allergies: ['Nüsse'],
      },
    });
    expect(forbiddenNickUpdate.status()).toBe(403);
  });
});
