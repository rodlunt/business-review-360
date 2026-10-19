/**
 * Idea management E2E smoke tests.
 *
 * Keep this file focused on browser-visible workflows. Backend edge cases for
 * CRUD, sorting, pagination, permissions, and tenant scoping live in Jest.
 */
import { test, expect } from '@playwright/test';
import {
  gotoSubmit,
  gotoReview,
  loginUser,
  resetTestDatabase,
  TEST_ORG_ID,
} from './test-helpers.js';

const DCUSER = { email: 'user@democorp.com', password: 'Password123!' };

async function setMuiSlider(page, testId, valueOutOfTen) {
  const slider = page.locator(`[data-testid="${testId}"]`).first();
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  if (!box) throw new Error(`Unable to find ${testId}`);

  const x = box.x + (box.width * valueOutOfTen) / 10;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
}

async function fillRequiredIdeaFields(page, title) {
  await page.locator('[data-testid="idea-title"] input').fill(title);
  await page.locator('[data-testid="idea-category"] input').fill('Technology');
  await page.locator('[data-testid="idea-description"] textarea').fill('A focused E2E idea description');
  await page.locator('[data-testid="organizational-impact"] textarea').fill('This slows the team down');
  await page.locator('[data-testid="fix-impact"]').click();
  await page.getByRole('option', { name: 'Medium' }).click();
  await page.locator('[data-testid="solution"] textarea').fill('Automate the repeated task');
  await setMuiSlider(page, 'impact-score-slider', 7);
  await setMuiSlider(page, 'effort-score-slider', 4);
  await page.locator('[data-testid="would-spend-money"] input[value="true"]').check();
}

async function submitIdea(page, title) {
  await gotoSubmit(page);
  await fillRequiredIdeaFields(page, title);
  await page.locator('[data-testid="submit-idea-btn"]').click();
  await expect(page.locator('[data-testid="success-message"]')).toContainText(
    'Idea submitted successfully'
  );
}

async function openIdeaFromReview(page, title) {
  await gotoReview(page);
  const ideaCard = page.locator('[data-testid="idea-card"]').filter({ hasText: title }).first();
  await expect(ideaCard).toBeVisible({ timeout: 10000 });
  await ideaCard.click();
}

test.describe('Idea management', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetTestDatabase(request);
    await loginUser(page, DCUSER.email, DCUSER.password);
  });

  test('submits an idea and opens its detail page', async ({ page }) => {
    const title = `E2E Idea ${Date.now()}`;

    await submitIdea(page, title);
    await openIdeaFromReview(page, title);

    await expect(page).toHaveURL(/\/org\/demo-corp\/idea\/[\w-]+-\d+/);
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText('A focused E2E idea description')).toBeVisible();
    await expect(page.getByRole('button', { name: /close|back/i })).toBeVisible();
  });

  test('shows validation feedback when required fields are missing', async ({ page }) => {
    await gotoSubmit(page);

    await page.locator('[data-testid="submit-idea-btn"]').click();

    await expect(page.locator('[data-testid="error-message"]')).toContainText('Title is required');
    await expect(page.locator('[data-testid="idea-form"]')).toBeVisible();
  });

  test('filters the review list by category without losing the submitted idea', async ({ page }) => {
    const title = `Filtered E2E Idea ${Date.now()}`;

    await submitIdea(page, title);
    await gotoReview(page);

    await page.locator('[data-testid="category-button"]').click();
    await page.getByRole('menuitem', { name: 'Technology' }).click();

    const filteredCard = page.locator('[data-testid="idea-card"]').filter({ hasText: title }).first();
    await expect(filteredCard).toBeVisible({ timeout: 10000 });
    await expect(filteredCard).toContainText('Technology');
  });
});
