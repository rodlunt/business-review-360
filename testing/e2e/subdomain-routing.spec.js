/**
 * Subdomain Routing Smoke Tests
 *
 * Verifies that bare routes (/login, /review, /submit) work correctly on
 * the tenant subdomain demo-corp.br360.example.com (#517).
 *
 * These tests ONLY run under the "subdomain" Playwright project, which is
 * configured in playwright.production.config.js with:
 *   baseURL: "https://demo-corp.br360.example.com"
 *
 * The tests are skipped automatically for all other project names (e.g. "chromium")
 * so the file is safe to include in the main testDir without triggering on localhost.
 *
 * Fixture: dcuser (user@democorp.com) / Password123! (permanent prod fixture for demo-corp)
 */
import { test, expect } from '@playwright/test';

const PASSWORD = 'Password123!';

test.describe('Subdomain routing — demo-corp.br360.example.com', () => {
  test.beforeEach(({}, testInfo) => {
    // Only run in the "subdomain" project to avoid executing against localhost,
    // where SubdomainAppWrapper redirects bare routes to /org (no subdomain detected).
    test.skip(
      testInfo.project.name !== 'subdomain',
      'Subdomain routing tests only run in the "subdomain" project (playwright.production.config.js)'
    );
  });

  test('GET /login renders the MUI login form', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('load');

    // #892: the login credential field is email, not username.
    await expect(page.locator('[data-testid="email"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="password"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="submit-button"]').first()).toBeVisible();
  });

  test('GET /review unauthenticated redirects to /login', async ({ page }) => {
    await page.goto('/review');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('GET /submit unauthenticated redirects to /login', async ({ page }) => {
    await page.goto('/submit');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('login on subdomain resolves demo-corp via Host header and redirects to /review', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('load');

    // Fill login form using the same MUI testid pattern as test-helpers.js.
    // #892: the credential is email, not username.
    await page.locator('[data-testid="email"] input').first().fill('user@democorp.com');
    await page.locator('[data-testid="password"] input').first().fill(PASSWORD);
    await page.locator('[data-testid="submit-button"]').first().click();

    // On the subdomain, successful login lands on bare /review (no /org/:id prefix)
    await page.waitForURL(/\/review/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/review/);

    // Navigation elements confirm we're logged in and in the right org
    await expect(page.getByTestId('review-ideas-button')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('submit-idea-button')).toBeVisible();
  });
});
