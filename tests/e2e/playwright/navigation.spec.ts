import { test, expect } from '@playwright/test';
import { login, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

/**
 * Navigation tests: visit every authenticated page and verify it loads.
 */

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test('Dashboard page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    await expect(page.locator('text=Welcome back')).toBeVisible();
    await expect(page.locator('text=Workspaces').first()).toBeVisible();
    await expect(page.locator('text=Agents').first()).toBeVisible();
    await expect(page.locator('text=Connectors').first()).toBeVisible();
  });

  test('Workspaces page loads', async ({ page }) => {
    await page.goto('/workspaces');
    await expect(page.locator('h1:has-text("Workspaces")')).toBeVisible();
    await expect(page.locator('text=Organizational boundaries')).toBeVisible();
    await expect(page.locator('button:has-text("New workspace")')).toBeVisible();
  });

  test('Connectors page loads', async ({ page }) => {
    await page.goto('/connectors');
    await expect(page.locator('h1:has-text("Connectors")')).toBeVisible();
    await expect(page.locator('text=Data sources that agents can query')).toBeVisible();
    await expect(page.locator('button:has-text("New connector")')).toBeVisible();
  });

  test('Agents page loads', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.locator('h1:has-text("Agents")')).toBeVisible();
    await expect(page.locator('text=AI clients with API keys')).toBeVisible();
    await expect(page.locator('button:has-text("New agent")')).toBeVisible();
  });

  test('Resources page loads', async ({ page }) => {
    await page.goto('/resources');
    await expect(page.locator('h1:has-text("Resources")')).toBeVisible();
    await expect(page.locator('text=Files, tables, and pages discovered')).toBeVisible();
  });

  test('Policies page loads', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.locator('h1:has-text("Policies")')).toBeVisible();
    await expect(page.locator('text=Glob-pattern rules')).toBeVisible();
    await expect(page.locator('button:has-text("New policy")')).toBeVisible();
  });

  test('Audit page loads', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.locator('h1:has-text("Audit Logs")')).toBeVisible();
    await expect(page.locator('text=Every resource access and admin action')).toBeVisible();
  });

  test('Users page loads (admin)', async ({ page }) => {
    await page.goto('/users');
    await expect(page.locator('h1:has-text("Users")')).toBeVisible();
    await expect(page.locator('text=Manage accounts and roles')).toBeVisible();
    await expect(page.locator('button:has-text("New user")')).toBeVisible();
  });

  test('Settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
    await expect(page.locator('text=Manage your account and appearance')).toBeVisible();
    await expect(page.locator('button:has-text("Sign out")')).toBeVisible();
  });

  test('Help page loads', async ({ page }) => {
    await page.goto('/help');
    await expect(page.locator('h1:has-text("Help & Guide")')).toBeVisible();
    await expect(page.locator('text=Learn how to set up ContextGate')).toBeVisible();
  });

  test('sidebar navigation works for all links', async ({ page }) => {
    const links = [
      { label: 'Dashboard', heading: 'Dashboard' },
      { label: 'Workspaces', heading: 'Workspaces' },
      { label: 'Connectors', heading: 'Connectors' },
      { label: 'Agents', heading: 'Agents' },
      { label: 'Resources', heading: 'Resources' },
      { label: 'Policies', heading: 'Policies' },
      { label: 'Audit', heading: 'Audit Logs' },
      { label: 'Users', heading: 'Users' },
      { label: 'Help', heading: 'Help & Guide' },
      { label: 'Settings', heading: 'Settings' },
    ];

    for (const link of links) {
      await page.locator(`nav >> a:has-text("${link.label}")`).click();
      await expect(page.locator(`h1:has-text("${link.heading}")`)).toBeVisible();
    }
  });
});
