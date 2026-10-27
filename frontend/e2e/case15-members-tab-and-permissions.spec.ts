import { test, expect } from '@playwright/test';

test.describe('Test Case 15: Members Tab and Read-Only Membership Permissions', () => {
  test('verifies finanzausschuss sees Vereinsmitglieder tab with popovers, and restricted user sees only own family membership', async ({ request, page }) => {
    // Step 1: Reset DB
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const todayStr = new Date().toISOString().split('T')[0];

    // Step 2: Seed data using admin (developer@example.com)
    // Family 1: Maximilian Muster
    const fam1Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Maximilian',
            last_name: 'Muster',
            emails: [
              {
                value: 'max.muster@example.com',
                identifier_email: true,
                address_list: true,
              },
            ],
            phones: [],
            address: 'Musterstr. 1',
          },
        ],
      },
    });
    expect(fam1Res.ok()).toBeTruthy();
    const fam1 = await fam1Res.json();
    const maxParentId = fam1.parents[0].id;

    // Family 2: Erika Mustermann
    const fam2Res = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Erika',
            last_name: 'Mustermann',
            emails: [
              {
                value: 'erika.mustermann@example.com',
                identifier_email: true,
                address_list: true,
              },
            ],
            phones: [],
            address: 'Musterstr. 2',
          },
        ],
      },
    });
    expect(fam2Res.ok()).toBeTruthy();
    const fam2 = await fam2Res.json();
    const erikaParentId = fam2.parents[0].id;

    // Add full membership for Maximilian
    const memRes = await request.post('/api/memberships', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parent_id: maxParentId,
        start_date: todayStr,
        membership_type: 'full_member',
      },
    });
    expect(memRes.ok()).toBeTruthy();

    // Create a Finanzausschuss-like user with explicit permissions
    const userRes = await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'finanz@example.com',
        roles: [],
        permissions: ['fees.all.read', 'memberships.all.read'],
      },
    });
    expect(userRes.ok()).toBeTruthy();

    // =========================================================================
    // Step 3: Verify as Finanzausschuss (memberships.all.read)
    // =========================================================================
    await page.addInitScript(() => {
      localStorage.setItem('token', 'finanz@example.com');
    });

    await page.goto('/');

    // Check that 'Vereinsmitglieder' tab exists and switch to it
    const membersTabBtn = page.getByRole('button', { name: 'Vereinsmitglieder' });
    await expect(membersTabBtn).toBeVisible();
    await membersTabBtn.click();

    // Verify member row for Maximilian
    const memberRow = page.locator('tr', { hasText: 'Maximilian' }).filter({ hasText: 'Muster' });
    await expect(memberRow).toBeVisible();
    await expect(memberRow).toContainText('Voll');

    // Verify Erika (who is not a member) is NOT in the members table
    const nonMemberRow = page.locator('tr', { hasText: 'Erika' }).filter({ hasText: 'Mustermann' });
    await expect(nonMemberRow).toBeHidden();

    // Test clicking member type cell opens read-only popover
    const typeCell = page.locator(`#cell-member-type-${maxParentId}`);
    await expect(typeCell).toBeVisible();
    await typeCell.click();

    const popover = page.locator('.memberships-popover');
    await expect(popover).toBeVisible();
    // Read-only check: the '+' button to add membership must NOT exist
    const addMemBtn = popover.locator('button:has(svg.lucide-plus)');
    await expect(addMemBtn).toBeHidden();

    // Close popover
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();

    // Test clicking first became member date cell opens popover
    const firstDateCell = page.locator(`#cell-member-first-${maxParentId}`);
    await expect(firstDateCell).toBeVisible();
    await firstDateCell.click();
    await expect(popover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();

    // Test clicking last type change cell opens popover
    const changeDateCell = page.locator(`#cell-member-change-${maxParentId}`);
    await expect(changeDateCell).toBeVisible();
    await changeDateCell.click();
    await expect(popover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();

    // =========================================================================
    // Step 4: Verify as Restricted User (memberships.self.read via identifier email)
    // =========================================================================
    const restrictedPage = await page.context().newPage();
    await restrictedPage.addInitScript(() => {
      localStorage.setItem('token', 'max.muster@example.com');
    });

    await restrictedPage.goto('/');

    // Restricted parent must NOT see 'Vereinsmitglieder' tab
    const restrictedMembersTab = restrictedPage.getByRole('button', { name: 'Vereinsmitglieder' });
    await expect(restrictedMembersTab).toBeHidden();

    // In Overview tab, Maximilian's membership badge should be visible
    const maxOverviewRow = restrictedPage.locator('tr', { hasText: 'Maximilian' }).filter({ hasText: 'Muster' });
    await expect(maxOverviewRow).toBeVisible();
    const ownMembershipBadge = maxOverviewRow.locator('.overview-membership-badge');
    await expect(ownMembershipBadge).toBeVisible();
    await expect(ownMembershipBadge).toContainText('Voll');

    // Clicking own membership badge opens read-only popover
    await ownMembershipBadge.click();
    const restrictedPopover = restrictedPage.locator('.memberships-popover');
    await expect(restrictedPopover).toBeVisible();
    await expect(restrictedPopover.locator('button:has(svg.lucide-plus)')).toBeHidden();
    await restrictedPage.keyboard.press('Escape');
    await expect(restrictedPopover).toBeHidden();

    // Erika Mustermann's row must NOT show membership badge to Maximilian
    const erikaOverviewRow = restrictedPage.locator('tr', { hasText: 'Erika' }).filter({ hasText: 'Mustermann' });
    await expect(erikaOverviewRow).toBeVisible();
    const otherMembershipBadge = erikaOverviewRow.locator('.overview-membership-badge');
    await expect(otherMembershipBadge).toBeHidden();

    await restrictedPage.close();
  });

  test('renders members tab as adaptive cards with bottom-sheet popover on small screens', async ({ request, page }) => {
    // Reset DB state
    const resetRes = await request.post('/api/test/reset');
    expect(resetRes.ok()).toBeTruthy();

    const todayStr = new Date().toISOString().split('T')[0];

    // Seed family with parent Maximilian Muster
    const famRes = await request.post('/api/families', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parents: [
          {
            first_name: 'Maximilian',
            last_name: 'Muster',
            emails: [{ value: 'max.muster@example.com', identifier_email: true, address_list: true }],
            phones: [],
            address: 'Musterstr. 1',
          },
        ],
      },
    });
    expect(famRes.ok()).toBeTruthy();
    const fam = await famRes.json();
    const maxParentId = fam.parents[0].id;

    // Add membership
    const memRes = await request.post('/api/memberships', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        parent_id: maxParentId,
        start_date: todayStr,
        membership_type: 'full_member',
      },
    });
    expect(memRes.ok()).toBeTruthy();

    // Create a Finanzausschuss-like user with explicit permissions
    const userRes = await request.post('/api/admin/users', {
      headers: { Authorization: 'Bearer developer@example.com' },
      data: {
        email: 'finanz-mobile@example.com',
        roles: [],
        permissions: ['fees.all.read', 'memberships.all.read'],
      },
    });
    expect(userRes.ok()).toBeTruthy();

    // Set mobile viewport and authenticate
    await page.addInitScript(() => {
      localStorage.setItem('token', 'finanz-mobile@example.com');
    });
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');

    // Switch to Vereinsmitglieder tab
    const membersTabBtn = page.getByRole('button', { name: 'Vereinsmitglieder' });
    await expect(membersTabBtn).toBeVisible();
    await membersTabBtn.click();

    // 1. thead is hidden on mobile
    const thead = page.locator('.members-table thead');
    await expect(thead).toBeHidden();

    // 2. Member row is rendered as flex-column card
    const cardRow = page.locator('.members-table tbody tr:not(.empty-sub-row)', { hasText: 'Maximilian' });
    await expect(cardRow).toBeVisible();
    const displayVal = await cardRow.evaluate((el) => getComputedStyle(el).display);
    const flexDirVal = await cardRow.evaluate((el) => getComputedStyle(el).flexDirection);
    expect(displayVal).toBe('flex');
    expect(flexDirVal).toBe('column');

    // 3. Card header at top with person name
    const cardHeader = cardRow.locator('.card-person-header');
    await expect(cardHeader).toBeVisible();
    await expect(cardHeader).toContainText('Maximilian Muster');
    const weight = await cardHeader.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(parseInt(weight, 10)).toBeGreaterThanOrEqual(700);

    // 4. Duplicate name column in card body is hidden on mobile
    const nameCell = cardRow.locator('td[data-column-id="name"]');
    await expect(nameCell).toBeHidden();

    // 5. Data labels are set on membership cells
    const typeCell = cardRow.locator('td[data-column-id="membership_type"]');
    await expect(typeCell).toHaveAttribute('data-label', 'Mitgliedsart');
    await expect(typeCell).toContainText('Voll');

    const firstDateCell = cardRow.locator('td[data-column-id="first_became_member_date"]');
    await expect(firstDateCell).toHaveAttribute('data-label', 'Mitglied seit');

    const changeDateCell = cardRow.locator('td[data-column-id="last_type_change_date"]');
    await expect(changeDateCell).toHaveAttribute('data-label', 'Letzte Änderung');

    // 6. Clicking member cell opens bottom-sheet popover on mobile
    await typeCell.click();
    const bottomSheet = page.locator('.cell-popover-bottom-sheet');
    await expect(bottomSheet).toBeVisible();
    const backdrop = page.locator('.cell-popover-mobile-backdrop');
    await expect(backdrop).toBeVisible();

    // Clicking backdrop closes bottom-sheet
    await backdrop.click({ position: { x: 10, y: 10 } });
    await expect(bottomSheet).toBeHidden();
  });
});
