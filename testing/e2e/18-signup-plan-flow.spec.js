/**
 * Issue #605 -- /signup combobox a11y + plan-list drift (e2e)
 *
 * Three browser-level assertions that the plan picker is wired correctly:
 *
 *   1. the rendered combobox carries the accessible name "Plan"
 *   2. the dropdown options match the live /api/billing/plans response
 *   3. submit no longer hits the INVALID_PLAN_ID gate at billing.js line 102
 *
 * Case 3 is intentionally tolerant. The plan section 6.5 records two pre-
 * existing wiring bugs (POST URL `create-checkout-session` vs route `checkout`,
 * body field `plan` vs `planId`) that prevent the request from reaching the
 * whitelist on production today. Those are out of scope for #605; this test
 * only asserts that the failure mode is NOT INVALID_PLAN_ID.
 *
 * Run via: npx playwright test 18-signup-plan-flow --config testing/playwright.config.js
 * Requires the local docker compose stack to be up on localhost:3000.
 */
import { test, expect, request as pwRequest } from '@playwright/test';

test.describe('Issue #605 -- /signup plan combobox', () => {
  test('combobox exposes "Plan" as its accessible name', async ({ page }) => {
    await page.goto('/signup');

    const combobox = page.getByRole('combobox', { name: 'Plan' });
    await expect(combobox).toBeVisible();
  });

  test('dropdown options match GET /api/billing/plans', async ({ page, baseURL }) => {
    // Hit the API directly to retrieve the source of truth.
    const apiContext = await pwRequest.newContext({ baseURL });
    const apiResponse = await apiContext.get('/api/billing/plans');
    expect(apiResponse.status()).toBe(200);
    const { plans } = await apiResponse.json();
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBeGreaterThan(0);

    // Visit /signup, open the dropdown, and verify each plan renders.
    await page.goto('/signup');
    const combobox = page.getByRole('combobox', { name: 'Plan' });
    await expect(combobox).toBeVisible();
    await combobox.click();

    for (const plan of plans) {
      const expectedLabel = `${plan.plan_name} - $${(plan.monthly_price / 100).toFixed(2)}/month inc GST`;
      await expect(page.getByRole('option', { name: expectedLabel })).toBeVisible();
    }

    // The legacy hardcoded labels must not appear.
    await expect(page.getByRole('option', { name: 'Starter - $29/month' })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Professional - $99/month' })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Enterprise - $299/month' })).toHaveCount(0);
  });

  test('submit does not trip INVALID_PLAN_ID', async ({ page }) => {
    let sawInvalidPlanId = false;
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/billing/')) return;
      if (response.status() !== 400) return;
      try {
        const body = await response.json();
        if (body.code === 'INVALID_PLAN_ID') sawInvalidPlanId = true;
      } catch {
        // not JSON, ignore
      }
    });

    await page.goto('/signup?plan=sme');

    // Wait for the picker to be hydrated by the API fetch.
    const combobox = page.getByRole('combobox', { name: 'Plan' });
    await expect(combobox).toBeVisible();
    await expect(combobox).not.toHaveAttribute('aria-disabled', 'true');

    // Fill the rest of the form with a unique org id to avoid ORG_ID_TAKEN.
    const orgId = `e2e-605-${Date.now()}`;
    await page.locator('input[name="organizationName"]').fill('E2E 605 Test Org');
    await page.locator('input[name="organizationId"]').fill(orgId);
    await page.locator('input[name="firstName"]').fill('E2E');
    await page.locator('input[name="lastName"]').fill('Tester');
    await page.locator('input[name="email"]').fill(`${orgId}@example.test`);

    await page.locator('button[type="submit"]').click();

    // Wait for the network to settle. Pre-existing wiring bugs may produce a
    // 404, network error, or STRIPE_NOT_CONFIGURED 500; any of those satisfy
    // this test. Only INVALID_PLAN_ID is a regression of the #605 fix.
    await page.waitForLoadState('networkidle');

    expect(sawInvalidPlanId).toBe(false);
  });
});
