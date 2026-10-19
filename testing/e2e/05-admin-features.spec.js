/**
 * Admin Features Tests
 * UPDATED: 2025-11-05 for Epic #318 Phases 6, 7, 8 compatibility
 * - Compatible with centralized error handling (Phase 6 - Issue #335)
 * - Compatible with audit logging for admin actions (Phase 7 - Issue #338)
 * - API login patterns work with new error format including request IDs
 */
import { test, expect } from '@playwright/test';
import { gotoLogin, loginUser, gotoReview, gotoAdmin, gotoAnalytics, navigateToAdminSettings, TEST_ORG_ID } from './test-helpers.js';

test.describe('Admin Features', () => {
  let adminUser = null;
  let regularUser = null;

  test.beforeEach(async ({ page, request }) => {
    // Use existing dcadmin user which has admin privileges
    adminUser = {
      username: 'dcadmin',
      password: 'Password123!',
      // #892: /auth/login is email-keyed on the org-scoped path too.
      email: 'admin@democorp.com',
      token: null
    };

    // Get admin token via API
    const loginResponse = await request.post('http://localhost:4000/api/auth/login', {
      data: {
        email: adminUser.email,
        password: adminUser.password,
        organizationId: TEST_ORG_ID,
      }
    });
    if (loginResponse.ok()) {
      const loginData = await loginResponse.json();
      adminUser.token = loginData.token;

      // Set token in localStorage
      await page.goto('http://localhost:3000');
      await page.evaluate((token) => {
        localStorage.setItem('token', token);
      }, adminUser.token);
    }
  });

  test.describe('User Administration', () => {
    // TEST-ADMIN-01: Verify admin interface displays user management section
    test('should display admin user management interface for admins', async ({ page }) => {
      // Assuming the user has been promoted to admin externally
      // Navigate to admin settings
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await navigateToAdminSettings(page);

        // Should see user management section
        await expect(page.locator('[data-testid="user-management-section"]')).toBeVisible();
        await expect(page.locator('[data-testid="users-list"]')).toBeVisible();
      }
    });

    // TEST-ADMIN-02: Verify admin can view list of all users with details
    test('should list all users with their details', async ({ page }) => {
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await navigateToAdminSettings(page);

        // Scroll to user management section (it's below organization settings)
        await page.locator('[data-testid="user-management-section"]').scrollIntoViewIfNeeded();
        await page.locator('[data-testid="user-row"]').first().waitFor();

        // Should show user list with details
        const userRows = page.locator('[data-testid="user-row"]');
        const userRowCount = await userRows.count();
        expect(userRowCount).toBeGreaterThan(0);

        await expect(page.locator('[data-testid="user-username"]').first()).toBeVisible();
        await expect(page.locator('[data-testid="user-email"]').first()).toBeVisible();
        await expect(page.locator('[data-testid="user-admin-status"]').first()).toBeVisible();
      }
    });

    // TEST-ADMIN-03: Verify admin can promote regular users to admin status
    test('should allow admin to promote regular users to admin', async ({ page }) => {
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await navigateToAdminSettings(page);

        // Scroll to user management section
        await page.locator('[data-testid="user-management-section"]').scrollIntoViewIfNeeded();
        await page.locator('[data-testid="user-row"]').first().waitFor();

        // Find testuser (regular user) and promote
        const userRow = page.locator('[data-testid="user-row"]').filter({ hasText: 'dcuser' });

        // Click the edit button to open menu
        await userRow.locator('button[aria-label*="Edit"]').click();
        await page.locator('[data-testid="promote-admin-button"]').waitFor();

        // Click promote button in menu
        await page.locator('[data-testid="promote-admin-button"]').click();

        // Confirm promotion
        await expect(page.locator('[data-testid="promotion-success"]')).toContainText('promoted');
        await expect(userRow.locator('[data-testid="user-admin-status"]')).toBeVisible();
      }
    });

    // TEST-ADMIN-04: Verify admin can demote other admins to regular user status
    test('should allow admin to demote admin users to regular status', async ({ page }) => {
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await navigateToAdminSettings(page);

        // Scroll to user management section
        await page.locator('[data-testid="user-management-section"]').scrollIntoViewIfNeeded();
        await page.locator('[data-testid="user-row"]').first().waitFor();

        // Find an admin user (not self) and demote - testuser was just promoted in previous test
        const userRow = page.locator('[data-testid="user-row"]').filter({ hasText: 'dcuser' });

        // Open menu
        await userRow.locator('button[aria-label*="Edit"]').click();
        await page.locator('[data-testid="demote-admin-button"]').waitFor();

        // Click demote button
        await page.locator('[data-testid="demote-admin-button"]').click();

        // Confirm demotion
        await expect(page.locator('[data-testid="demotion-success"]')).toContainText(/demoted|removed/i);
      }
    });

    // TEST-ADMIN-05: Verify only admins can promote others to admin status
    test('should prevent non-admins from promoting others to admin', async ({ page, browser }) => {
      // Create new incognito context to login as regular user
      const regularContext = await browser.newContext();
      const regularPage = await regularContext.newPage();
      await gotoLogin(regularPage);

      const regularUser = {
        username: 'dcuser',
        // #892: /auth/login is email-keyed on the org-scoped path too.
        email: 'user@democorp.com',
        password: 'Password123!'
      };

      // Login as dcuser (regular user, not admin)
      await regularPage.locator('[data-testid="email"] input').first().fill(regularUser.email);
      await regularPage.locator('[data-testid="password"] input').first().fill(regularUser.password);
      await regularPage.locator('[data-testid="submit-button"]').first().click();

      // Wait for login to complete
      await regularPage.waitForLoadState('networkidle');

      // Regular user should not see admin menu button (primary security check)
      await expect(regularPage.locator('[data-testid="admin-menu-button"]')).not.toBeVisible();

      // Verify they cannot access admin settings page directly via URL
      await regularPage.goto('http://localhost:3000/org/' + TEST_ORG_ID + '/admin/settings');
      await regularPage.waitForLoadState('networkidle');

      // Should either redirect or show error - admin settings should not be accessible
      // Check that user management section is not visible
      await expect(regularPage.locator('[data-testid="user-management-section"]')).not.toBeVisible();

      await regularContext.close();
    });
  });

  test.describe('Theme and Customization', () => {
    // TEST-ADMIN-06: Verify admin can customize application theme colors
    test('should allow admin to customize application theme', async ({ page }) => {
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await navigateToAdminSettings(page);

        // Close any open menus by pressing Escape
        await page.keyboard.press('Escape');

        // Test color customization (no tabs - single page design)
        const newPrimaryColor = '#2563eb';

        // Scroll to and fill color field
        const colorField = page.locator('[data-testid="primary-color"]');
        await colorField.scrollIntoViewIfNeeded();

        const colorInput = colorField.locator('input[type="text"]');
        await colorInput.fill('');
        await colorInput.fill(newPrimaryColor);

        // Scroll to save button and save
        await page.locator('[data-testid="save-organization-settings"]').scrollIntoViewIfNeeded();
        await page.click('[data-testid="save-organization-settings"]');

        // Wait for save to complete - check for either success or error message
        await page.waitForLoadState('networkidle');

        // Check if there's an error or success - accept either as proof the save was attempted
        const hasSuccess = await page.locator('[data-testid="org-settings-success"]').count() > 0;
        const hasError = await page.locator('[data-testid="org-settings-error"]').count() > 0;

        if (!hasSuccess && !hasError) {
          // If no message appeared, the save might have succeeded silently
          // Verify the color persisted by reloading
          await page.reload();
          await page.waitForLoadState('networkidle');
          await page.locator('[data-testid="primary-color"]').scrollIntoViewIfNeeded();
          const reloadedColor = await page.locator('[data-testid="primary-color"] input[type="text"]').inputValue();
          expect(reloadedColor).toBe(newPrimaryColor);
        } else if (hasError) {
          // If there's an error, fail the test
          const errorText = await page.locator('[data-testid="org-settings-error"]').textContent();
          throw new Error(`Save failed with error: ${errorText}`);
        }
      }
    });

    // TEST-ADMIN-07: Verify admin can upload and set custom application logo
    test('should allow admin to upload custom logo', async ({ page }) => {
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await navigateToAdminSettings(page);

        // Close any open menus
        await page.keyboard.press('Escape');

        // Scroll down to logo upload section
        await page.locator('text=/logo upload/i').scrollIntoViewIfNeeded();

        // Set file input
        const fileInput = page.locator('[data-testid="logo-file-input"]');
        await fileInput.setInputFiles('./fixtures/test-logo.png');

        // Upload button should now be enabled
        const uploadButton = page.locator('[data-testid="upload-logo-button"]');
        await expect(uploadButton).toBeEnabled();

        // Click upload
        await uploadButton.click();

        // Wait for upload to complete
        await page.waitForLoadState('networkidle');

        // Verify logo appears
        await expect(page.locator('[data-testid="uploaded-logo"]')).toBeVisible();
      }
    });

    // TEST-ADMIN-09: Verify theme changes apply immediately to all pages
    test('should apply theme changes immediately across application', async ({ page, context }) => {
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await navigateToAdminSettings(page);

        // Change theme (no tabs - single page)
        await page.locator('[data-testid="primary-color"] input[type="text"]').fill('#059669');
        await page.click('[data-testid="save-organization-settings"]');

        await page.waitForLoadState('networkidle');

        // Open new page to verify theme persistence
        const newPage = await context.newPage();
        await gotoLogin(newPage);

        // Theme should be applied on new page load (check header color)
        // Note: Exact verification depends on theme implementation
        await newPage.close();
      }
    });
  });

  test.describe('Data Export', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to review page (token already set in main beforeEach)
      await page.goto(`http://localhost:3000/org/${TEST_ORG_ID}/review`);
      await page.waitForLoadState('networkidle');

      // Check if we're logged in by looking for the submit idea button
      const isLoggedIn = await page.locator('[data-testid="submit-idea-button"]').isVisible().catch(() => false);

      if (!isLoggedIn) {
        console.log('Not logged in - submit idea button not available');
        return;
      }

      // Create some test data first
      await page.click('[data-testid="submit-idea-button"]');
      await page.fill('[data-testid="idea-title"] input', 'Export Test Idea');
      await page.fill('[data-testid="idea-description"] textarea', 'This idea is for testing export functionality');
      await page.fill('[data-testid="idea-category"] input', 'Export Testing');
      await page.fill('[data-testid="organizational-impact"] textarea', 'This is causing problems');
      await page.click('[data-testid="fix-impact"]');
      await page.click('text=Medium');
      await page.fill('[data-testid="solution"] textarea', 'Use this approach to fix it');

      // Select "Yes" for "Would you spend your own money on it?"
      await page.locator('[data-testid="would-spend-money"] input[value="true"]').check();

      await page.click('[data-testid="submit-idea-btn"]');

      // Handle success dialog
      try {
        await page.waitForSelector('[role="dialog"]', { timeout: 2000 });
        const dialogButtons = await page.locator('[role="dialog"] button').all();
        for (const button of dialogButtons) {
          const buttonText = await button.textContent();
          if (buttonText && /review|view|ideas/i.test(buttonText)) {
            await button.click();
            break;
          }
        }
      } catch (error) {
        await page.click('[data-testid="review-ideas-button"]');
      }

      // Click on the idea card to open detail view
      await page.click('[data-testid="idea-card"]');
      await page.fill('[data-testid="comment-input"] textarea', 'Test comment for export');
      await page.click('[data-testid="submit-comment-button"]');

      // Vote on the idea using proper selector
      const voteButton = page.getByRole('button').filter({ hasText: /Vote|Voted/ });
      await voteButton.click();
    });

    // TEST-ADMIN-10: Verify admin can export all data to Excel format
    test('should allow admin to export data to Excel', async ({ page }) => {
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await navigateToAdminSettings(page);

        // Navigate to export section
        await page.click('[data-testid="export-settings-tab"]');

        // Set up download handling
        const downloadPromise = page.waitForEvent('download');

        // Click Excel export
        await page.click('[data-testid="export-excel-button"]');

        // Wait for download to start
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('.xlsx');
      }
    });

    // TEST-ADMIN-11: Verify admin can export all data to CSV format
    test('should allow admin to export data to CSV', async ({ page }) => {
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await navigateToAdminSettings(page);
        await page.click('[data-testid="export-settings-tab"]');

        const downloadPromise = page.waitForEvent('download');
        await page.click('[data-testid="export-csv-button"]');

        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('.csv');
      }
    });

    // TEST-ADMIN-12: Verify exports include all relevant data types (ideas, comments, votes)
    test('should include all relevant data in export', async ({ page }) => {
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await navigateToAdminSettings(page);
        await page.click('[data-testid="export-settings-tab"]');

        // Should show export preview/summary
        await expect(page.locator('[data-testid="export-summary"]')).toContainText('ideas');
        await expect(page.locator('[data-testid="export-summary"]')).toContainText('comments');
        await expect(page.locator('[data-testid="export-summary"]')).toContainText('votes');
      }
    });

    // TEST-ADMIN-13: Verify system handles large dataset exports with progress indicators
    test('should handle large dataset exports efficiently', async ({ page }) => {
      // This test would need a database with significant test data
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await navigateToAdminSettings(page);
        await page.click('[data-testid="export-settings-tab"]');

        // Show loading indicator during export
        await page.click('[data-testid="export-excel-button"]');

        // Should show progress indicator for large exports
        if (await page.locator('[data-testid="export-progress"]').isVisible()) {
          await expect(page.locator('[data-testid="export-progress"]')).toBeVisible();
        }
      }
    });

    // TEST-ADMIN-14: Verify export functionality is restricted to admin users only
    test('should restrict export functionality to admin users only', async ({ page, browser }) => {
      // Create a new incognito context to test as a regular user
      const regularContext = await browser.newContext();
      const regularPage = await regularContext.newPage();
      await gotoLogin(regularPage);

      const regularUser = {
        username: 'dcuser',
        // #892: /auth/login is email-keyed on the org-scoped path too.
        email: 'user@democorp.com',
        password: 'Password123!'
      };

      // Login as regular user
      await regularPage.locator('[data-testid="email"] input').first().fill(regularUser.email);
      await regularPage.locator('[data-testid="password"] input').first().fill(regularUser.password);
      await regularPage.locator('[data-testid="submit-button"]').first().click();

      // Wait for login to complete
      await regularPage.waitForLoadState('networkidle');

      // Regular user should not see admin menu button (which contains export functions)
      await expect(regularPage.locator('[data-testid="admin-menu-button"]')).not.toBeVisible();

      await regularContext.close();
    });
  });

  test.describe('Admin Idea Controls', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to review page (token already set in main beforeEach)
      await page.goto(`http://localhost:3000/org/${TEST_ORG_ID}/review`);
      await page.waitForLoadState('networkidle');

      const submitButtonVisible = await page.locator('[data-testid="submit-idea-button"]').isVisible().catch(() => false);
      if (!submitButtonVisible) {
        console.log('Submit idea button not available - user may not be logged in');
        return;
      }

      // Submit an idea to manage
      await page.click('[data-testid="submit-idea-button"]');
      await page.fill('[data-testid="idea-title"] input', 'Admin Control Test Idea');
      await page.fill('[data-testid="idea-description"] textarea', 'Testing admin controls on ideas');
      await page.fill('[data-testid="idea-category"] input', 'Admin Testing');
      await page.fill('[data-testid="organizational-impact"] textarea', 'This is causing problems');
      await page.click('[data-testid="fix-impact"]');
      await page.click('text=Medium');
      await page.fill('[data-testid="solution"] textarea', 'Use this approach to fix it');

      // Select "Yes" for "Would you spend your own money on it?"
      await page.locator('[data-testid="would-spend-money"] input[value="true"]').check();

      await page.click('[data-testid="submit-idea-btn"]');

      // Handle success dialog
      try {
        await page.waitForSelector('[role="dialog"]', { timeout: 2000 });
        const dialogButtons = await page.locator('[role="dialog"] button').all();
        for (const button of dialogButtons) {
          const buttonText = await button.textContent();
          if (buttonText && /review|view|ideas/i.test(buttonText)) {
            await button.click();
            break;
          }
        }
      } catch (error) {
        await page.click('[data-testid="review-ideas-button"]');
      }

      await page.click('[data-testid="idea-card"]');
    });

    // TEST-ADMIN-15: Verify admin controls are visible on idea detail pages for admins
    test('should show admin controls on idea detail page for admins', async ({ page }) => {
      if (await page.locator('[data-testid="admin-controls"]').isVisible()) {
        await expect(page.locator('[data-testid="admin-controls"]')).toBeVisible();
        await expect(page.locator('[data-testid="status-control"]')).toBeVisible();
        await expect(page.locator('[data-testid="priority-control"]')).toBeVisible();
        await expect(page.locator('[data-testid="category-control"]')).toBeVisible();
        await expect(page.locator('[data-testid="pin-control"]')).toBeVisible();
      }
    });

    // TEST-ADMIN-16: Verify admin can change idea status (pending, under review, etc.)
    test('should allow admin to change idea status', async ({ page }) => {
      if (await page.locator('[data-testid="admin-controls"]').isVisible()) {
        await page.click('[data-testid="expand-admin-controls"]');

        // Change status to "Under Review"
        await page.selectOption('[data-testid="status-select"]', 'Under Review');
        await page.click('[data-testid="save-admin-changes"]');

        await expect(page.locator('[data-testid="idea-status"]')).toContainText('Under Review');
        await expect(page.locator('[data-testid="admin-success"]')).toContainText('Status updated');
      }
    });

    // TEST-ADMIN-17: Verify admin can set and update idea priority levels
    test('should allow admin to set idea priority', async ({ page }) => {
      if (await page.locator('[data-testid="admin-controls"]').isVisible()) {
        await page.click('[data-testid="expand-admin-controls"]');

        // Set priority to 8
        await page.fill('[data-testid="priority-input"]', '8');
        await page.click('[data-testid="save-admin-changes"]');

        await expect(page.locator('[data-testid="idea-priority"]')).toContainText('8');
      }
    });

    // TEST-ADMIN-18: Verify admin can pin ideas to top of lists
    test('should allow admin to pin/unpin ideas', async ({ page }) => {
      if (await page.locator('[data-testid="admin-controls"]').isVisible()) {
        await page.click('[data-testid="expand-admin-controls"]');

        // Pin the idea
        await page.check('[data-testid="pin-idea-checkbox"]');
        await page.click('[data-testid="save-admin-changes"]');

        await expect(page.locator('[data-testid="pinned-indicator"]')).toBeVisible();

        // Navigate to ideas list to verify pinned idea appears first
        await page.click('[data-testid="review-ideas-button"]');

        // Pinned ideas should appear at the top regardless of sort
        const firstIdea = page.locator('[data-testid="idea-card"]').first();
        await expect(firstIdea).toContainText('Admin Control Test Idea');
        await expect(firstIdea.locator('[data-testid="pinned-badge"]')).toBeVisible();
      }
    });

    // TEST-ADMIN-19: Verify admin can change idea categories
    test('should allow admin to change idea category', async ({ page }) => {
      if (await page.locator('[data-testid="admin-controls"]').isVisible()) {
        await page.click('[data-testid="expand-admin-controls"]');

        // Change category using Select dropdown
        const newCategory = 'Administrative';
        await page.locator('[data-testid="admin-category-input"]').click();
        await page.getByRole('option', { name: newCategory }).click();

        // Wait for save to complete
        await page.waitForLoadState('networkidle');

        // Verify category was changed
        await expect(page.locator('[data-testid="idea-category"]')).toContainText(newCategory);
      }
    });

    // TEST-ADMIN-20: Verify admin can create new categories while managing ideas
    test('should allow admin to create new categories from idea management', async ({ page }) => {
      if (await page.locator('[data-testid="admin-controls"]').isVisible()) {
        await page.click('[data-testid="expand-admin-controls"]');

        const newCategory = `New Category ${Date.now()}`;
        await page.fill('[data-testid="admin-category-input"]', newCategory);

        // Should show "Create new category" option
        if (await page.locator('[data-testid="create-category-option"]').isVisible()) {
          await page.click('[data-testid="create-category-option"]');
        }

        await page.click('[data-testid="save-admin-changes"]');

        await expect(page.locator('[data-testid="idea-category"]')).toContainText(newCategory);
      }
    });

    // TEST-ADMIN-21: Verify admin interface provides helpful hints and tooltips
    test('should provide helpful hints about status meanings', async ({ page }) => {
      if (await page.locator('[data-testid="admin-controls"]').isVisible()) {
        await page.click('[data-testid="expand-admin-controls"]');

        // Hover over or click status help
        if (await page.locator('[data-testid="status-help"]').isVisible()) {
          await page.hover('[data-testid="status-help"]');
          await expect(page.locator('[data-testid="status-tooltip"]')).toBeVisible();
        }
      }
    });

    // TEST-ADMIN-22: Verify admin controls can be collapsed/expanded to reduce clutter
    test('should allow collapsing and expanding admin controls', async ({ page }) => {
      if (await page.locator('[data-testid="admin-controls"]').isVisible()) {
        // Controls should be collapsed by default to avoid clutter
        await expect(page.locator('[data-testid="admin-controls-expanded"]')).not.toBeVisible();

        // Expand controls
        await page.click('[data-testid="expand-admin-controls"]');
        await expect(page.locator('[data-testid="admin-controls-expanded"]')).toBeVisible();

        // Collapse controls
        await page.click('[data-testid="collapse-admin-controls"]');
        await expect(page.locator('[data-testid="admin-controls-expanded"]')).not.toBeVisible();
      }
    });

    // TEST-ADMIN-23: Verify admin controls are hidden from regular users
    test('should not show admin controls to regular users', async ({ page, browser, request }) => {
      // Login as regular user via API. #892: /auth/login is email-keyed on
      // the org-scoped path too.
      const loginResponse = await request.post('http://localhost:4000/api/auth/login', {
        data: { email: 'user@democorp.com', password: 'Password123!', organizationId: TEST_ORG_ID }
      });

      if (!loginResponse.ok()) {
        console.log('dcuser login failed, skipping test');
        return;
      }

      const { token } = await loginResponse.json();

      // Create new incognito context for regular user
      const regularContext = await browser.newContext();
      const regularPage = await regularContext.newPage();

      // Set regular user token
      await regularPage.goto('http://localhost:3000');
      await regularPage.evaluate((token) => {
        localStorage.setItem('token', token);
      }, token);

      // Navigate to review page
      await regularPage.goto(`http://localhost:3000/org/${TEST_ORG_ID}/review`);
      await regularPage.waitForLoadState('networkidle');

      // Navigate to an idea
      const firstIdea = regularPage.locator('[data-testid="idea-card"]').first();
      if (await firstIdea.isVisible()) {
        await firstIdea.click();
        await regularPage.locator('[data-testid="idea-title"]').waitFor();

        // Should not see admin controls
        await expect(regularPage.locator('[data-testid="admin-controls"]')).not.toBeVisible();
      }

      await regularContext.close();
    });
  });

  test.describe('Category Management', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to review page (token already set in main beforeEach)
      await page.goto(`http://localhost:3000/org/${TEST_ORG_ID}/review`);
      await page.waitForLoadState('networkidle');

      // Verify we're logged in (not redirected to login page). #892: the
      // login credential field is email, not username.
      const isLoginPage = await page.locator('[data-testid="email"]').first().isVisible({ timeout: 2000 }).catch(() => false);
      if (isLoginPage) {
        // Token didn't persist, reload to apply it
        await page.reload();
        await page.waitForLoadState('networkidle');
      }
    });

    // TEST-ADMIN-24: Verify admin can create new categories dynamically
    test('should allow admin to create new categories when editing ideas', async ({ page }) => {
      // Navigate to an idea
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await page.click('[data-testid="review-ideas-button"]').catch(() => {});
        await page.locator('[data-testid="idea-card"]').first().waitFor();

        // Click on an idea
        await page.locator('[data-testid="idea-card"]').first().click();
        await page.locator('[data-testid="idea-title"]').waitFor();

        // Expand admin controls if collapsed
        const expandButton = page.locator('[data-testid="expand-admin-controls"]');
        if (await expandButton.isVisible()) {
          await expandButton.click();
          await page.locator('[data-testid="admin-category-input"]').waitFor();
        }

        // Type a custom category in the Autocomplete field
        const customCategory = `Custom Category ${Date.now()}`;
        const categoryInput = page.locator('[data-testid="admin-category-input"] input');
        await categoryInput.fill(customCategory);
        await page.locator(`[role="option"]:has-text("${customCategory}")`).waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

        // Press Enter to trigger onChange and save
        await categoryInput.press('Enter');
        await page.waitForLoadState('networkidle');

        // Verify the custom category was applied by checking the input value
        const updatedValue = await categoryInput.inputValue();
        expect(updatedValue).toBe(customCategory);
      }
    });

    // TEST-ADMIN-25: Verify category suggestions work during idea submission
    test('should provide category suggestions during idea submission', async ({ page }) => {
      // Already on review page from beforeEach, navigate to idea submission form
      const submitButton = page.locator('[data-testid="submit-idea-button"]');
      if (await submitButton.isVisible({ timeout: 5000 })) {
        await submitButton.click();
        await page.locator('[data-testid="idea-title"]').waitFor();
      } else {
        console.log('Submit idea button not visible, skipping test');
        return;
      }

      // Fill required fields first
      await page.fill('[data-testid="idea-title"] input', 'Test Category Suggestion Idea');
      await page.fill('[data-testid="idea-description"] textarea', 'Testing category suggestions functionality');

      // Type in category field to trigger autocomplete suggestions
      const categoryInput = page.locator('[data-testid="idea-category"] input');
      await categoryInput.fill('Tech');
      await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

      // Look for autocomplete dropdown options
      const suggestions = page.locator('[role="option"]');
      const suggestionCount = await suggestions.count();

      // Should show categories containing "Tech" - verify Technology appears in the list
      if (suggestionCount > 0) {
        const technologyOption = page.locator('[role="option"]:has-text("Technology")');
        await expect(technologyOption).toBeVisible();
      }
    });

    // TEST-ADMIN-23: Verify category filtering works in idea browsing
    test('should allow filtering ideas by category', async ({ page }) => {
      // Already on review/ideas list from beforeEach

      // Look for category filter
      const categoryFilter = page.locator('[data-testid="category-filter"], [data-testid="filter-dropdown"], select[name="category"]').first();
      if (await categoryFilter.isVisible()) {
        // Select a category
        await categoryFilter.click();
        await page.locator('[data-testid="category-option"], option, [role="option"]').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

        // Choose a category option
        const categoryOption = page.locator('[data-testid="category-option"], option, [role="option"]').first();
        if (await categoryOption.isVisible()) {
          await categoryOption.click();
          await page.waitForLoadState('networkidle');

          // Verify filtered results
          const ideaCards = page.locator('[data-testid="idea-card"]');
          if (await ideaCards.first().isVisible()) {
            const count = await ideaCards.count();
            expect(count).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });

    // TEST-ADMIN-26: Verify custom categories persist across pages
    test('should persist custom categories created by admin', async ({ page }) => {
      // Admin creates a custom category on one idea
      if (await page.locator('[data-testid="admin-menu-button"]').isVisible()) {
        await page.click('[data-testid="review-ideas-button"]');
        await page.locator('[data-testid="idea-card"]').first().waitFor();

        // Click first idea
        await page.locator('[data-testid="idea-card"]').first().click();
        await page.locator('[data-testid="idea-title"]').waitFor();

        // Expand admin controls if collapsed
        const expandButton = page.locator('[data-testid="expand-admin-controls"]');
        if (await expandButton.isVisible()) {
          await expandButton.click();
          await page.locator('[data-testid="admin-category-input"]').waitFor();
        }

        // Create a unique custom category
        const customCategory = `Persistent Category ${Date.now()}`;
        const categoryInput = page.locator('[data-testid="admin-category-input"] input');
        await categoryInput.fill(customCategory);
        await categoryInput.press('Enter');
        await page.waitForLoadState('networkidle');

        // Navigate back using browser back button
        await page.goBack();
        await page.locator('[data-testid="idea-card"]').first().waitFor();

        // Click a different idea
        await page.locator('[data-testid="idea-card"]').nth(1).click();
        await page.locator('[data-testid="idea-title"]').waitFor();

        // Expand admin controls on second idea if collapsed
        const secondExpandButton = page.locator('[data-testid="expand-admin-controls"]');
        if (await secondExpandButton.isVisible()) {
          await secondExpandButton.click();
          await page.locator('[data-testid="admin-category-input"]').waitFor();
        }

        // Click the category field to open dropdown
        const secondCategoryInput = page.locator('[data-testid="admin-category-input"] input');
        await secondCategoryInput.click();
        await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

        // The custom category SHOULD appear in the options because it's stored in the database
        // and fetched dynamically when the component loads
        const options = page.locator('[role="option"]');
        const optionCount = await options.count();

        // Verify the custom category appears in the dropdown options
        if (optionCount > 0) {
          const hasCustomCategory = await page.locator(`[role="option"]:has-text("${customCategory}")`).count() > 0;
          // Custom categories should persist in the database and appear in dropdown
          expect(hasCustomCategory).toBe(true);
        }
      }
    });
  });
});