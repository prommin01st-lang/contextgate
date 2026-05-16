import { test, expect } from '@playwright/test';
import { login, logout, ADMIN_EMAIL, ADMIN_PASSWORD, API_URL, apiDeleteUser } from './helpers';

const ts = Date.now();

/**
 * Authentication flow tests:
 * - Login with valid credentials
 * - Login with invalid credentials shows error
 * - Register new account
 * - Logout redirects to login
 * - Authenticated user visiting /login gets redirected to /
 */

test.describe('Auth', () => {
  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'wrong@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('register new account and auto-login', async ({ page }) => {
    const email = `e2e-register-${ts}@example.com`;
    await page.goto('/register');
    await page.waitForSelector('h1:has-text("Create your account")');
    await page.fill('input[type="text"]', 'E2E Test User');
    await page.fill('input[type="email"]', email);
    await page.fill('input[placeholder="At least 6 characters"]', 'password123');
    await page.fill('input[placeholder="Re-enter password"]', 'password123');
    await page.click('button[type="submit"]');
    // Should redirect to dashboard after successful registration
    await page.waitForURL('/', { timeout: 10_000 });
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();

    // Cleanup
    const token = await (
      await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      })
    )
      .json()
      .then((d: any) => d.token);

    // Find and delete the test user
    const usersRes = await fetch(`${API_URL}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const usersData = (await usersRes.json()) as { data: Array<{ id: string; email: string }> };
    const user = usersData.data.find((u) => u.email === email);
    if (user) {
      await apiDeleteUser(token, user.id);
    }
  });

  test('authenticated user visiting /login redirects to dashboard', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/login');
    await page.waitForURL('/', { timeout: 10_000 });
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
  });

  test('logout redirects to login page', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await logout(page);
    await expect(page).toHaveURL('/login');
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForURL('/login', { timeout: 10_000 });
    await expect(page.locator('h1:has-text("Welcome back")')).toBeVisible();
  });
});
