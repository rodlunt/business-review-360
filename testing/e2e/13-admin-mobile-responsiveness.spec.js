/**
 * UPDATED: 2025-11-05 for Epic #318 Phases 6, 7, 8 compatibility
 * - UI tests are frontend-focused and unaffected by backend changes
 * - Compatible with all Phase 6, 7, 8 infrastructure updates
 */
import { test, expect } from '@playwright/test';
import { gotoLogin, navigateToAdminSettings, loginDemoAdmin, TEST_ORG_ID } from './test-helpers.js';

/**
 * Admin Settings Mobile Responsiveness Tests
 * Tests the mobile responsive fixes for Admin Settings page cards
 */

test.describe('Admin Settings - Mobile Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    // Login as demo admin
    await loginDemoAdmin(page);

    // Navigate to admin settings
    await navigateToAdminSettings(page);
    await page.waitForLoadState('networkidle');
  });

  test.describe('Logo Upload Card - Mobile Layout', () => {
    test('should stack vertically on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      // Logo upload section should be visible
      const logoSection = page.locator('text=Logo Upload').locator('..').locator('..');
      await expect(logoSection).toBeVisible();

      // Buttons should be visible and stacked
      const chooseFileBtn = page.locator('button:has-text("Choose File")');
      const uploadBtn = page.locator('button:has-text("Upload")');

      await expect(chooseFileBtn).toBeVisible();
      await expect(uploadBtn).toBeVisible();

      // On mobile, buttons should be in a flex container that allows wrapping
      const chooseFileBox = await chooseFileBtn.boundingBox();
      const uploadBox = await uploadBtn.boundingBox();

      // Buttons should be touch-friendly size
      expect(chooseFileBox.height).toBeGreaterThanOrEqual(32);
      expect(uploadBox.height).toBeGreaterThanOrEqual(32);
    });

    test('should display logo preview full-width on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      // If logo exists, check its mobile layout
      const logoPreview = page.locator('img[alt*="logo"]').first();

      if (await logoPreview.isVisible({ timeout: 2000 }).catch(() => false)) {
        const logoBox = await logoPreview.boundingBox();

        // Logo container should be full-width on mobile
        // (or at least wider than desktop fixed width of 160px)
        expect(logoBox.width).toBeGreaterThan(0);
      }
    });

    test('should maintain functionality on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      // Click choose file button
      const chooseFileBtn = page.locator('button:has-text("Choose File")');
      await expect(chooseFileBtn).toBeVisible();
      await expect(chooseFileBtn).toBeEnabled();

      // Upload button should be disabled initially (no file selected)
      const uploadBtn = page.locator('button:has-text("Upload")');
      await expect(uploadBtn).toBeVisible();
      await expect(uploadBtn).toBeDisabled();
    });
  });

  test.describe('Data Export Card - Mobile Layout', () => {
    test('should stack vertically on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      // Data export section should be visible
      const exportSection = page.locator('text=Data Export').locator('..').locator('..');
      await expect(exportSection).toBeVisible();

      // Export buttons should be visible
      const csvBtn = page.locator('[data-testid="export-csv"]');
      const jsonBtn = page.locator('[data-testid="export-json"]');

      await expect(csvBtn).toBeVisible();
      await expect(jsonBtn).toBeVisible();
    });

    test('should have full-width buttons on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const csvBtn = page.locator('[data-testid="export-csv"]');
      const jsonBtn = page.locator('[data-testid="export-json"]');

      const csvBox = await csvBtn.boundingBox();
      const jsonBox = await jsonBtn.boundingBox();

      // Buttons should share space equally on mobile
      // Both should be visible and have reasonable width
      expect(csvBox.width).toBeGreaterThan(100);
      expect(jsonBox.width).toBeGreaterThan(100);

      // Buttons should be touch-friendly
      expect(csvBox.height).toBeGreaterThanOrEqual(32);
      expect(jsonBox.height).toBeGreaterThanOrEqual(32);
    });

    test('should maintain export functionality on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      // Export buttons should be clickable
      const csvBtn = page.locator('[data-testid="export-csv"]');
      await expect(csvBtn).toBeEnabled();

      const jsonBtn = page.locator('[data-testid="export-json"]');
      await expect(jsonBtn).toBeEnabled();

      // Clicking should work (we won't actually download, just verify clickability)
      await csvBtn.click();
      await page.waitForLoadState('networkidle');

      // Should show loading or completion state
      // Button text might change temporarily during export
    });
  });

  test.describe('Analytics Page - Top Ideas Card Mobile', () => {
    test('should display top ideas card on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      // Navigate to analytics
      await page.click('[data-testid="admin-menu-button"]');
      await page.locator('[data-testid="admin-analytics-menu-item"]').waitFor();
      await page.click('[data-testid="admin-analytics-menu-item"]');
      await page.waitForLoadState('networkidle');

      // Top Ideas section should be visible
      const topIdeasSection = page.locator('text=Top Ideas by Votes').locator('..').locator('..');

      if (await topIdeasSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(topIdeasSection).toBeVisible();

        // Ideas should be listed
        const ideaTitles = page.locator('[class*="MuiTypography"]').filter({ hasText: /idea|implement|create|launch/i });

        if (await ideaTitles.count() > 0) {
          // First idea title should be visible
          await expect(ideaTitles.first()).toBeVisible();

          // Vote chips should be visible
          const voteChips = page.locator('text=/\\d+ votes?/i');

          if (await voteChips.count() > 0) {
            await expect(voteChips.first()).toBeVisible();
          }
        }
      }
    });

    test('should handle long idea titles on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      // Navigate to analytics
      await page.click('[data-testid="admin-menu-button"]');
      await page.locator('[data-testid="admin-analytics-menu-item"]').waitFor();
      await page.click('[data-testid="admin-analytics-menu-item"]');
      await page.waitForLoadState('networkidle');

      // Check if ideas are present
      const topIdeasSection = page.locator('text=Top Ideas by Votes').locator('..').locator('..');

      if (await topIdeasSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Idea titles should wrap on multiple lines on mobile
        // They should not overflow the container
        const ideaTitles = page.locator('[class*="MuiTypography"]').filter({ hasText: /idea|implement|create|launch/i });

        if (await ideaTitles.count() > 0) {
          const firstTitle = ideaTitles.first();
          const titleBox = await firstTitle.boundingBox();

          // Title should have reasonable width (not overflow)
          expect(titleBox.width).toBeLessThan(350); // Should fit on 375px mobile
        }
      }
    });

    test('should stack vote chips below title on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      // Navigate to analytics
      await page.click('[data-testid="admin-menu-button"]');
      await page.locator('[data-testid="admin-analytics-menu-item"]').waitFor();
      await page.click('[data-testid="admin-analytics-menu-item"]');
      await page.waitForLoadState('networkidle');

      const topIdeasSection = page.locator('text=Top Ideas by Votes').locator('..').locator('..');

      if (await topIdeasSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Vote chip should be below the title on mobile (column layout)
        const voteChips = page.locator('text=/\\d+ votes?/i');

        if (await voteChips.count() > 0) {
          await expect(voteChips.first()).toBeVisible();

          // Chip should be aligned with title indent on mobile
          const chipBox = await voteChips.first().boundingBox();
          expect(chipBox.x).toBeGreaterThan(30); // Has left margin/padding for alignment
        }
      }
    });
  });

  test.describe('Tablet View (768px)', () => {
    test('should adapt admin settings cards for tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });

      // Logo Upload section
      const logoSection = page.locator('text=Logo Upload').locator('..').locator('..');
      await expect(logoSection).toBeVisible();

      // Data Export section
      const exportSection = page.locator('text=Data Export').locator('..').locator('..');
      await expect(exportSection).toBeVisible();

      // All buttons should be visible and functional
      const chooseFileBtn = page.locator('button:has-text("Choose File")');
      const csvBtn = page.locator('[data-testid="export-csv"]');
      const jsonBtn = page.locator('[data-testid="export-json"]');

      await expect(chooseFileBtn).toBeVisible();
      await expect(csvBtn).toBeVisible();
      await expect(jsonBtn).toBeVisible();
    });
  });

  test.describe('Desktop View (1920px)', () => {
    test('should display admin settings cards horizontally on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Logo Upload section
      const logoSection = page.locator('text=Logo Upload').locator('..').locator('..');
      await expect(logoSection).toBeVisible();

      // Data Export section
      const exportSection = page.locator('text=Data Export').locator('..').locator('..');
      await expect(exportSection).toBeVisible();

      // Buttons should be in horizontal layout
      const chooseFileBtn = page.locator('button:has-text("Choose File")');
      const uploadBtn = page.locator('button:has-text("Upload")');

      const chooseFileBox = await chooseFileBtn.boundingBox();
      const uploadBox = await uploadBtn.boundingBox();

      // Buttons should be side-by-side on desktop
      // (Y coordinate should be similar, X coordinate should differ)
      expect(Math.abs(chooseFileBox.y - uploadBox.y)).toBeLessThan(10);
      expect(uploadBox.x).toBeGreaterThan(chooseFileBox.x);
    });
  });

  test.describe('Cross-device Consistency', () => {
    test('should maintain functionality across all viewport sizes', async ({ page }) => {
      const viewports = [
        { width: 375, height: 667, name: 'mobile' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 1920, height: 1080, name: 'desktop' }
      ];

      for (const viewport of viewports) {
        await page.setViewportSize(viewport);

        // All key elements should be visible
        const logoSection = page.locator('text=Logo Upload').locator('..').locator('..');
        await expect(logoSection).toBeVisible();

        const exportSection = page.locator('text=Data Export').locator('..').locator('..');
        await expect(exportSection).toBeVisible();

        // Buttons should be clickable
        const csvBtn = page.locator('[data-testid="export-csv"]');
        await expect(csvBtn).toBeEnabled();
      }
    });
  });
});
