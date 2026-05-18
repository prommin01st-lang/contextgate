import { test, expect } from '@playwright/test';
import {
  login,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  apiLogin,
  apiDeleteWorkspace,
} from './helpers';

const ts = Date.now();

/**
 * Workspace CRUD tests via the dashboard UI.
 */

test.describe('Workspaces', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/workspaces');
    await page.waitForSelector('h1:has-text("Workspaces")');
  });

  test('create a new workspace', async ({ page }) => {
    const name = `E2E Workspace ${ts}`;
    const slug = `e2e-workspace-${ts}`;

    await page.click('button:has-text("New workspace")');
    await page.waitForSelector('text=New workspace');
    await page.fill('#ws-name', name);
    await page.fill('#ws-slug', slug);
    await page.click('button:has-text("Create workspace")');

    // Wait for the workspace to appear in the table
    await expect(page.locator(`td:has-text("${name}")`).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`code:has-text("${slug}")`).first()).toBeVisible();

    // Cleanup
    const token = await apiLogin();
    const row = page.locator(`tr:has-text("${name}")`);
    const slugCell = row.locator('code').first();
    const actualSlug = await slugCell.textContent();
    if (actualSlug) {
      // Find workspace id via API and delete
      const res = await fetch('http://localhost:8899/api/workspaces', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { data: Array<{ id: string; slug: string }> };
      const ws = data.data.find((w) => w.slug === actualSlug.trim());
      if (ws) await apiDeleteWorkspace(token, ws.id);
    }
  });

  test('edit workspace name', async ({ page }) => {
    // Pre-create a workspace via API
    const token = await apiLogin();
    const createRes = await fetch('http://localhost:8899/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: `EditMe ${ts}`, slug: `editme-${ts}` }),
    });
    const ws = (await createRes.json()) as { data: { id: string; name: string; slug: string } };

    await page.reload();
    await page.waitForSelector(`td:has-text("EditMe ${ts}")`);

    // Click edit button on the row
    const row = page.locator(`tr:has-text("EditMe ${ts}")`);
    await row.locator('button[title="Edit"]').click();

    await page.waitForSelector('text=Edit workspace');
    await page.fill('#ws-name', `Edited ${ts}`);
    await page.click('button:has-text("Save changes")');

    await expect(page.locator(`td:has-text("Edited ${ts}")`).first()).toBeVisible({ timeout: 10_000 });

    // Cleanup
    await apiDeleteWorkspace(token, ws.data.id);
  });

  test('delete a workspace', async ({ page }) => {
    // Pre-create a workspace via API
    const token = await apiLogin();
    const createRes = await fetch('http://localhost:8899/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: `DeleteMe ${ts}`, slug: `deleteme-${ts}` }),
    });
    const ws = (await createRes.json()) as { data: { id: string; name: string; slug: string } };

    await page.reload();
    await page.waitForSelector(`td:has-text("DeleteMe ${ts}")`);

    const row = page.locator(`tr:has-text("DeleteMe ${ts}")`);
    await row.locator('button[title="Delete"]').click();

    await page.waitForSelector('text=Delete workspace?');
    await page.locator('[role="dialog"] button:has-text("Delete")').click();

    await expect(page.locator(`td:has-text("DeleteMe ${ts}")`)).not.toBeVisible({ timeout: 10_000 });
  });
});
