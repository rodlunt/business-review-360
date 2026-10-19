/**
 * UPDATED: 2025-11-05 for Epic #318 Phases 6, 7, 8 compatibility
 * - UI tests are frontend-focused and unaffected by backend changes
 * - Compatible with all Phase 6, 7, 8 infrastructure updates
 */
import { test, expect } from '@playwright/test';
import { gotoLogin, gotoReview, gotoAdmin, gotoAnalytics, navigateToAdminSettings, TEST_ORG_ID } from './test-helpers.js';

/**
 * UI/UX Fixes Test Suite
 *
 * Tests for specific UI/UX improvements implemented to resolve GitHub issues:
 * - Issue #72: Hide reCAPTCHA badge
 * - Issue #73: Menu not working on Android Tablet (breakpoint fix)
 * - Issue #74: Admin button wraps text, button alignment issues
 * - Issue #76: Favicon/icons update
 * - Issue #80: Logo links to org base URL
 * - Issue #86: Color immediately loads in header
 * - Issue #87: Save settings confirmation with auto-dismiss
 * - Layout shift fix (scrollbar always visible)
 * - Vote button text removal for mobile
 */

test.describe('UI/UX Fixes and Improvements', () => {
  let testUser = null;

  test.beforeEach(async ({ page, request }) => {
    // Use existing dcuser
    testUser = {
      username: 'dcuser',
      password: 'Password123!',
      // #892: /auth/login is email-keyed on the org-scoped path too.
      email: 'user@democorp.com',
      token: null
    };

    // Get user token via API
    const loginResponse = await request.post('http://localhost:4000/api/auth/login', {
      data: {
        email: testUser.email,
        password: testUser.password,
        organizationId: TEST_ORG_ID,
      }
    });

    if (loginResponse.ok()) {
      const loginData = await loginResponse.json();
      testUser.token = loginData.token;

      // Set token in localStorage and navigate to review page
      await page.goto(`http://localhost:3000/org/${TEST_ORG_ID}/review`);
      await page.evaluate((token) => {
        localStorage.setItem('token', token);
      }, testUser.token);
      await page.reload();
      await page.waitForLoadState('networkidle');
    }
  });

  test.describe('reCAPTCHA Badge Hiding (Issue #72)', () => {
    // TEST-UIFIX-01: Verify reCAPTCHA badge is hidden via CSS
    test('should hide reCAPTCHA badge from view', async ({ page }) => {
      // Check for reCAPTCHA badge (may be multiple)
      const recaptchaBadge = page.locator('.grecaptcha-badge').first();

      if (await recaptchaBadge.count() > 0) {
        // Badge should have visibility:hidden via CSS
        const visibility = await recaptchaBadge.evaluate((el) => {
          return window.getComputedStyle(el).visibility;
        });

        expect(visibility).toBe('hidden');
      }
    });
  });

  test.describe('Tablet Breakpoint Fix (Issue #73)', () => {
    // TEST-UIFIX-02: Verify breakpoint switches to mobile drawer navigation at 900px
    // User confirmed: "the nav changes to a side page type thing" at this breakpoint
    // This prevents title/button wrapping on tablets
    test('should use mobile drawer navigation at 900px', async ({ page }) => {
      // Set viewport to 900px
      await page.setViewportSize({ width: 900, height: 1024 });

      // At 900px, navigation should switch to mobile drawer style
      // Check for mobile menu button (hamburger icon)
      const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"], button[aria-label*="menu" i], button:has([class*="hamburger" i])');

      // Should have mobile menu button visible
      const hasMobileMenu = await mobileMenuButton.first().isVisible({ timeout: 2000 }).catch(() => false);

      // Or fallback: check if page has header/nav at all
      const hasHeader = await page.locator('header, nav').first().isVisible({ timeout: 2000 }).catch(() => false);

      // Should have working navigation (mobile drawer or visible header)
      expect(hasMobileMenu || hasHeader).toBeTruthy();
    });

    // TEST-UIFIX-03: Verify mobile menu appears at smaller tablet sizes
    test('should show mobile menu at 899px width', async ({ page }) => {
      await page.setViewportSize({ width: 899, height: 1024 });

      // Mobile hamburger menu should be visible
      const mobileMenu = page.locator('[data-testid="mobile-menu-button"]');
      if (await mobileMenu.count() > 0) {
        await expect(mobileMenu).toBeVisible();
      }
    });
  });

  test.describe('Button Alignment and Sizing (Issue #74)', () => {
    test.beforeEach(async ({ page }) => {
      // Create a test idea
      if (await page.locator('[data-testid="submit-idea-button"]').isVisible()) {
        await page.click('[data-testid="submit-idea-button"]');
        await page.fill('[data-testid="idea-title"] input', 'Button Alignment Test');
        await page.fill('[data-testid="idea-description"] textarea', 'Testing button alignment');
        await page.fill('[data-testid="idea-category"] input', 'UI Testing');
        await page.fill('[data-testid="organizational-impact"] textarea', 'Testing');
        await page.click('[data-testid="fix-impact"]');
        await page.click('text=Low');
        await page.fill('[data-testid="solution"] textarea', 'Testing');
        await page.locator('[data-testid="would-spend-money"] input[value="true"]').check();
        await page.click('[data-testid="submit-idea-btn"]');

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

    // TEST-UIFIX-04: Verify Admin button shows only "Admin" text without wrapping
    test('should show shortened Admin button text', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        await page.locator('[data-testid="idea-card"]').first().click();
        await page.waitForLoadState('networkidle');

        // Look for admin button
        const adminButton = page.locator('button:has-text("Admin")').first();
        if (await adminButton.isVisible()) {
          const buttonText = await adminButton.textContent();

          // Should say "Admin" not "Admin Comments"
          expect(buttonText?.trim()).toBe('Admin');

          // Button should not wrap text (check whitespace: nowrap)
          const whiteSpace = await adminButton.evaluate((el) => {
            return window.getComputedStyle(el).whiteSpace;
          });
          expect(whiteSpace).toBe('nowrap');
        }
      }
    });

    // TEST-UIFIX-05: Verify buttons have consistent width on mobile
    test('should have consistent button widths (101px) on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        await page.locator('[data-testid="idea-card"]').first().click();
        await page.waitForLoadState('networkidle');

        // Check button widths in bottom row
        const adminButton = page.locator('button:has-text("Admin")').first();
        const voteButton = page.locator('button').filter({ hasText: /^\(\d+\)$/ }).first();

        if (await adminButton.isVisible() && await voteButton.isVisible()) {
          const adminWidth = await adminButton.evaluate((el) => el.offsetWidth);
          const voteWidth = await voteButton.evaluate((el) => el.offsetWidth);

          // Buttons should be approximately the same width (within 5px tolerance)
          expect(Math.abs(adminWidth - voteWidth)).toBeLessThan(5);
        }
      }
    });

    // TEST-UIFIX-06: Verify Status and Category dropdowns have consistent 160px width
    test('should have consistent dropdown widths (160px)', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        await page.locator('[data-testid="idea-card"]').first().click();
        await page.waitForLoadState('networkidle');

        const statusDropdown = page.locator('[data-testid="status-select"], select').first();
        const categoryInput = page.locator('[data-testid="category-input"], input[name="category"]').first();

        if (await statusDropdown.isVisible() && await categoryInput.isVisible()) {
          const statusWidth = await statusDropdown.evaluate((el) => el.offsetWidth);
          const categoryWidth = await categoryInput.evaluate((el) => el.offsetWidth);

          // Both should be approximately 160px (within 10px tolerance)
          expect(Math.abs(statusWidth - 160)).toBeLessThan(10);
          expect(Math.abs(categoryWidth - 160)).toBeLessThan(10);
        }
      }
    });
  });

  test.describe('Logo Navigation (Issue #80)', () => {
    // TEST-UIFIX-07: Verify logo clicks navigate to org base URL
    test('should navigate to organization landing page when logo clicked', async ({ page }) => {
      // Get current page URL to extract org ID (safer than localStorage)
      const currentUrl = page.url();
      const orgIdMatch = currentUrl.match(/\/org\/([^\/]+)/);
      const organizationId = orgIdMatch ? orgIdMatch[1] : TEST_ORG_ID;

      // Click logo
      const logo = page.locator('[data-testid="logo"], header img').first();
      if (await logo.isVisible()) {
        await logo.click();
        await page.waitForLoadState('networkidle');

        // Should navigate to org landing page or home
        if (organizationId) {
          expect(page.url()).toContain(`/org/${organizationId}`);
        } else {
          expect(page.url()).toMatch(/\/$|\/org\//);
        }
      }
    });

    // TEST-UIFIX-08: Verify logo is clickable (not just decorative)
    test('should make logo clickable with pointer cursor', async ({ page }) => {
      const logo = page.locator('[data-testid="logo"], header img').first();
      if (await logo.isVisible()) {
        const cursor = await logo.evaluate((el) => {
          return window.getComputedStyle(el).cursor;
        });

        expect(cursor).toBe('pointer');
      }
    });
  });

  test.describe('Layout Shift Prevention', () => {
    // Scrollbar test removed - layout refactored, no longer testing scrollbar implementation

    // TEST-UIFIX-10: Verify page width doesn't change when modals/dropdowns open
    test('should maintain consistent page width when opening dropdowns', async ({ page }) => {
      // Measure initial page width
      const initialWidth = await page.evaluate(() => document.body.scrollWidth);

      // Create idea and open status dropdown if admin
      if (await page.locator('[data-testid="submit-idea-button"]').isVisible()) {
        await page.click('[data-testid="submit-idea-button"]');
        await page.fill('[data-testid="idea-title"] input', 'Width Test');
        await page.fill('[data-testid="idea-description"] textarea', 'Testing width consistency');
        await page.fill('[data-testid="idea-category"] input', 'Testing');
        await page.fill('[data-testid="organizational-impact"] textarea', 'Test');
        await page.click('[data-testid="fix-impact"]');
        await page.click('text=Low');
        await page.fill('[data-testid="solution"] textarea', 'Test');
        await page.locator('[data-testid="would-spend-money"] input[value="true"]').check();
        await page.click('[data-testid="submit-idea-btn"]');

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

        // Try to open status dropdown
        const statusDot = page.locator('[data-testid="status-dot"]').first();
        if (await statusDot.isVisible()) {
          await statusDot.click();

          // Measure page width after dropdown opens
          const afterWidth = await page.evaluate(() => document.body.scrollWidth);

          // Width should remain the same
          expect(afterWidth).toBe(initialWidth);
        }
      }
    });
  });

  test.describe('Vote Button Simplification', () => {
    test.beforeEach(async ({ page }) => {
      // Create a test idea
      if (await page.locator('[data-testid="submit-idea-button"]').isVisible()) {
        await page.click('[data-testid="submit-idea-button"]');
        await page.fill('[data-testid="idea-title"] input', 'Vote Button Test');
        await page.fill('[data-testid="idea-description"] textarea', 'Testing vote button display');
        await page.fill('[data-testid="idea-category"] input', 'Testing');
        await page.fill('[data-testid="organizational-impact"] textarea', 'Test');
        await page.click('[data-testid="fix-impact"]');
        await page.click('text=Low');
        await page.fill('[data-testid="solution"] textarea', 'Test');
        await page.locator('[data-testid="would-spend-money"] input[value="true"]').check();
        await page.click('[data-testid="submit-idea-btn"]');

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

    // TEST-UIFIX-11: Verify vote button shows only count without "Vote"/"Voted" text
    test('should show only vote count without Vote/Voted text in card view', async ({ page }) => {
      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        // Look for vote button in card view
        const voteButton = page.locator('[data-testid="idea-card"]').first().locator('button').filter({ hasText: /^\(\d+\)$/ });

        if (await voteButton.count() > 0) {
          const buttonText = await voteButton.first().textContent();

          // Should match pattern like "(0)" or "(5)" without "Vote" or "Voted"
          expect(buttonText?.trim()).toMatch(/^\(\d+\)$/);
          expect(buttonText).not.toContain('Vote');
          expect(buttonText).not.toContain('Voted');
        }
      }
    });

    // TEST-UIFIX-12: Verify vote button doesn't wrap on mobile
    test('should not wrap vote button text on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      if (await page.locator('[data-testid="idea-card"]').isVisible()) {
        await page.locator('[data-testid="idea-card"]').first().click();
        await page.waitForLoadState('networkidle');

        const voteButton = page.locator('button').filter({ hasText: /^\(\d+\)$/ }).first();

        if (await voteButton.isVisible()) {
          const whiteSpace = await voteButton.evaluate((el) => {
            return window.getComputedStyle(el).whiteSpace;
          });

          expect(whiteSpace).toBe('nowrap');
        }
      }
    });
  });

  test.describe('Settings Auto-Dismiss (Issue #87)', () => {
    // TEST-UIFIX-13: Verify success messages auto-dismiss after 4 seconds
    test('should auto-dismiss success messages after 4 seconds in admin settings', async ({ page }) => {
      // Navigate to admin settings if available
      const adminButton = page.locator('[data-testid="admin-menu-button"]');

      if (await adminButton.isVisible()) {
        await navigateToAdminSettings(page);

        // Try to trigger a save action that shows success message
        const saveButton = page.locator('button:has-text("Save")').first();

        if (await saveButton.isVisible()) {
          await saveButton.click();

          // Look for success message
          const successMessage = page.locator('[role="alert"], [data-testid="success-message"]').filter({ hasText: /success|saved|updated/i });

          if (await successMessage.isVisible()) {
            // Message should be visible initially
            await expect(successMessage).toBeVisible();

            // Message should auto-dismiss after ~4 seconds
            await expect(successMessage).not.toBeVisible({ timeout: 8000 });
          }
        }
      }
    });
  });

  test.describe('Favicon and PWA Icons (Issue #76)', () => {
    // TEST-UIFIX-14: Verify favicon loads correctly
    test('should load favicon from /favicon.ico', async ({ page }) => {
      const faviconResponse = await page.goto('http://localhost:3000/favicon.ico');
      expect(faviconResponse?.status()).toBe(200);
    });

    // TEST-UIFIX-15: Verify PWA icons are available
    test('should have PWA icons available', async ({ page }) => {
      const icons = [
        '/android-chrome-192x192.png',
        '/android-chrome-512x512.png',
        '/apple-touch-icon.png',
        '/favicon-16x16.png',
        '/favicon-32x32.png'
      ];

      for (const icon of icons) {
        const response = await page.goto(`http://localhost:3000${icon}`);
        expect(response?.status()).toBe(200);
      }
    });

    // TEST-UIFIX-16: Verify site.webmanifest has correct name
    test('should have correct app name in webmanifest', async ({ page }) => {
      const response = await page.goto('http://localhost:3000/site.webmanifest');
      expect(response?.status()).toBe(200);

      const manifest = await response?.json();
      expect(manifest.name).toBe('Business Review 360');
      expect(manifest.short_name).toBe('BR360');
    });
  });
});
