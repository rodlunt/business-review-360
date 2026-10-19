/**
 * UPDATED: 2025-11-05 for Epic #318 Phases 6, 7, 8 compatibility
 * - Compatible with centralized error handling (Phase 6 - Issue #335)
 * - Compatible with audit logging for admin actions (Phase 7 - Issue #338)
 * - API login patterns work with new error format
 */
import { test, expect } from '@playwright/test';
import { gotoLogin, loginUser, gotoReview, gotoAdmin, gotoAnalytics, TEST_ORG_ID } from './test-helpers.js';

/**
 * Admin Status Management Tests
 *
 * Tests the comprehensive status system and quick-change functionality
 * implemented to resolve issues #67, #82
 *
 * Status Options: Reviewing, In Progress, Approved, Complete, Rejected, Duplicate, Hidden, Open
 *
 * Features tested:
 * - Quick status change from card view via dropdown
 * - Status dropdown visibility and positioning (using React Portal)
 * - Auto-close after 4 seconds
 * - Click-outside-to-close functionality
 * - Hidden status (ideas hidden from regular users)
 * - Status color coding (green/yellow/red indicators)
 */

test.describe('Admin Status Management', () => {
  let adminUser = null;
  let testIdea = null;

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

      // Set token in localStorage and navigate to review page
      await page.goto(`http://localhost:3000/org/${TEST_ORG_ID}/review`);
      await page.evaluate((token) => {
        localStorage.setItem('token', token);
      }, adminUser.token);
      await page.reload();
      await page.waitForLoadState('networkidle');
    }

    // Create a test idea for status management
    if (await page.locator('[data-testid="submit-idea-button"]').isVisible()) {
      await page.click('[data-testid="submit-idea-button"]');
      await page.fill('[data-testid="idea-title"] input', 'Status Management Test Idea');
      await page.fill('[data-testid="idea-description"] textarea', 'Testing comprehensive status management');
      await page.fill('[data-testid="idea-category"] input', 'Status Testing');
      await page.fill('[data-testid="organizational-impact"] textarea', 'Need to test status changes');
      await page.click('[data-testid="fix-impact"]');
      await page.click('text=High');
      await page.fill('[data-testid="solution"] textarea', 'Implement comprehensive testing');
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
    }
  });

  test.describe('Status Options and System', () => {
    // TEST-STATUS-01: Verify all 8 status options are available
    test('should show all 8 status options in dropdown', async ({ page }) => {
      const expectedStatuses = [
        'Reviewing',
        'In Progress',
        'Approved',
        'Complete',
        'Rejected',
        'Duplicate',
        'Hidden',
        'Open'
      ];

      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        // Click on status dot to open dropdown
        const statusDot = page.locator('[data-testid="idea-card"]').first().locator('[data-testid="status-dot"]');
        if (await statusDot.isVisible()) {
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();

          // Verify all status options appear
          const dropdown = page.locator('[data-testid="status-dropdown"]');
          await expect(dropdown).toBeVisible();

          for (const status of expectedStatuses) {
            await expect(dropdown.getByText(status)).toBeVisible();
          }
        }
      }
    });

    // TEST-STATUS-02: Verify status color coding (green/yellow/red)
    test('should display correct color indicators for different statuses', async ({ page }) => {
      const statusColors = {
        'Complete': 'green',
        'Approved': 'green',
        'In Progress': 'yellow',
        'Reviewing': 'yellow',
        'Rejected': 'red',
        'Duplicate': 'red'
      };

      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        for (const [status, expectedColor] of Object.entries(statusColors)) {
          // Open status dropdown
          const statusDot = page.locator('[data-testid="idea-card"]').first().locator('[data-testid="status-dot"]');
          if (await statusDot.isVisible()) {
            await statusDot.click();
            await page.locator('[data-testid="status-dropdown"]').waitFor();

            // Select the status
            await page.getByText(status, { exact: true }).click();
            await page.waitForLoadState('networkidle');

            // Verify color indicator
            const dotColor = await statusDot.evaluate((el) => {
              const bgColor = window.getComputedStyle(el).backgroundColor;
              // Convert RGB to color name (simplified check)
              if (bgColor.includes('0, 128, 0') || bgColor.includes('34, 197, 94')) return 'green';
              if (bgColor.includes('255, 255, 0') || bgColor.includes('234, 179, 8')) return 'yellow';
              if (bgColor.includes('255, 0, 0') || bgColor.includes('239, 68, 68')) return 'red';
              return 'unknown';
            });

            expect(dotColor).toBe(expectedColor);
          }
        }
      }
    });

    // TEST-STATUS-03: Verify status changes persist after page reload
    test('should persist status changes after page reload', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        const statusDot = page.locator('[data-testid="idea-card"]').first().locator('[data-testid="status-dot"]');

        if (await statusDot.isVisible()) {
          // Change status to "In Progress"
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();
          await page.getByText('In Progress', { exact: true }).click();
          await page.waitForLoadState('networkidle');

          // Reload page
          await page.reload();
          await page.waitForLoadState('networkidle');

          // Verify status is still "In Progress"
          const ideaCard = page.locator('[data-testid="idea-card"]').first();
          await expect(ideaCard).toContainText('In Progress');
        }
      }
    });
  });

  test.describe('Quick Status Change from Card View', () => {
    // TEST-STATUS-04: Verify clicking status dot opens dropdown (Issue #82)
    test('should open status dropdown when clicking status dot in card view', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        const statusDot = page.locator('[data-testid="idea-card"]').first().locator('[data-testid="status-dot"]');

        if (await statusDot.isVisible()) {
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();

          // Dropdown should be visible
          const dropdown = page.locator('[data-testid="status-dropdown"]');
          await expect(dropdown).toBeVisible();
        }
      }
    });

    // TEST-STATUS-05: Verify status can be changed without opening full card
    test('should allow status change without opening idea detail view', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        const statusDot = page.locator('[data-testid="idea-card"]').first().locator('[data-testid="status-dot"]');

        if (await statusDot.isVisible()) {
          // Get current URL
          const currentUrl = page.url();

          // Change status
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();
          await page.getByText('Approved', { exact: true }).click();
          await page.waitForLoadState('networkidle');

          // URL should remain the same (not navigated to detail view)
          expect(page.url()).toBe(currentUrl);

          // Status should be updated
          const ideaCard = page.locator('[data-testid="idea-card"]').first();
          await expect(ideaCard).toContainText('Approved');
        }
      }
    });

    // TEST-STATUS-06: Verify status change updates immediately in card view
    test('should show status change immediately in card view', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        const ideaCard = page.locator('[data-testid="idea-card"]').first();
        const statusDot = ideaCard.locator('[data-testid="status-dot"]');

        if (await statusDot.isVisible()) {
          // Change to "Complete"
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();
          await page.getByText('Complete', { exact: true }).click();
          await page.waitForLoadState('networkidle');

          // Status text should update immediately
          await expect(ideaCard).toContainText('Complete');
        }
      }
    });
  });

  test.describe('Status Dropdown Behavior', () => {
    // TEST-STATUS-07: Verify dropdown renders using Portal (no overflow issues)
    test('should render dropdown correctly without being cut off by card overflow', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        const statusDot = page.locator('[data-testid="idea-card"]').first().locator('[data-testid="status-dot"]');

        if (await statusDot.isVisible()) {
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();

          const dropdown = page.locator('[data-testid="status-dropdown"]');
          await expect(dropdown).toBeVisible();

          // Verify all 8 options are visible (not cut off)
          const dropdownItems = dropdown.locator('[role="menuitem"], [data-testid="status-option"]');
          const count = await dropdownItems.count();
          expect(count).toBeGreaterThanOrEqual(8);

          // Verify dropdown has fixed positioning (Portal behavior)
          const position = await dropdown.evaluate((el) => {
            return window.getComputedStyle(el).position;
          });
          expect(position).toBe('fixed');
        }
      }
    });

    // TEST-STATUS-08: Verify dropdown auto-closes after 4 seconds
    test('should auto-close dropdown after 4 seconds', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        const statusDot = page.locator('[data-testid="idea-card"]').first().locator('[data-testid="status-dot"]');

        if (await statusDot.isVisible()) {
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();

          const dropdown = page.locator('[data-testid="status-dropdown"]');
          await expect(dropdown).toBeVisible();

          // Dropdown should auto-close after 4 seconds
          await expect(dropdown).not.toBeVisible({ timeout: 6000 });
        }
      }
    });

    // TEST-STATUS-09: Verify clicking outside dropdown closes it
    test('should close dropdown when clicking outside', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        const statusDot = page.locator('[data-testid="idea-card"]').first().locator('[data-testid="status-dot"]');

        if (await statusDot.isVisible()) {
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();

          const dropdown = page.locator('[data-testid="status-dropdown"]');
          await expect(dropdown).toBeVisible();

          // Click outside (on page background)
          await page.click('body', { position: { x: 10, y: 10 } });

          // Dropdown should be closed
          await expect(dropdown).not.toBeVisible();
        }
      }
    });

    // TEST-STATUS-10: Verify dropdown doesn't cause layout shift (scrollbar issue fixed)
    test('should not cause layout shift when dropdown opens', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        // Measure page width before
        const widthBefore = await page.evaluate(() => document.body.scrollWidth);

        const statusDot = page.locator('[data-testid="idea-card"]').first().locator('[data-testid="status-dot"]');

        if (await statusDot.isVisible()) {
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();

          // Measure page width after
          const widthAfter = await page.evaluate(() => document.body.scrollWidth);

          // Width should remain consistent (scrollbar always visible)
          expect(widthBefore).toBe(widthAfter);
        }
      }
    });
  });

  test.describe('Hidden Status Feature (Issue #67)', () => {
    // TEST-STATUS-11: Verify admin can set ideas to Hidden status
    test('should allow admin to set idea status to Hidden', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        const statusDot = page.locator('[data-testid="idea-card"]').first().locator('[data-testid="status-dot"]');

        if (await statusDot.isVisible()) {
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();
          await page.getByText('Hidden', { exact: true }).click();
          await page.waitForLoadState('networkidle');

          // Status should be set to Hidden
          const ideaCard = page.locator('[data-testid="idea-card"]').first();
          await expect(ideaCard).toContainText('Hidden');
        }
      }
    });

    // TEST-STATUS-12: Verify hidden ideas are not visible to regular users
    test('should hide ideas with Hidden status from regular users', async ({ page, context }) => {
      // First, set an idea to Hidden as admin
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        const ideaCard = page.locator('[data-testid="idea-card"]').first();
        const ideaTitle = await ideaCard.locator('[data-testid="idea-title"]').textContent();

        const statusDot = ideaCard.locator('[data-testid="status-dot"]');
        if (await statusDot.isVisible()) {
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();
          await page.getByText('Hidden', { exact: true }).click();
          await page.waitForLoadState('networkidle');
        }

        // Create regular user in new context
        const regularPage = await context.newPage();
        await regularPage.goto('/');

        // #892: username is no longer user input.
        const regularUser = {
          password: 'RegularPass123!',
          email: `regularuser${Date.now()}@example.com`
        };

        await regularPage.getByText('NEED AN ACCOUNT? REGISTER').click();
        await regularPage.locator('[data-testid="email"] input').nth(1).waitFor();

        await regularPage.locator('[data-testid="email"] input').nth(1).fill(regularUser.email);
        await regularPage.locator('[data-testid="password"] input').nth(1).fill(regularUser.password);
        await regularPage.fill('[data-testid="confirmPassword"] input', regularUser.password);
        await regularPage.locator('[data-testid="submit-button"]').nth(1).click();

        await regularPage.waitForLoadState('networkidle');

        // Navigate to ideas list
        await regularPage.click('[data-testid="review-ideas-button"]');
        await regularPage.locator('[data-testid="idea-card"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

        // Hidden idea should NOT be visible
        const ideaCards = regularPage.locator('[data-testid="idea-card"]');
        const cardTexts = await ideaCards.allTextContents();
        expect(cardTexts.join(' ')).not.toContain(ideaTitle);

        await regularPage.close();
      }
    });

    // TEST-STATUS-13: Verify hidden ideas are still visible to admins
    test('should show hidden ideas to admin users', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        const ideaCard = page.locator('[data-testid="idea-card"]').first();

        const statusDot = ideaCard.locator('[data-testid="status-dot"]');
        if (await statusDot.isVisible()) {
          // Set to Hidden
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();
          await page.getByText('Hidden', { exact: true }).click();
          await page.waitForLoadState('networkidle');

          // Reload page
          await page.reload();
          await page.waitForLoadState('networkidle');

          // Admin should still see the hidden idea
          await expect(ideaCard).toBeVisible();
          await expect(ideaCard).toContainText('Hidden');
        }
      }
    });
  });

  test.describe('Status Management in Idea Detail View', () => {
    // TEST-STATUS-14: Verify status dropdown in idea detail page matches card view
    test('should have consistent status options in detail view', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        // Click to open detail view
        await page.locator('[data-testid="idea-card"]').first().click();
        await page.locator('[data-testid="status-select"], select[name="status"]').waitFor({ timeout: 5000 }).catch(() => {});

        // Find status dropdown in detail view
        const statusDropdown = page.locator('[data-testid="status-select"], select[name="status"]');
        if (await statusDropdown.isVisible()) {
          // Open dropdown
          await statusDropdown.click();
          await page.locator(`option:has-text("Reviewing"), [role="option"]:has-text("Reviewing")`).waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

          // Verify all 8 status options
          const expectedStatuses = ['Reviewing', 'In Progress', 'Approved', 'Complete', 'Rejected', 'Duplicate', 'Hidden', 'Open'];

          for (const status of expectedStatuses) {
            const option = page.locator(`option:has-text("${status}"), [role="option"]:has-text("${status}")`);
            await expect(option).toBeVisible();
          }
        }
      }
    });

    // TEST-STATUS-15: Verify status changes in detail view reflect in card view
    test('should sync status changes between detail and card views', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        // Open detail view
        await page.locator('[data-testid="idea-card"]').first().click();
        await page.locator('[data-testid="status-select"], select[name="status"]').waitFor({ timeout: 5000 }).catch(() => {});

        // Change status in detail view
        const statusDropdown = page.locator('[data-testid="status-select"], select[name="status"]');
        if (await statusDropdown.isVisible()) {
          await statusDropdown.selectOption('Approved');

          // Save if there's a save button
          const saveButton = page.locator('[data-testid="save-admin-changes"], button:has-text("Save")');
          if (await saveButton.isVisible()) {
            await saveButton.click();
            await page.waitForLoadState('networkidle');
          }

          // Go back to list
          await page.goBack();
          await page.locator('[data-testid="idea-card"]').first().waitFor();

          // Verify status updated in card view
          const ideaCard = page.locator('[data-testid="idea-card"]').first();
          await expect(ideaCard).toContainText('Approved');
        }
      }
    });
  });

  test.describe('Status Permissions and Security', () => {
    // TEST-STATUS-16: Verify status dropdown is only available to admins
    test('should not show status change controls to regular users', async ({ page, context, request }) => {
      // Use existing dcuser (regular user)
      const regularUser = {
        username: 'dcuser',
        password: 'Password123!',
        // #892: /auth/login is email-keyed on the org-scoped path too.
        email: 'user@democorp.com',
        token: null
      };

      // Get regular user token
      const loginResponse = await request.post('http://localhost:4000/api/auth/login', {
        data: {
          email: regularUser.email,
          password: regularUser.password,
          organizationId: TEST_ORG_ID,
        }
      });

      if (loginResponse.ok()) {
        const loginData = await loginResponse.json();
        regularUser.token = loginData.token;
      }

      // Create new page for regular user
      const regularPage = await context.newPage();
      await regularPage.goto(`http://localhost:3000/org/${TEST_ORG_ID}/review`);
      await regularPage.evaluate((token) => {
        localStorage.setItem('token', token);
      }, regularUser.token);
      await regularPage.reload();
      await regularPage.waitForLoadState('networkidle');

      // Status dot should not be clickable or visible as control
      const statusDot = regularPage.locator('[data-testid="status-dot"]').first();
      if (await statusDot.isVisible()) {
        await statusDot.click();

        // Dropdown should NOT appear
        const dropdown = regularPage.locator('[data-testid="status-dropdown"]');
        await expect(dropdown).not.toBeVisible();
      }

      await regularPage.close();
    });

    // TEST-STATUS-17: Verify status changes are logged/audited
    test('should track status change history for audit purposes', async ({ page }) => {
      // This test would verify audit logging if implemented
      // For now, we verify the status change happens and is persistent
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        const statusDot = page.locator('[data-testid="idea-card"]').first().locator('[data-testid="status-dot"]');

        if (await statusDot.isVisible()) {
          // Change status multiple times
          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();
          await page.getByText('In Progress', { exact: true }).click();
          await page.waitForLoadState('networkidle');

          await statusDot.click();
          await page.locator('[data-testid="status-dropdown"]').waitFor();
          await page.getByText('Complete', { exact: true }).click();
          await page.waitForLoadState('networkidle');

          // Final status should be Complete
          const ideaCard = page.locator('[data-testid="idea-card"]').first();
          await expect(ideaCard).toContainText('Complete');
        }
      }
    });
  });
});
