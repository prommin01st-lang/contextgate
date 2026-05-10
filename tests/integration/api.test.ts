import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";

// Simple helper to check if a PostgreSQL DB is reachable
async function isDbReachable(): Promise<boolean> {
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5432/contextgate_test",
      connectionTimeoutMillis: 2000,
    });
    await pool.query("SELECT 1");
    await pool.end();
    return true;
  } catch {
    return false;
  }
}

describe("API Route Modules", () => {
  it("auth routes export a Hono router", async () => {
    const { authRoutes } = await import("../../apps/server/src/routes/auth.js");
    expect(authRoutes).toBeInstanceOf(Hono);
  });

  it("workspace routes export a Hono router", async () => {
    const { workspaceRoutes } = await import("../../apps/server/src/routes/workspaces.js");
    expect(workspaceRoutes).toBeInstanceOf(Hono);
  });

  it("agent routes export a Hono router", async () => {
    const { agentRoutes } = await import("../../apps/server/src/routes/agents.js");
    expect(agentRoutes).toBeInstanceOf(Hono);
  });

  it("connector routes export a Hono router", async () => {
    const { connectorRoutes } = await import("../../apps/server/src/routes/connectors.js");
    expect(connectorRoutes).toBeInstanceOf(Hono);
  });

  it("audit-log routes export a Hono router", async () => {
    const { auditLogRoutes } = await import("../../apps/server/src/routes/audit-logs.js");
    expect(auditLogRoutes).toBeInstanceOf(Hono);
  });
});

describe("API Integration Tests", () => {
  let app: Hono;
  let dbReachable = false;
  let authToken: string;

  beforeAll(async () => {
    dbReachable = await isDbReachable();
    if (!dbReachable) {
      console.warn("PostgreSQL not reachable — skipping full integration tests");
      return;
    }

    // Set test env vars before importing the server
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/contextgate_test";

    const { default: serverApp } = await import("../../apps/server/src/server.js");
    app = serverApp;
  });

  const skipIfNoDb = () => !dbReachable;

  it.skipIf(skipIfNoDb)(
    "POST /auth/register returns 201 and a JWT token",
    async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `test-${Date.now()}@example.com`,
          password: "password123",
          name: "Test User",
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe("string");
      expect(body.user).toBeDefined();
      authToken = body.token;
    }
  );

  it.skipIf(skipIfNoDb)(
    "POST /auth/login returns 200 and a JWT token",
    async () => {
      // First register a user so we can log in
      const email = `login-${Date.now()}@example.com`;
      await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: "password123",
          name: "Login Test User",
        }),
      });

      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: "password123",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe("string");
      authToken = body.token;
    }
  );

  it.skipIf(skipIfNoDb)(
    "GET /api/workspaces with Bearer token returns 200 and array",
    async () => {
      // Ensure we have a token
      if (!authToken) {
        const email = `ws-${Date.now()}@example.com`;
        const reg = await app.request("/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: "password123",
            name: "WS Test User",
          }),
        });
        const regBody = await reg.json();
        authToken = regBody.token;
      }

      const res = await app.request("/api/workspaces", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
    }
  );

  it.skipIf(skipIfNoDb)(
    "POST /api/workspaces creates a workspace",
    async () => {
      if (!authToken) {
        const email = `ws2-${Date.now()}@example.com`;
        const reg = await app.request("/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: "password123",
            name: "WS2 Test User",
          }),
        });
        const regBody = await reg.json();
        authToken = regBody.token;
      }

      const res = await app.request("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: `Test Workspace ${Date.now()}`,
          slug: `test-ws-${Date.now()}`,
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.id).toBeDefined();
    }
  );

  it.skipIf(skipIfNoDb)(
    "GET /api/agents returns 200",
    async () => {
      if (!authToken) {
        const email = `agent-${Date.now()}@example.com`;
        const reg = await app.request("/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: "password123",
            name: "Agent Test User",
          }),
        });
        const regBody = await reg.json();
        authToken = regBody.token;
      }

      const res = await app.request("/api/agents", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
    }
  );

  it.skipIf(skipIfNoDb)(
    "GET /api/connectors returns 200",
    async () => {
      if (!authToken) {
        const email = `conn-${Date.now()}@example.com`;
        const reg = await app.request("/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: "password123",
            name: "Conn Test User",
          }),
        });
        const regBody = await reg.json();
        authToken = regBody.token;
      }

      const res = await app.request("/api/connectors", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
    }
  );
});
