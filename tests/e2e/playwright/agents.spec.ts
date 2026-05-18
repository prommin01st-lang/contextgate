import { test, expect } from '@playwright/test';
import {
  login,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  apiLogin,
  apiDeleteAgent,
  apiDeleteWorkspace,
} from './helpers';

const ts = Date.now();

/**
 * Agent CRUD tests via the dashboard UI.
 */

test.describe('Agents', () => {
  let workspaceId = '';
  let token = '';

  test.beforeAll(async () => {
    token = await apiLogin();
    const res = await fetch('http://localhost:8899/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: `AgentTest ${ts}`, slug: `agenttest-${ts}` }),
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
    await page.goto('/agents');
    await page.waitForSelector('h1:has-text("Agents")');
  });

  test('create a new agent and reveal API key', async ({ page }) => {
    const name = `E2E Agent ${ts}`;

    await page.click('button:has-text("New agent")');
    await page.waitForSelector('text=New agent');

    await page.fill('#ag-name', name);

    // Select workspace
    await page.locator('button[role="combobox"]').first().click();
    await page.locator(`[role="option"]:has-text("AgentTest ${ts}")`).click();

    await page.click('button:has-text("Create agent")');

    // API key reveal dialog should appear
    await expect(page.locator('text=Save your API key')).toBeVisible({ timeout: 10_000 });
    const keyCode = page.locator('code:has-text("cg_")');
    await expect(keyCode).toBeVisible();
    const keyValue = await keyCode.textContent();
    expect(keyValue).toMatch(/^cg_[a-f0-9]{32}$/);

    // Close dialog
    await page.click('button:has-text("I\'ve saved my key")');

    // Agent should appear in list
    await expect(page.locator(`td:has-text("${name}")`).first()).toBeVisible();

    // Cleanup
    const res = await fetch('http://localhost:8899/api/agents', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { data: Array<{ id: string; name: string }> };
    const agent = data.data.find((a) => a.name === name);
    if (agent) await apiDeleteAgent(token, agent.id);
  });

  test('edit agent name', async ({ page }) => {
    // Pre-create agent via API
    const res = await fetch('http://localhost:8899/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId,
        name: `EditAgent ${ts}`,
        autoCreateDefaultPolicies: false,
      }),
    });
    const agent = (await res.json()) as { data: { id: string } };

    await page.reload();
    await page.waitForSelector(`td:has-text("EditAgent ${ts}")`);

    const row = page.locator(`tr:has-text("EditAgent ${ts}")`);
    await row.locator('button[title="Edit"]').click();

    await page.waitForSelector('text=Edit agent');
    await page.fill('#ag-name', `RenamedAgent ${ts}`);
    await page.click('button:has-text("Save changes")');

    await expect(page.locator(`td:has-text("RenamedAgent ${ts}")`).first()).toBeVisible({ timeout: 10_000 });

    // Cleanup
    await apiDeleteAgent(token, agent.data.id);
  });

  test('delete an agent', async ({ page }) => {
    // Pre-create agent via API
    const res = await fetch('http://localhost:8899/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId,
        name: `DeleteAgent ${ts}`,
        autoCreateDefaultPolicies: false,
      }),
    });
    const agent = (await res.json()) as { data: { id: string } };

    await page.reload();
    await page.waitForSelector(`td:has-text("DeleteAgent ${ts}")`);

    const row = page.locator(`tr:has-text("DeleteAgent ${ts}")`);
    await row.locator('button[title="Delete"]').click();

    await page.waitForSelector('text=Delete agent?');
    await page.locator('[role="dialog"] button:has-text("Delete")').click();

    await expect(page.locator(`td:has-text("DeleteAgent ${ts}")`)).not.toBeVisible({ timeout: 10_000 });
  });
});
