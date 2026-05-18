import { Page, expect } from '@playwright/test';

export const ADMIN_EMAIL = 'admin@contextgate.local';
export const ADMIN_PASSWORD = 'password123';
export const API_URL = process.env.API_URL ?? 'http://localhost:8899';

/**
 * Log in via the UI. Assumes we are on the login page or will be redirected there.
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForSelector('h1:has-text("Welcome back")');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for navigation to dashboard
  await page.waitForURL('/', { timeout: 10_000 });
  await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
}

/**
 * Log out via the settings page.
 */
export async function logout(page: Page) {
  await page.goto('/settings');
  await page.waitForSelector('h1:has-text("Settings")');
  await page.click('button:has-text("Sign out")');
  await page.waitForURL('/login', { timeout: 10_000 });
  await expect(page.locator('h1:has-text("Welcome back")')).toBeVisible();
}

/**
 * Clean up test data via API using admin credentials.
 */
export async function apiLogin(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const data = await res.json();
  return data.token as string;
}

export async function apiDeleteWorkspace(token: string, id: string) {
  await fetch(`${API_URL}/api/workspaces/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function apiDeleteConnector(token: string, id: string) {
  await fetch(`${API_URL}/api/connectors/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function apiDeleteAgent(token: string, id: string) {
  await fetch(`${API_URL}/api/agents/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function apiDeletePolicy(token: string, id: string) {
  await fetch(`${API_URL}/api/policies/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function apiDeleteUser(token: string, id: string) {
  await fetch(`${API_URL}/api/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Wait for a toast message to appear and disappear.
 */
export async function expectToast(page: Page, text: string) {
  const toast = page.locator(`[role="status"]:has-text("${text}")`).first();
  await expect(toast).toBeVisible({ timeout: 10_000 });
}
