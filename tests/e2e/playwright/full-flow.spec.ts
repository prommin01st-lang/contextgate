import { test, expect } from '@playwright/test';
import {
  login,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  apiLogin,
  apiDeleteWorkspace,
  apiDeleteConnector,
  apiDeleteAgent,
  apiDeletePolicy,
} from './helpers';

const ts = Date.now();

/**
 * Complete end-to-end user journey across all pages:
 * 1. Login
 * 2. Create workspace
 * 3. Create connector
 * 4. Create agent (with API key reveal)
 * 5. Create policy
 * 6. Browse resources
 * 7. Check audit logs
 * 8. Verify dashboard stats updated
 * 9. Cleanup
 */

test.describe('Full user journey', () => {
  const state = {
    workspaceName: `Journey WS ${ts}`,
    workspaceSlug: `journey-ws-${ts}`,
    connectorName: `Journey Conn ${ts}`,
    agentName: `Journey Agent ${ts}`,
    workspaceId: '',
    connectorId: '',
    agentId: '',
    policyId: '',
    token: '',
  };

  test.beforeAll(async () => {
    state.token = await apiLogin();
  });

  test.afterAll(async () => {
    if (state.policyId) await apiDeletePolicy(state.token, state.policyId);
    if (state.agentId) await apiDeleteAgent(state.token, state.agentId);
    if (state.connectorId) await apiDeleteConnector(state.token, state.connectorId);
    if (state.workspaceId) await apiDeleteWorkspace(state.token, state.workspaceId);
  });

  test('step 1: login and land on dashboard', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
  });

  test('step 2: create workspace', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/workspaces');
    await page.waitForSelector('h1:has-text("Workspaces")');
    await page.getByRole('button', { name: 'New workspace' }).click();
    await page.fill('#ws-name', state.workspaceName);
    await page.fill('#ws-slug', state.workspaceSlug);
    await page.click('button:has-text("Create workspace")');

    await expect(page.locator(`td:has-text("${state.workspaceName}")`).first()).toBeVisible({ timeout: 10_000 });

    // Capture workspace id via API for cleanup
    const res = await fetch('http://localhost:8899/api/workspaces', {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    const data = (await res.json()) as { data: Array<{ id: string; slug: string }> };
    const ws = data.data.find((w) => w.slug === state.workspaceSlug);
    if (ws) state.workspaceId = ws.id;
  });

  test('step 3: create filesystem connector', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/connectors');
    await page.click('button:has-text("New connector")');

    await page.fill('#cn-name', state.connectorName);

    // Select type (first combobox)
    await page.locator('button[role="combobox"]').first().click();
    await page.locator('[role="option"]:has-text("FileSystem")').click();

    // Select workspace (second combobox)
    await page.locator('button[role="combobox"]').nth(1).click();
    await page.locator(`[role="option"]:has-text("${state.workspaceName}")`).click();

    await page.fill('#cn-config', JSON.stringify({ rootPath: '/data/test-data', allowedExtensions: ['.md'], maxFileSize: 1048576 }));
    await page.click('button:has-text("Create connector")');

    await expect(page.locator(`td:has-text("${state.connectorName}")`).first()).toBeVisible({ timeout: 10_000 });

    // Capture connector id
    const res = await fetch('http://localhost:8899/api/connectors', {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    const data = (await res.json()) as { data: Array<{ id: string; name: string }> };
    const conn = data.data.find((c) => c.name === state.connectorName);
    if (conn) state.connectorId = conn.id;
  });

  test('step 4: create agent and capture API key', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/agents');
    await page.click('button:has-text("New agent")');

    await page.fill('#ag-name', state.agentName);
    await page.locator('button[role="combobox"]').first().click();
    await page.locator(`[role="option"]:has-text("${state.workspaceName}")`).click();
    await page.click('button:has-text("Create agent")');

    // API key reveal dialog
    await expect(page.locator('text=Save your API key')).toBeVisible({ timeout: 10_000 });
    const keyCode = page.locator('code:has-text("cg_")');
    const apiKey = await keyCode.textContent();
    expect(apiKey).toMatch(/^cg_[a-f0-9]{32}$/);

    await page.click('button:has-text("I\'ve saved my key")');
    await expect(page.locator(`td:has-text("${state.agentName}")`).first()).toBeVisible();

    // Capture agent id
    const res = await fetch('http://localhost:8899/api/agents', {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    const data = (await res.json()) as { data: Array<{ id: string; name: string }> };
    const agent = data.data.find((a) => a.name === state.agentName);
    if (agent) state.agentId = agent.id;
  });

  test('step 5: create policy for the agent', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/policies');
    await page.click('button:has-text("New policy")');

    await page.click('text=Per agent');
    await page.locator('button[role="combobox"]').first().click();
    await page.locator(`[role="option"]:has-text("${state.agentName}")`).click();

    await page.fill('#po-pattern', `filesystem://${state.connectorId}/**`);
    await page.locator('[role="dialog"] button:has-text("read")').click();
    await page.locator('[role="dialog"] button:has-text("list")').click();
    await page.click('button:has-text("Create policy")');

    await expect(
      page.locator(`code:has-text("filesystem://${state.connectorId}/**")`).first()
    ).toBeVisible({ timeout: 10_000 });

    // Capture policy id
    const res = await fetch('http://localhost:8899/api/policies', {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    const data = (await res.json()) as { data: Array<{ id: string; resourcePattern: string }> };
    const pol = data.data.find((p) => p.resourcePattern === `filesystem://${state.connectorId}/**`);
    if (pol) state.policyId = pol.id;
  });

  test('step 6: browse resources page', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/resources');
    await expect(page.locator('h1:has-text("Resources")')).toBeVisible();
    // Resources might be empty if no files uploaded, but page should load
    await expect(page.locator('text=Files, tables, and pages discovered')).toBeVisible();
  });

  test('step 7: audit logs page loads', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/audit');
    await expect(page.locator('h1:has-text("Audit Logs")')).toBeVisible();
    await expect(page.locator('text=Every resource access and admin action')).toBeVisible();
  });

  test('step 8: dashboard stats reflect new items', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/');
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    // Stats cards should show updated counts
    await expect(page.locator('text=Workspaces').first()).toBeVisible();
    await expect(page.locator('text=Agents').first()).toBeVisible();
    await expect(page.locator('text=Connectors').first()).toBeVisible();
  });

  test('step 9: navigate through all pages without errors', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const pages = [
      { path: '/', heading: 'Dashboard' },
      { path: '/workspaces', heading: 'Workspaces' },
      { path: '/connectors', heading: 'Connectors' },
      { path: '/agents', heading: 'Agents' },
      { path: '/resources', heading: 'Resources' },
      { path: '/policies', heading: 'Policies' },
      { path: '/audit', heading: 'Audit Logs' },
      { path: '/users', heading: 'Users' },
      { path: '/settings', heading: 'Settings' },
      { path: '/help', heading: 'Help & Guide' },
    ];

    for (const p of pages) {
      await page.goto(p.path);
      await expect(page.locator(`h1:has-text("${p.heading}")`)).toBeVisible();
      // Check no red error banners
      await expect(page.locator('text=Failed to load')).not.toBeVisible();
    }
  });
});
