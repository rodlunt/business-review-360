/**
 * Authentication System Tests
 * UPDATED: 2025-11-05 for Epic #318 Phases 6, 7, 8 compatibility
 * - Compatible with centralized error handling (Phase 6 - Issue #335)
 * - Registration and login work with audit logging (Phase 7 - Issue #338)
 * - API requests receive proper error responses with request IDs
 * - Database reset endpoint compatible with new infrastructure
 */
import { test, expect } from '@playwright/test';
import { gotoLogin, gotoReview, gotoAdmin, gotoAnalytics, resetTestDatabase, TEST_ORG_ID } from './test-helpers.js';

test.describe('Authentication System', () => {
  test.beforeEach(async ({ page, request }) => {
    // Issue #544: reset-database now requires a per-boot bearer token; the
    // dead createAdmin branch (hardcoded TestAdmin123!) has been removed.
    await resetTestDatabase(request);
    await gotoLogin(page);
  });

  test.describe('User Registration', () => {
    test('should register a new user with valid credentials', async ({ page }) => {
      // TEST-AUTH-01: Validates new user registration with email and password.
      // #892: username is no longer user input -- email is the sole
      // credential and the backend auto-generates the display username.
      const timestamp = Date.now();
      const email = `testuser${timestamp}@example.com`;
      const password = 'TestPass123!';

      // Click register mode switch
      await page.getByText('NEED AN ACCOUNT? REGISTER').click();

      // Fill registration form
      await page.locator('[data-testid="email"] input').nth(1).fill(email);
      await page.locator('[data-testid="password"] input').nth(1).fill(password);
      await page.fill('[data-testid="confirmPassword"] input', password);

      // Submit form
      await page.locator('[data-testid="submit-button"]').nth(1).click();

      // Should redirect to main app and show user interface
      await page.waitForURL(`**/org/${TEST_ORG_ID}/review`, { timeout: 10000 });
      await expect(page.locator('[data-testid="review-ideas-button"]')).toBeVisible();
    });

    test('should show validation errors for invalid registration', async ({ page }) => {
      // TEST-AUTH-03: Validates client-side validation for mismatched passwords
      await page.getByText('NEED AN ACCOUNT? REGISTER').click();

      // Try to register with mismatched passwords
      await page.locator('[data-testid="password"] input').nth(1).fill('TestPass123!');
      await page.fill('[data-testid="confirmPassword"] input', 'Different123!');

      // Focus on confirm password field to trigger validation
      await page.locator('[data-testid="confirmPassword"] input').focus();

      // Wait for inline validation message to appear (while field is focused)
      await expect(page.getByText('Passwords do not match.')).toBeVisible();
    });

    test('should automatically login and navigate to review page after successful registration', async ({ page }) => {
      // TEST-AUTH-04A: Validates auto-login after registration and navigation to main app
      // This is a critical user flow - registration should log user in immediately
      const timestamp = Date.now();
      const email = `autoLoginUser${timestamp}@example.com`;
      const password = 'TestPass123!';

      // The test starts at login page via beforeEach's gotoLogin()
      // Switch to register mode
      await page.getByText('NEED AN ACCOUNT? REGISTER').click();

      // Fill registration form
      await page.locator('[data-testid="email"] input').nth(1).fill(email);
      await page.locator('[data-testid="password"] input').nth(1).fill(password);
      await page.fill('[data-testid="confirmPassword"] input', password);

      // Submit registration
      await page.locator('[data-testid="submit-button"]').nth(1).click();

      // CRITICAL: Should be automatically logged in and redirected to review page
      // User should NOT be stuck on landing page or need to manually login
      await page.waitForURL(`**/org/${TEST_ORG_ID}/review`, { timeout: 10000 });

      // Verify user is logged in by checking for authenticated UI elements
      await expect(page.locator('[data-testid="review-ideas-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="submit-idea-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="logout-button"]')).toBeVisible();

      // Verify user data is stored correctly in localStorage
      const storedToken = await page.evaluate(() => localStorage.getItem('token'));
      const storedUser = await page.evaluate(() => localStorage.getItem('user'));
      const storedOrgId = await page.evaluate(() => localStorage.getItem('organizationId'));

      expect(storedToken).toBeTruthy();
      expect(storedUser).toBeTruthy();
      expect(storedOrgId).toBe(TEST_ORG_ID);

      // Verify user has organizationId in database (stored in localStorage user object)
      const userData = JSON.parse(storedUser);
      expect(userData.organizationId).toBe(TEST_ORG_ID);
      // #892: username is no longer client-supplied -- the backend
      // auto-generates a display name, so only truthiness is checkable here.
      expect(userData.username).toBeTruthy();
    });

    test('should reject duplicate email', async ({ page }) => {
      // TEST-AUTH-04: Validates server rejects registration with an email
      // already in use. #892: username is no longer user input (auto-
      // generated server-side), so there is no more "duplicate username"
      // 409 -- email is the sole identity and its cross-tenant
      // single-identity guard is what this test now exercises.
      const timestamp = Date.now();
      const email = `duplicateemail${timestamp}@example.com`;
      const password = 'TestPass123!';

      // First registration
      await page.getByText('NEED AN ACCOUNT? REGISTER').click();

      await page.locator('[data-testid="email"] input').nth(1).fill(email);
      await page.locator('[data-testid="password"] input').nth(1).fill(password);
      await page.fill('[data-testid="confirmPassword"] input', password);

      // Submit registration
      await page.locator('[data-testid="submit-button"]').nth(1).click();

      // Wait for successful registration and login
      await expect(page.locator('[data-testid="logout-button"]')).toBeVisible();

      // Logout
      await page.click('[data-testid="logout-button"]');

      // Try to register again with the same email
      await page.getByText('NEED AN ACCOUNT? REGISTER').click();
      await page.locator('[data-testid="email"] input').nth(1).fill(email);
      await page.locator('[data-testid="password"] input').nth(1).fill(password);
      await page.fill('[data-testid="confirmPassword"] input', password);
      await page.locator('[data-testid="submit-button"]').nth(1).click();

      await expect(page.locator('[data-testid="error-message"]')).toContainText('Email already in use');
    });
  });

  test.describe('User Login', () => {
    test('should login with valid credentials', async ({ page }) => {
      // TEST-AUTH-05: Validates successful login with registered user credentials
      // First register a user. #892: login is now email-keyed, so this
      // registration must supply an email (login-by-username is gone and an
      // anonymous, email-less account is structurally unreachable via login).
      const timestamp = Date.now();
      const email = `loginuser${timestamp}@example.com`;
      const password = 'TestPass123!';

      await page.getByText('NEED AN ACCOUNT? REGISTER').click();
      await page.locator('[data-testid="email"] input').nth(1).fill(email);
      await page.locator('[data-testid="password"] input').nth(1).fill(password);
      await page.fill('[data-testid="confirmPassword"] input', password);
      await page.locator('[data-testid="submit-button"]').nth(1).click();

      // Logout
      await page.click('[data-testid="logout-button"]');

      // Login with the registered email + password.
      await page.locator('[data-testid="email"] input').nth(0).fill(email);
      await page.locator('[data-testid="password"] input').nth(0).fill(password);
      await page.locator('[data-testid="submit-button"]').nth(0).click();

      await page.waitForURL(`**/org/${TEST_ORG_ID}/review`, { timeout: 10000 });
      await expect(page.locator('[data-testid="review-ideas-button"]')).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      // TEST-AUTH-06: Validates error display for non-existent user login attempt
      await page.locator('[data-testid="email"] input').nth(0).fill('nonexistentuser@example.com');
      await page.locator('[data-testid="password"] input').nth(0).fill('wrongpassword');
      await page.locator('[data-testid="submit-button"]').nth(0).click();

      await expect(page.locator('[data-testid="error-message"]')).toContainText('Invalid credentials');
    });

    test('should maintain session across browser refresh', async ({ page }) => {
      // TEST-AUTH-07: Validates session persistence after browser page reload
      // Register and login
      const timestamp = Date.now();
      const email = `sessionuser${timestamp}@example.com`;
      const password = 'TestPass123!';

      console.log('Starting session test with user:', email);

      await page.getByText('NEED AN ACCOUNT? REGISTER').click();
      await page.locator('[data-testid="email"] input').nth(1).fill(email);
      await page.locator('[data-testid="password"] input').nth(1).fill(password);
      await page.fill('[data-testid="confirmPassword"] input', password);
      await page.locator('[data-testid="submit-button"]').nth(1).click();

      // Wait for successful registration and login
      await expect(page.locator('[data-testid="review-ideas-button"]')).toBeVisible();
      console.log('User successfully registered and logged in');

      // Check localStorage for token before refresh
      const tokenBeforeRefresh = await page.evaluate(() => localStorage.getItem('token'));
      console.log('Token before refresh exists:', !!tokenBeforeRefresh);
      console.log('Token before refresh length:', tokenBeforeRefresh?.length || 0);

      // Refresh the page
      console.log('Refreshing page...');
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Check localStorage for token after refresh
      const tokenAfterRefresh = await page.evaluate(() => localStorage.getItem('token'));
      console.log('Token after refresh exists:', !!tokenAfterRefresh);
      console.log('Token after refresh length:', tokenAfterRefresh?.length || 0);
      console.log('Tokens match:', tokenBeforeRefresh === tokenAfterRefresh);

      // Debug: Check what elements are present after refresh. #892: the
      // username testid is gone entirely, so the unauthenticated auth form
      // is now detected via its (always-present) email field instead.
      const hasAuthForm = await page.locator('[data-testid="email"]').count() > 0;
      const hasReviewButton = await page.locator('[data-testid="review-ideas-button"]').count() > 0;
      console.log('After refresh - Auth form present:', hasAuthForm, 'Review button present:', hasReviewButton);

      // Check if there are any console errors
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.log('Browser console error:', msg.text());
        }
      });

      // Should still be logged in
      await expect(page.locator('[data-testid="review-ideas-button"]')).toBeVisible();
    });
  });

  test.describe('Password Reset', () => {
    test('should initiate password reset for registered user with email', async ({ page }) => {
      // TEST-AUTH-08: Validates password reset flow for user with registered email
      // First register a user with email
      const timestamp = Date.now();
      const email = `reset${timestamp}@example.com`;
      const password = 'TestPass123!';

      await page.getByText('NEED AN ACCOUNT? REGISTER').click();
      await page.locator('[data-testid="email"] input').nth(1).fill(email);
      await page.locator('[data-testid="password"] input').nth(1).fill(password);
      await page.fill('[data-testid="confirmPassword"] input', password);
      await page.locator('[data-testid="submit-button"]').nth(1).click();

      await page.click('[data-testid="logout-button"]');

      // Navigate to password reset
      await page.click('[data-testid="forgot-password-link"]');

      await page.locator('[data-testid="reset-email"] input').fill(email);
      await page.click('[data-testid="reset-button"]');

      await expect(page.locator('[data-testid="success-message"]')).toContainText('Recovery email sent! Please check your inbox.');
    });

    test('should show error for password reset without email', async ({ page }) => {
      // TEST-AUTH-09: Validates error handling for password reset with unregistered email
      await page.click('[data-testid="forgot-password-link"]');

      await page.locator('[data-testid="reset-email"] input').fill('nonexistent@example.com');
      await page.click('[data-testid="reset-button"]');

      await expect(page.locator('[data-testid="error-message"]')).toContainText('No account found with this email address');
    });
  });

  test.describe('Logout', () => {
    test('should logout user and clear session', async ({ page }) => {
      // TEST-AUTH-10: Validates user logout functionality and session clearing
      // Register and login
      const timestamp = Date.now();
      const email = `logoutuser${timestamp}@example.com`;
      const password = 'TestPass123!';

      await page.getByText('NEED AN ACCOUNT? REGISTER').click();
      await page.locator('[data-testid="email"] input').nth(1).fill(email);
      await page.locator('[data-testid="password"] input').nth(1).fill(password);
      await page.fill('[data-testid="confirmPassword"] input', password);
      await page.locator('[data-testid="submit-button"]').nth(1).click();

      // Logout
      await page.click('[data-testid="logout-button"]');

      // Should be back to login screen
      await expect(page.locator('[data-testid="email"]').nth(0)).toBeVisible();
      await expect(page.locator('[data-testid="password"]').nth(0)).toBeVisible();
    });
  });
});