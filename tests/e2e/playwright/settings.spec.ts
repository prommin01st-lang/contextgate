import { test, expect } from '@playwright/test';
import { login, logout, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

/**
 * Settings and Help page tests.
 */

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test('settings page shows account info', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
    await expect(page.locator('h2:has-text("Account")')).toBeVisible();
    await expect(page.locator(`text=${ADMIN_EMAIL}`)).toBeVisible();
    await expect(page.locator('span:has-text("admin")').first()).toBeVisible();
  });

  test('theme switcher shows light/dark/system options', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h2:has-text("Appearance")')).toBeVisible();
    await expect(page.locator('button:has-text("Light")')).toBeVisible();
    await expect(page.locator('button:has-text("Dark")')).toBeVisible();
    await expect(page.locator('button:has-text("System")')).toBeVisible();

    // Click Dark and verify active state
    await page.click('button:has-text("Dark")');
    await expect(page.locator('button:has-text("Dark")')).toHaveClass(/ring-2/);

    // Click Light and verify active state
    await page.click('button:has-text("Light")');
    await expect(page.locator('button:has-text("Light")')).toHaveClass(/ring-2/);
  });

  test('about section shows version and API endpoint', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h2:has-text("About")')).toBeVisible();
    await expect(page.locator('dd:has-text("v0.1.0")')).toBeVisible();
    await expect(page.locator('dt:has-text("API Endpoint")')).toBeVisible();
  });

  test('sign out from settings redirects to login', async ({ page }) => {
    await page.goto('/settings');
    await logout(page);
    await expect(page).toHaveURL('/login');
  });
});

test.describe('Help', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test('help page shows documentation sections', async ({ page }) => {
    await page.goto('/help');
    await expect(page.locator('h1:has-text("Help & Guide")')).toBeVisible();
    await expect(page.locator('h2:has-text("What is ContextGate?")')).toBeVisible();
    await expect(page.locator('h2:has-text("Quick start")')).toBeVisible();
    await expect(page.locator('h2:has-text("Agents & API keys")')).toBeVisible();
    await expect(page.locator('h2:has-text("Policies")')).toBeVisible();
    await expect(page.locator('h2:has-text("Audit logs")')).toBeVisible();
    await expect(page.locator('h2:has-text("Common issues")')).toBeVisible();
  });

  test('table of contents links scroll to sections', async ({ page }) => {
    await page.goto('/help');
    await page.click('a:has-text("Policies")');
    await expect(page.locator('h2:has-text("Policies")')).toBeVisible();
  });
});
