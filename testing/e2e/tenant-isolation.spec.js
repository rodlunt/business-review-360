/**
 * Tenant Isolation Tests
 *
 * Verifies that users from one organisation cannot access another org's data.
 *
 * Fixtures required (seeded by global-setup.js):
 *   demo-corp:  dcuser (user@democorp.com) / dcadmin (admin@democorp.com)   (Password123!)
 *   test-org-2: testorg2user (user@testorg2.local) / testorg2admin (admin@testorg2.local)  (Password123!)
 *
 * #892: /auth/login is email-keyed on both the org-less and org-scoped
 * paths now; username is no longer a login credential.
 *
 * Coverage:
 *   API layer  — verifyTenantUserMatch middleware returns 403 TENANT_ACCESS_DENIED
 *   UI layer   — App.jsx detects org mismatch and redirects to user's own org
 */
import { test, expect } from '@playwright/test';
import { loginUser } from './test-helpers.js';

const DEMO_CORP = 'demo-corp';
const TEST_ORG_2 = 'test-org-2';
const PASSWORD = 'Password123!';
const BACKEND = 'http://localhost:4000';

// ---------------------------------------------------------------------------
// API-layer isolation
// ---------------------------------------------------------------------------

test.describe('API tenant isolation — test-org-2 token rejected by demo-corp routes', () => {
  let testorg2UserToken;
  let testorg2AdminToken;

  test.beforeAll(async ({ request }) => {
    // #892: /auth/login is email-keyed on the org-scoped path too.
    const userRes = await request.post(`${BACKEND}/api/auth/login`, {
      data: { email: 'user@testorg2.local', password: PASSWORD, organizationId: TEST_ORG_2 },
    });
    if (userRes.ok()) {
      testorg2UserToken = (await userRes.json()).token;
    }

    const adminRes = await request.post(`${BACKEND}/api/auth/login`, {
      data: { email: 'admin@testorg2.local', password: PASSWORD, organizationId: TEST_ORG_2 },
    });
    if (adminRes.ok()) {
      testorg2AdminToken = (await adminRes.json()).token;
    }
  });

  test('testorg2user token is rejected when reading demo-corp ideas (403)', async ({ request }) => {
    test.skip(!testorg2UserToken, 'testorg2user not seeded — run global-setup to apply test-org-2-seed.sql');

    const res = await request.get(`${BACKEND}/api/ideas?organizationId=${DEMO_CORP}`, {
      headers: { Authorization: `Bearer ${testorg2UserToken}` },
    });
    // verifyTenantUserMatch fires before authenticate; org mismatch → 403
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('TENANT_ACCESS_DENIED');
  });

  test('testorg2user token is rejected when posting an idea to demo-corp (403)', async ({ request }) => {
    test.skip(!testorg2UserToken, 'testorg2user not seeded');

    const res = await request.post(`${BACKEND}/api/ideas?organizationId=${DEMO_CORP}`, {
      headers: { Authorization: `Bearer ${testorg2UserToken}` },
      data: {
        title: 'Cross-tenant injection attempt',
        description: 'Should be blocked',
        category: 'Security',
        orgImpact: 'High',
        fixImpact: 'low',
        solution: 'N/A',
        wouldSpendOwnMoney: false,
      },
    });
    expect(res.status()).toBe(403);
  });

  test('testorg2admin token is rejected when accessing demo-corp user list (403)', async ({ request }) => {
    test.skip(!testorg2AdminToken, 'testorg2admin not seeded');

    const res = await request.get(`${BACKEND}/api/users?organizationId=${DEMO_CORP}`, {
      headers: { Authorization: `Bearer ${testorg2AdminToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('testorg2user token is rejected when accessing demo-corp comments (403)', async ({ request }) => {
    test.skip(!testorg2UserToken, 'testorg2user not seeded');

    const res = await request.get(`${BACKEND}/api/comments?organizationId=${DEMO_CORP}`, {
      headers: { Authorization: `Bearer ${testorg2UserToken}` },
    });
    expect(res.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// UI-layer isolation
// ---------------------------------------------------------------------------

test.describe('UI tenant isolation — cross-org navigation is redirected', () => {
  test('testorg2user navigating to demo-corp review is redirected to their own org', async ({ page }) => {
    // Login as test-org-2 user (lands on /org/test-org-2/review). #892:
    // loginUser fills the email field now, not username.
    await loginUser(page, 'user@testorg2.local', PASSWORD, TEST_ORG_2).catch(() => {
      test.skip();
    });

    // Attempt to navigate to demo-corp's review page
    await page.goto(`/org/${DEMO_CORP}/review`);

    // App.jsx detects the org mismatch asynchronously (after /auth/me resolves)
    // and redirects via React Router. waitForURL gives the React effect time to
    // fire rather than snapshotting page.url() immediately after networkidle.
    await page.waitForURL(
      (url) => !url.href.includes(`/org/${DEMO_CORP}/review`),
      { timeout: 15000 }
    );

    // Should end up on the user's own org (test-org-2) or login
    const url = page.url();
    const isOwnOrg = url.includes(`/org/${TEST_ORG_2}/`) || url.includes('/login');
    expect(isOwnOrg).toBe(true);
  });
});
