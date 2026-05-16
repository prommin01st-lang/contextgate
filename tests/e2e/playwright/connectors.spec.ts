import { test, expect } from '@playwright/test';
import {
  login,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  apiLogin,
  apiDeleteConnector,
  apiDeleteWorkspace,
} from './helpers';

const ts = Date.now();

/**
 * Connector CRUD tests via the dashboard UI.
 */

test.describe('Connectors', () => {
  let workspaceId = '';
  let token = '';

  test.beforeAll(async () => {
    token = await apiLogin();
    const res = await fetch('http://localhost:8899/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: `ConnTest ${ts}`, slug: `conntest-${ts}` }),
    });
    const data = (await res.json()) as { data: { id: string } };
    workspaceId = data.data.id;
  });

  test.afterAll(async () => {
    if (workspaceId) {
      await apiDeleteWorkspace(token, workspaceId);
    }
  });

  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/connectors');
    await page.waitForSelector('h1:has-text("Connectors")');
  });

  test('create a filesystem connector', async ({ page }) => {
    const name = `E2E FS ${ts}`;

    await page.click('button:has-text("New connector")');
    await page.waitForSelector('text=New connector');

    // Fill name
    await page.fill('#cn-name', name);

    // Select type (first combobox in ConnectorForm)
    await page.locator('button[role="combobox"]').first().click();
    await page.locator('[role="option"]:has-text("FileSystem")').click();

    // Select workspace (second combobox in ConnectorForm)
    await page.locator('button[role="combobox"]').nth(1).click();
    await page.locator(`[role="option"]:has-text("ConnTest ${ts}")`).click();

    // Fill config JSON
    await page.fill('#cn-config', JSON.stringify({ rootPath: '/data/test-data', allowedExtensions: ['.md'], maxFileSize: 1048576 }));

    await page.click('button:has-text("Create connector")');

    await expect(page.locator(`td:has-text("${name}")`).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`span:has-text("filesystem")`).first()).toBeVisible();
    await expect(page.locator(`span:has-text("Active")`).first()).toBeVisible();

    // Cleanup
    const res = await fetch('http://localhost:8899/api/connectors', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { data: Array<{ id: string; name: string }> };
    const conn = data.data.find((c) => c.name === name);
    if (conn) await apiDeleteConnector(token, conn.id);
  });

  test('search connectors filters list', async ({ page }) => {
    // Pre-create connectors via API
    const c1 = await fetch('http://localhost:8899/api/connectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId,
        type: 'filesystem',
        name: `Alpha ${ts}`,
        config: { rootPath: '/data/test-data' },
        isActive: true,
        readOnly: true,
      }),
    });
    const c1Data = (await c1.json()) as { data: { id: string } };

    const c2 = await fetch('http://localhost:8899/api/connectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId,
        type: 'postgres',
        name: `Beta ${ts}`,
        config: { host: 'localhost', database: 'test', user: 'test', password: 'test' },
        isActive: true,
        readOnly: true,
      }),
    });
    const c2Data = (await c2.json()) as { data: { id: string } };

    await page.reload();
    await page.waitForSelector(`td:has-text("Alpha ${ts}")`);

    // Search for Alpha
    await page.fill('input[placeholder="Search connectors by name or type…"]', 'Alpha');
    await expect(page.locator(`td:has-text("Alpha ${ts}")`).first()).toBeVisible();
    await expect(page.locator(`td:has-text("Beta ${ts}")`)).not.toBeVisible();

    // Cleanup
    await apiDeleteConnector(token, c1Data.data.id);
    await apiDeleteConnector(token, c2Data.data.id);
  });
});
