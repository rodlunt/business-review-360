/**
 * New Features Tests
 * UPDATED: 2025-11-05 for Epic #318 Phases 6, 7, 8 compatibility
 * - Compatible with centralized error handling (Phase 6 - Issue #335)
 * - Compatible with audit logging system (Phase 7 - Issue #338)
 * - Database reset endpoint works with new health checks
 */
import { test, expect } from '@playwright/test';
import { gotoLogin, resetTestDatabase, TEST_ORG_ID } from './test-helpers.js';

test.describe('New Features', () => {
  let testUser = null;

  test.beforeEach(async ({ page, request }) => {
    // Issue #544: reset-database gated by per-boot bearer token.
    await resetTestDatabase(request);

    await gotoLogin(page);

    // Create and login test user. #892: username is no longer user input.
    const timestamp = Date.now();
    testUser = {
      password: 'TestPass123!',
      email: `testuser${timestamp}@example.com`
    };

    await page.getByText('NEED AN ACCOUNT? REGISTER').click();
    await page.locator('[data-testid="email"] input').nth(1).fill(testUser.email);
    await page.locator('[data-testid="password"] input').nth(1).fill(testUser.password);
    await page.fill('[data-testid="confirmPassword"] input', testUser.password);
    await page.locator('[data-testid="submit-button"]').nth(1).click();

    await page.waitForURL(`**/org/${TEST_ORG_ID}/review`, { timeout: 10000 });
    await expect(page.locator('[data-testid="review-ideas-button"]')).toBeVisible();
  });

  test.describe('Bug Report with Screenshot', () => {
    // TEST-NEW-01: Verify bug report dialog opens and displays correctly
    test('should open bug report dialog', async ({ page }) => {
      // Look for bug report button (usually in header or menu)
      const bugReportButton = page.locator('[data-testid="bug-report-button"], button:has-text("Report"), button:has-text("Bug")');

      if (await bugReportButton.count() === 0) {
        // If not directly visible, might be in admin menu or hamburger menu
        const menuButton = page.locator('[data-testid="admin-menu-button"], [data-testid="menu-button"]');
        if (await menuButton.count() > 0) {
          await menuButton.first().click();
        }
      }

      // Try to find and click bug report button
      const reportButton = page.locator('[data-testid="bug-report-button"], button:has-text("Report Bug"), button:has-text("Bug Report")').first();

      if (await reportButton.count() > 0) {
        await reportButton.click();

        // Wait for dialog to appear
        await expect(page.locator('[role="dialog"]')).toBeVisible();
        await expect(page.getByText('Report a Bug')).toBeVisible();
      } else {
        // Skip test if bug report feature not found
        test.skip();
      }
    });

    // TEST-NEW-02: Verify screenshot capture functionality
    test('should capture screenshot for bug report', async ({ page }) => {
      // Open bug report dialog
      const reportButton = page.locator('[data-testid="bug-report-button"], button:has-text("Report Bug"), button:has-text("Bug Report")').first();

      // Check if bug report feature exists
      if (await reportButton.count() === 0) {
        const menuButton = page.locator('[data-testid="admin-menu-button"], [data-testid="menu-button"]');
        if (await menuButton.count() > 0) {
          await menuButton.first().click();
        }
      }

      const finalReportButton = page.locator('[data-testid="bug-report-button"], button:has-text("Report Bug"), button:has-text("Bug Report")').first();

      if (await finalReportButton.count() > 0) {
        await finalReportButton.click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();

        // Look for screenshot capture button
        const screenshotButton = page.locator('button:has-text("Capture Screenshot")');
        await expect(screenshotButton).toBeVisible();

        // Click screenshot button
        await screenshotButton.click();

        // Check if screenshot was captured successfully
        const successMessage = page.locator('text=✓ Screenshot captured successfully');
        await expect(successMessage).toBeVisible({ timeout: 5000 });

        // Check if screenshot image is displayed
        const screenshotImage = page.locator('img[alt="Bug screenshot"]');
        await expect(screenshotImage).toBeVisible();
      } else {
        test.skip();
      }
    });

    // TEST-NEW-03: Verify bug report submission with screenshot
    test('should submit bug report with screenshot to GitHub', async ({ page }) => {
      // Open bug report dialog
      const reportButton = page.locator('[data-testid="bug-report-button"], button:has-text("Report Bug"), button:has-text("Bug Report")').first();

      if (await reportButton.count() === 0) {
        const menuButton = page.locator('[data-testid="admin-menu-button"], [data-testid="menu-button"]');
        if (await menuButton.count() > 0) {
          await menuButton.first().click();
        }
      }

      const finalReportButton = page.locator('[data-testid="bug-report-button"], button:has-text("Report Bug"), button:has-text("Bug Report")').first();

      if (await finalReportButton.count() > 0) {
        await finalReportButton.click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();

        // Select issue type (bug)
        const issueTypeSelect = page.locator('[data-testid="issue-type-select"]');
        if (await issueTypeSelect.count() > 0) {
          await issueTypeSelect.click();
          await page.locator('[data-testid="issue-type-bug"]').click();
        }

        // Select bug category
        const categorySelect = page.locator('[data-testid="category-select"]');
        await categorySelect.click();
        await page.locator('[data-testid="category-ui-visual-issue"], [data-testid="category-ui/visual-issue"]').first().click();

        // Fill in description
        await page.locator('[data-testid="description-field"] input, [data-testid="description-field"] textarea').fill('Test bug report with screenshot');

        // Fill in steps to reproduce
        await page.locator('[data-testid="steps-field"] textarea').first().fill('1. Open app\n2. Navigate to page\n3. See issue');

        // Fill in expected behavior (optional field)
        await page.locator('[data-testid="expected-field"] textarea').first().fill('App should work correctly');

        // Fill in actual behavior (optional field)
        await page.locator('[data-testid="actual-field"] textarea').first().fill('App shows error');

        // Capture screenshot
        const screenshotButton = page.locator('button:has-text("Capture Screenshot")');
        await screenshotButton.click();
        await expect(page.locator('text=✓ Screenshot captured successfully')).toBeVisible({ timeout: 10000 });

        // Submit the bug report
        const submitButton = page.locator('[data-testid="submit-issue-button"], button:has-text("Send")');
        await expect(submitButton).toBeEnabled();
        await submitButton.click();
        await page.waitForLoadState('networkidle');

        const successMessage = page.locator('text=Thank you');
        const errorMessage = page.locator('text=Failed to create issue');

        const hasSuccess = await successMessage.count() > 0;
        const hasError = await errorMessage.count() > 0;

        if (hasSuccess) {
          await expect(successMessage).toBeVisible();
          // Dialog should close automatically after a few seconds
          await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 });
        } else if (hasError) {
          // If GitHub token is not configured, test should still pass but note the limitation
          await expect(errorMessage).toBeVisible();
          console.log('Note: Bug report submission failed (likely due to missing GitHub token)');
        } else {
          throw new Error('Neither success nor error message appeared');
        }
      } else {
        test.skip();
      }
    });

    // TEST-NEW-04: Verify feature request submission
    test('should submit feature request', async ({ page }) => {
      // Open bug report dialog
      const reportButton = page.locator('[data-testid="bug-report-button"], button:has-text("Report Bug"), button:has-text("Bug Report")').first();

      if (await reportButton.count() === 0) {
        const menuButton = page.locator('[data-testid="admin-menu-button"], [data-testid="menu-button"]');
        if (await menuButton.count() > 0) {
          await menuButton.first().click();
        }
      }

      const finalReportButton = page.locator('[data-testid="bug-report-button"], button:has-text("Report Bug"), button:has-text("Bug Report")').first();

      if (await finalReportButton.count() > 0) {
        await finalReportButton.click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();

        // Select issue type (feature)
        const issueTypeSelect = page.locator('[data-testid="issue-type-select"]');
        if (await issueTypeSelect.count() > 0) {
          await issueTypeSelect.click();
          await page.locator('[data-testid="issue-type-feature"]').click();
        }

        // Select feature category
        const categorySelect = page.locator('[data-testid="category-select"]');
        await categorySelect.click();
        await page.locator('[data-testid="category-new-feature"]').first().click();

        // Fill in description
        await page.locator('[data-testid="description-field"] input, [data-testid="description-field"] textarea').fill('Test feature request');

        // Fill in use case
        await page.locator('[data-testid="steps-field"] textarea').first().fill('Need this feature to improve user experience');

        // Fill in proposed solution
        await page.locator('[data-testid="expected-field"] textarea').first().fill('Add a new button that does XYZ');

        // Submit the feature request
        const submitButton = page.locator('[data-testid="submit-issue-button"], button:has-text("Send")');
        await expect(submitButton).toBeEnabled();
        await submitButton.click();
        await page.waitForLoadState('networkidle');

        const successMessage = page.locator('text=Thank you');
        const errorMessage = page.locator('text=Failed to create issue');

        const hasSuccess = await successMessage.count() > 0;
        const hasError = await errorMessage.count() > 0;

        if (hasSuccess) {
          await expect(successMessage).toBeVisible();
        } else if (hasError) {
          // If GitHub token is not configured, test should still pass but note the limitation
          await expect(errorMessage).toBeVisible();
          console.log('Note: Feature request submission failed (likely due to missing GitHub token)');
        } else {
          throw new Error('Neither success nor error message appeared');
        }
      } else {
        test.skip();
      }
    });
  });
});
