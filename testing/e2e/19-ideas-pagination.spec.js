/**
 * Ideas pagination E2E tests (#692)
 *
 * Verifies that:
 * 1. The Review Ideas page no longer issues ?limit=10000 requests.
 * 2. Ideas load and are rendered via the useIdeasPage hook (server-side pagination).
 * 3. "Load more" button appears and works when there are more pages.
 *
 * The demo-corp fixture has 9 ideas so hasMore is false with the default
 * limit of 50. The load-more flow is tested by seeding extra ideas via the
 * API and using a small page size (limit=2 driven through URL state).
 */
import { test, expect } from '@playwright/test';
import { gotoLogin, gotoReview, loginUser, resetTestDatabase, TEST_ORG_ID } from './test-helpers.js';

const DCADMIN = { email: 'admin@democorp.com', password: 'Password123!' };

test.describe('Ideas pagination (#692)', () => {
  test.beforeEach(async ({ request }) => {
    await resetTestDatabase(request);
  });

  test('Review Ideas does not call /api/ideas with limit=10000', async ({ page }) => {
    const largeRequests = [];
    page.on('request', req => {
      if (req.url().includes('/api/ideas') && req.url().includes('limit=10000')) {
        largeRequests.push(req.url());
      }
    });

    await loginUser(page, DCADMIN.email, DCADMIN.password);
    await gotoReview(page);
    await page.waitForSelector('[data-testid="idea-list"]', { timeout: 10000 });

    expect(largeRequests).toHaveLength(0);
  });

  test('Review Ideas loads and displays ideas via paginated fetch', async ({ page }) => {
    await loginUser(page, DCADMIN.email, DCADMIN.password);
    await gotoReview(page);

    await expect(page.locator('[data-testid="idea-list"]')).toBeVisible({ timeout: 10000 });

    const cards = page.locator('[data-testid="idea-list"] [data-testid^="idea-select-"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Load more button appears and appends ideas when hasMore is true', async ({ page, request }) => {
    await loginUser(page, DCADMIN.email, DCADMIN.password);

    // Seed enough ideas to exceed a small page (we use the API directly)
    // Create ideas until we have more than 2 to trigger hasMore
    const authToken = await page.evaluate(() => localStorage.getItem('token'));

    // Create 3 extra ideas so that with limit=2 we have hasMore=true
    for (let i = 0; i < 3; i++) {
      await request.post(`/api/ideas`, {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          title: `Pagination test idea ${i + 1}`,
          description: 'Created for pagination E2E test',
          category: 'Technology',
        },
      });
    }

    // Intercept the ideas API to force a small limit
    await page.route('**/api/ideas*', async route => {
      const url = new URL(route.request().url());
      url.searchParams.set('limit', '2');
      await route.continue({ url: url.toString() });
    });

    await gotoReview(page);
    await expect(page.locator('[data-testid="idea-list"]')).toBeVisible({ timeout: 10000 });

    const loadMoreBtn = page.locator('[data-testid="load-more-button"]');
    await expect(loadMoreBtn).toBeVisible({ timeout: 5000 });

    const countBefore = await page.locator('[data-testid="idea-list"] > div > *').count();
    await loadMoreBtn.click();

    await expect(loadMoreBtn).toBeEnabled({ timeout: 5000 });
    const countAfter = await page.locator('[data-testid="idea-list"] > div > *').count();
    expect(countAfter).toBeGreaterThan(countBefore);
  });
});
