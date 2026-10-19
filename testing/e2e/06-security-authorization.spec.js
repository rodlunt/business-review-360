/**
 * Security and authorization E2E smoke tests.
 *
 * This suite intentionally avoids duplicating backend security matrices. It
 * keeps only browser-visible checks plus one API probe where the UI and backend
 * contract meet.
 */
import { test, expect } from '@playwright/test';
import {
  gotoAdmin,
  gotoReview,
  loginUser,
  resetTestDatabase,
  TEST_ORG_ID,
} from './test-helpers.js';

const DCUSER = { email: 'user@democorp.com', password: 'Password123!' };

test.describe('Security and authorization', () => {
  test.beforeEach(async ({ request }) => {
    await resetTestDatabase(request);
  });

  test('keeps admin UI and admin API unavailable to a regular user', async ({ page, request }) => {
    await loginUser(page, DCUSER.email, DCUSER.password);

    await expect(page.locator('[data-testid="admin-menu-button"]')).not.toBeVisible();

    await gotoAdmin(page);
    await expect(page).toHaveURL(new RegExp(`/org/${TEST_ORG_ID}/review`));

    const token = await page.evaluate(() => localStorage.getItem('token'));
    const response = await request.get('/api/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(403);
  });

  test('rejects a tampered browser token and returns the user to login', async ({ page }) => {
    await loginUser(page, DCUSER.email, DCUSER.password);

    await page.evaluate(() => {
      const token = localStorage.getItem('token');
      localStorage.setItem('token', `${token?.slice(0, -8) ?? ''}tampered`);
    });

    await gotoReview(page);

    await expect(page.locator('[data-testid="email"] input').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout clears the browser session and blocks protected pages', async ({ page }) => {
    await loginUser(page, DCUSER.email, DCUSER.password);

    await page.locator('[data-testid="logout-button"]').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBeNull();

    await gotoReview(page);

    await expect(page.locator('[data-testid="email"] input').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page).toHaveURL(/\/login/);
  });
});
