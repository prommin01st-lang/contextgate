import { test, expect } from '@playwright/test';
import {
  login,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  apiLogin,
  apiDeletePolicy,
  apiDeleteAgent,
  apiDeleteConnector,
  apiDeleteWorkspace,
} from './helpers';

const ts = Date.now();

/**
 * Policy CRUD tests via the dashboard UI.
 */

test.describe('Policies', () => {
  let workspaceId = '';
  let agentId = '';
  let connectorId = '';
  let token = '';

  test.beforeAll(async () => {
    token = await apiLogin();

    // Create workspace
    const wsRes = await fetch('http://localhost:8899/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: `PolicyTest ${ts}`, slug: `policytest-${ts}` }),
    });
    const wsData = (await wsRes.json()) as { data: { id: string } };
    workspaceId = wsData.data.id;

    // Create connector
    const connRes = await fetch('http://localhost:8899/api/connectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId,
        type: 'filesystem',
        name: `PolicyConn ${ts}`,
        config: { rootPath: '/data/test-data' },
        isActive: true,
        readOnly: true,
      }),
    });
    const connData = (await connRes.json()) as { data: { id: string } };
    connectorId = connData.data.id;

    // Create agent
    const agentRes = await fetch('http://localhost:8899/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId,
        name: `PolicyAgent ${ts}`,
        autoCreateDefaultPolicies: false,
      }),
    });
    const agentData = (await agentRes.json()) as { data: { id: string } };
    agentId = agentData.data.id;
  });

  test.afterAll(async () => {
    if (agentId) await apiDeleteAgent(token, agentId);
    if (connectorId) await apiDeleteConnector(token, connectorId);
    if (workspaceId) await apiDeleteWorkspace(token, workspaceId);
  });

  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/policies');
    await page.waitForSelector('h1:has-text("Policies")');
  });

  test('create a policy for an agent', async ({ page }) => {
    await page.click('button:has-text("New policy")');
    await page.waitForSelector('text=New policy');

    // Scope: agent
    await page.click('text=Per agent');
    await page.locator('button[role="combobox"]').first().click();
    await page.locator(`[role="option"]:has-text("PolicyAgent ${ts}")`).click();

    // Resource pattern
    await page.fill('#po-pattern', `filesystem://${connectorId}/**`);

    // Actions: select read and list
    await page.click('text=read');
    await page.click('text=list');

    await page.click('button:has-text("Create policy")');

    await expect(page.locator(`code:has-text("filesystem://${connectorId}/**")`).first()).toBeVisible({ timeout: 10_000 });

    // Cleanup
    const res = await fetch('http://localhost:8899/api/policies', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { data: Array<{ id: string; resourcePattern: string }> };
    const pol = data.data.find((p) => p.resourcePattern === `filesystem://${connectorId}/**`);
    if (pol) await apiDeletePolicy(token, pol.id);
  });

  test('delete a policy', async ({ page }) => {
    // Pre-create policy via API
    const polRes = await fetch('http://localhost:8899/api/policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        agentId,
        resourcePattern: `filesystem://${connectorId}/file/**`,
        actions: ['read'],
      }),
    });
    const polData = (await polRes.json()) as { data: { id: string } };

    await page.reload();
    await page.waitForSelector(`code:has-text("filesystem://${connectorId}/file/**")`);

    const row = page.locator(`tr:has-text("filesystem://${connectorId}/file/**")`);
    await row.locator('button[title="Delete"]').click();

    await page.waitForSelector('text=Delete policy?');
    await page.locator('[role="dialog"] button:has-text("Delete")').click();

    await expect(page.locator(`code:has-text("filesystem://${connectorId}/file/**")`)).not.toBeVisible({ timeout: 10_000 });
  });
});
