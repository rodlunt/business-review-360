/**
 * Basic Smoke Tests
 * UPDATED: 2025-11-05 for Epic #318 Phases 6, 7, 8 compatibility
 * - TEST-SMOKE-04 validates new health endpoint (Phase 6 - Issue #336)
 * - Compatible with centralized error handling (Phase 6 - Issue #335)
 * - Registration flow works with audit logging (Phase 7 - Issue #338)
 */
import { test, expect } from '@playwright/test';
import { gotoLogin, gotoMarketingHome, TEST_ORG_ID } from './test-helpers.js';

test.describe('Basic Smoke Tests', () => {
  // TEST-SMOKE-00: Verify marketing website loads
  test('should load marketing website homepage', async ({ page }) => {
    await gotoMarketingHome(page);

    // Check if page loads
    await expect(page).toHaveTitle(/Business Review 360|BR 360/);

    // Should see hero section
    await expect(page.locator('h1')).toBeVisible();

    // Should see navigation
    await expect(page.locator('nav, header').first()).toBeVisible();
  });

  // TEST-SMOKE-01: Verify application login page loads with correct title and UI elements
  test('should load the application login page', async ({ page }) => {
    await gotoLogin(page);
    await page.waitForLoadState('networkidle');

    // Check if page loads - title includes org name or "Business Review 360"
    await expect(page).toHaveTitle(/Login - /);

    // Should see authentication interface
    const authElements = page.locator('h1, h2, h3, [data-testid="submit-button"]');
    await expect(authElements.first()).toBeVisible();

    // Should see register option
    await expect(page.getByText('NEED AN ACCOUNT? REGISTER')).toBeVisible();
  });

  // TEST-SMOKE-02: Verify toggling between login and register forms works correctly
  test('should be able to switch between login and register', async ({ page }) => {
    await gotoLogin(page);
    await page.waitForLoadState('networkidle');

    // Should see auth interface
    const submitButtons = page.locator('[data-testid="submit-button"], button:has-text("LOGIN"), button:has-text("REGISTER")');
    await expect(submitButtons.first()).toBeVisible();

    // Test register toggle
    const registerButton = page.getByText('NEED AN ACCOUNT? REGISTER');
    if (await registerButton.isVisible()) {
      await registerButton.click();

      // Should see register form - wait for submit button to have REGISTER text
      await expect(page.locator('[data-testid="submit-button"]:has-text("REGISTER")')).toBeVisible();

      // Test login toggle
      const loginButton = page.getByText('ALREADY HAVE AN ACCOUNT? LOGIN');
      if (await loginButton.isVisible()) {
        await loginButton.click();
      }
    }

    // Should have functional auth interface
    await expect(submitButtons.first()).toBeVisible();
  });

  // TEST-SMOKE-03: Verify user registration flow and access to authenticated areas
  test('should be able to register a user and access main app', async ({ page }) => {
    await gotoLogin(page);
    await page.waitForLoadState('networkidle');

    const timestamp = Date.now();
    // #892: email is the sole registration credential; username is no
    // longer user input (auto-generated server-side).
    const email = `testuser${timestamp}@example.com`;
    const password = 'TestPass123!';

    // Switch to register
    const registerButton = page.getByText('NEED AN ACCOUNT? REGISTER');
    await registerButton.click();
    await page.locator('[data-testid="email"] input').last().waitFor();

    // Fill form using robust selectors
    const emailInput = page.locator('[data-testid="email"] input').last();
    const passwordInput = page.locator('[data-testid="password"] input').last();
    const confirmPasswordInput = page.locator('[data-testid="confirmPassword"] input').last();

    await emailInput.fill(email);
    await passwordInput.fill(password);
    await confirmPasswordInput.fill(password);

    // Submit registration
    const submitButton = page.locator('[data-testid="submit-button"], button:has-text("REGISTER")').last();
    await submitButton.click();

    // Wait for navigation to review page
    await page.waitForURL(`**/org/${TEST_ORG_ID}/review`, { timeout: 10000 });

    // Should be on main page with navigation buttons
    const appButtons = page.locator('[data-testid="review-ideas-button"], [data-testid="submit-idea-button"], [data-testid="logout-button"], button:has-text("Review Ideas"), button:has-text("Submit"), button:has-text("Logout")');
    await expect(appButtons.first()).toBeVisible();
  });

  // TEST-SMOKE-04: Verify backend health endpoint returns successful response
  test('should display backend health status', async ({ page, request }) => {
    // Test backend health endpoint (mounted at /health, not /api/health)
    const response = await request.get('/health');
    expect(response.status()).toBe(200);
  });
});