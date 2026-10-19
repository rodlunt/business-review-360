// 19-pricing-flow.spec.js
//
// /pricing page Playwright coverage. Mocks /api/billing/plans via route.fulfill
// so this spec needs no backend or database. Run via the slim no-db config:
//
//   npx playwright test --config=testing/playwright.no-db.config.js \
//     testing/e2e/19-pricing-flow.spec.js
//
// Issue #641 (Tailwind dead in PricingPage.jsx) folds #614 (broken Pro POST).
import { test, expect } from '@playwright/test';

const seedPlans = [
  {
    plan_code: 'free',
    plan_name: 'Free',
    description: 'Get started at no cost',
    monthly_price: 0,
    yearly_price: 0,
    currency: 'AUD',
    limits: { maxIdeas: 10, maxUsers: 3, maxStorage: 1073741824 },
    features: ['core_features', 'community_support'],
    is_public: true,
  },
  {
    plan_code: 'pro',
    plan_name: 'Professional',
    description: 'Growing teams',
    monthly_price: 4995,
    yearly_price: 49940,
    currency: 'AUD',
    limits: { maxIdeas: 500, maxUsers: 50, maxStorage: 5368709120 },
    features: ['core_features', 'advanced_analytics', 'priority_support'],
    is_public: true,
  },
  {
    plan_code: 'custom',
    plan_name: 'Custom',
    description: 'Tailored to you',
    monthly_price: 0,
    yearly_price: 0,
    currency: 'AUD',
    limits: { maxIdeas: -1, maxUsers: -1, maxStorage: -1 },
    features: ['core_features', 'dedicated_support', 'sla'],
    is_public: true,
  },
];

// Regex (not glob) so the matcher ignores axios interceptor query params
// like ?clientId=... and still intercepts the cross-origin call to the
// dev backend on :4000. Glob '**/api/billing/plans' anchors the end of
// the URL and silently misses on the appended query string. See #647.
const PLANS_ROUTE = /\/api\/billing\/plans(\?.*)?$/;

test.describe('/pricing flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(PLANS_ROUTE, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plans: seedPlans }),
      });
    });
  });

  test('renders three plan cards with names and prices', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 2, name: 'Free' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Professional' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Custom' })).toBeVisible();
    // Free plan should show "Free" as the price (not "Contact us"); regression for the
    // formatPrice(0) bug fixed alongside this spec.
    await expect(page.getByRole('heading', { level: 4, name: 'Free' })).toBeVisible();
    await expect(page.getByText(/\$49\.95/)).toBeVisible();
  });

  test('toggling Annually updates the displayed prices', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/\$49\.95/)).toBeVisible();
    await page.getByRole('button', { name: /annually/i }).click();
    await expect(page.getByText(/\$499\.40/)).toBeVisible();
  });

  test('clicking Free redirects to /signup?plan=free', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 2, name: 'Free' })).toBeVisible();
    const freeCard = page.locator('.MuiCard-root', { hasText: 'Free' });
    await freeCard.getByRole('button').click();
    await expect(page).toHaveURL(/\/signup\?plan=free/);
  });

  test('clicking Pro on monthly redirects to /signup?plan=pro&interval=monthly', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('Professional')).toBeVisible();
    const proCard = page.locator('.MuiCard-root', { hasText: 'Professional' });
    await proCard.getByRole('button', { name: /get started/i }).click();
    await expect(page).toHaveURL(/\/signup\?plan=pro&interval=monthly/);
  });

  test('clicking Pro on yearly redirects to /signup?plan=pro&interval=yearly', async ({ page }) => {
    await page.goto('/pricing');
    await page.getByRole('button', { name: /annually/i }).click();
    const proCard = page.locator('.MuiCard-root', { hasText: 'Professional' });
    await proCard.getByRole('button', { name: /get started/i }).click();
    await expect(page).toHaveURL(/\/signup\?plan=pro&interval=yearly/);
  });

  test('clicking Custom opens the contact sales dialog', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('Custom')).toBeVisible();
    const customCard = page.locator('.MuiCard-root', { hasText: 'Custom' });
    await customCard.getByRole('button', { name: /contact sales/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
