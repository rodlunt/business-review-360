/**
 * Superuser Flow Tests
 *
 * Verifies that superuser-only sections of AdminSettings are:
 *   - visible and functional for dcsuper (isSuperuser: true)
 *   - hidden from dcadmin (isAdmin: true, isSuperuser: false)
 *
 * Fixture required: dcsuper (seeded via db/patches/dcsuper-seed.sql)
 * If dcsuper is not present in the local DB, apply the seed and restart
 * the backend before running these tests.
 *
 * Superuser-only gates in AdminSettings.jsx (issue #769):
 *   - OrganizationSettings section → data-testid="organization-name"
 *   - Settings card              → data-testid="save-organization-settings"
 *   - Data Management section    → data-testid="export-csv" / "export-json"
 */
import { test, expect } from '@playwright/test';
import { loginUser, navigateToAdminSettings, TEST_ORG_ID } from './test-helpers.js';

const ORG = TEST_ORG_ID; // 'demo-corp'
const PASSWORD = 'Password123!';
const BACKEND = 'http://localhost:4000';

// ---------------------------------------------------------------------------
// dcsuper — superuser-only sections should be visible
// ---------------------------------------------------------------------------

test.describe('dcsuper sees all superuser-only sections', () => {
  test('OrganizationSettings and Data Management sections are visible', async ({ page }) => {
    let loginFailed = false;
    await loginUser(page, 'dcsuper', PASSWORD, ORG).catch(() => {
      loginFailed = true;
    });
    test.skip(loginFailed, 'dcsuper not seeded — apply db/patches/dcsuper-seed.sql first');

    await navigateToAdminSettings(page);
    await expect(page).toHaveURL(new RegExp(`/org/${ORG}/admin`));
    await page.waitForLoadState('networkidle');

    // OrganizationSettings section
    await expect(page.getByTestId('organization-name')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('save-organization-settings')).toBeVisible();

    // Data Management section — scroll into view then assert
    await page.getByTestId('export-csv').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('export-csv')).toBeVisible();
    await expect(page.getByTestId('export-json')).toBeVisible();
  });

  test('export CSV endpoint returns 200 with dcsuper token', async ({ page, request }) => {
    let loginFailed = false;
    await loginUser(page, 'dcsuper', PASSWORD, ORG).catch(() => {
      loginFailed = true;
    });
    test.skip(loginFailed, 'dcsuper not seeded — apply db/patches/dcsuper-seed.sql first');

    const token = await page.evaluate(() => localStorage.getItem('token'));

    const res = await request.get(`${BACKEND}/api/export/csv?organizationId=${ORG}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/text\/csv/i);
  });

  test('export JSON endpoint returns 200 with dcsuper token', async ({ page, request }) => {
    let loginFailed = false;
    await loginUser(page, 'dcsuper', PASSWORD, ORG).catch(() => {
      loginFailed = true;
    });
    test.skip(loginFailed, 'dcsuper not seeded — apply db/patches/dcsuper-seed.sql first');

    const token = await page.evaluate(() => localStorage.getItem('token'));

    const res = await request.get(`${BACKEND}/api/export/json?organizationId=${ORG}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.ideas !== 'undefined' || Array.isArray(body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dcadmin — superuser-only sections should be absent
// ---------------------------------------------------------------------------

test.describe('dcadmin cannot see superuser-only sections', () => {
  test('OrganizationSettings and Data Management sections are not visible', async ({ page }) => {
    await loginUser(page, 'dcadmin', PASSWORD, ORG);

    await navigateToAdminSettings(page);
    await expect(page).toHaveURL(new RegExp(`/org/${ORG}/admin`));
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('organization-name')).not.toBeVisible();
    await expect(page.getByTestId('save-organization-settings')).not.toBeVisible();
    await expect(page.getByTestId('export-csv')).not.toBeVisible();
    await expect(page.getByTestId('export-json')).not.toBeVisible();
  });

  test('export CSV endpoint returns 403 with dcadmin token', async ({ page, request }) => {
    await loginUser(page, 'dcadmin', PASSWORD, ORG);
    const token = await page.evaluate(() => localStorage.getItem('token'));

    const res = await request.get(`${BACKEND}/api/export/csv?organizationId=${ORG}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
  });

  test('export JSON endpoint returns 403 with dcadmin token', async ({ page, request }) => {
    await loginUser(page, 'dcadmin', PASSWORD, ORG);
    const token = await page.evaluate(() => localStorage.getItem('token'));

    const res = await request.get(`${BACKEND}/api/export/json?organizationId=${ORG}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
  });
});
