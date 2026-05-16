import { test, expect } from '@playwright/test';
import {
  login,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  apiLogin,
  apiDeleteUser,
} from './helpers';

const ts = Date.now();

/**
 * Users CRUD tests via the dashboard UI (admin only).
 */

test.describe('Users', () => {
  let token = '';

  test.beforeAll(async () => {
    token = await apiLogin();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/users');
    await page.waitForSelector('h1:has-text("Users")');
  });

  test('create a new user', async ({ page }) => {
    const email = `e2e-user-${ts}@example.com`;

    await page.click('button:has-text("New user")');
    await page.waitForSelector('text=New user');

    await page.fill('#u-name', 'E2E Test User');
    await page.fill('#u-email', email);
    await page.fill('input[type="password"]', 'password123');

    // Role: user (default)
    await page.click('button:has-text("Create user")');

    await expect(page.locator(`td:has-text("${email}")`).first()).toBeVisible({ timeout: 10_000 });

    // Cleanup
    const res = await fetch('http://localhost:8899/api/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { data: Array<{ id: string; email: string }> };
    const user = data.data.find((u) => u.email === email);
    if (user) await apiDeleteUser(token, user.id);
  });

  test('edit user role', async ({ page }) => {
    // Pre-create user via API
    const createRes = await fetch('http://localhost:8899/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        email: `edit-role-${ts}@example.com`,
        password: 'password123',
        name: 'RoleEditUser',
        role: 'user',
      }),
    });
    const userData = (await createRes.json()) as { data: { id: string } };

    await page.reload();
    await page.waitForSelector(`td:has-text("edit-role-${ts}@example.com")`);

    const row = page.locator(`tr:has-text("edit-role-${ts}@example.com")`);
    await row.locator('button[title="Edit"]').click();

    await page.waitForSelector('text=Edit user');
    // Change role to admin
    await page.locator('button[role="combobox"]').first().click();
    await page.locator('[role="option"]:has-text("admin")').click();
    await page.click('button:has-text("Save changes")');

    await expect(
      page.locator(`tr:has-text("edit-role-${ts}@example.com") >> span:has-text("admin")`).first()
    ).toBeVisible({ timeout: 10_000 });

    // Cleanup
    await apiDeleteUser(token, userData.data.id);
  });

  test('delete a user', async ({ page }) => {
    // Pre-create user via API
    const createRes = await fetch('http://localhost:8899/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        email: `delete-me-${ts}@example.com`,
        password: 'password123',
        name: 'DeleteMeUser',
        role: 'user',
      }),
    });
    const userData = (await createRes.json()) as { data: { id: string } };

    await page.reload();
    await page.waitForSelector(`td:has-text("delete-me-${ts}@example.com")`);

    const row = page.locator(`tr:has-text("delete-me-${ts}@example.com")`);
    await row.locator('button[title="Delete"]').click();

    await page.waitForSelector('text=Delete user?');
    await page.locator('[role="dialog"] button:has-text("Delete")').click();

    await expect(page.locator(`td:has-text("delete-me-${ts}@example.com")`)).not.toBeVisible({ timeout: 10_000 });
  });

  test('admin user cannot delete themselves', async ({ page }) => {
    // Find admin row (should have "(you)" label)
    const adminRow = page.locator('tr:has-text("(you)")');
    await expect(adminRow).toBeVisible();

    // Delete button should be disabled for self
    const deleteBtn = adminRow.locator('button[title="Cannot delete yourself"]');
    await expect(deleteBtn).toBeVisible();
    await expect(deleteBtn).toBeDisabled();
  });
});
