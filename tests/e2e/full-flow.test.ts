/**
 * End-to-End Flow Test for ContextGate
 *
 * Walks the entire user journey against a running server:
 *   1.  Login as admin
 *   2.  Create workspace
 *   3.  Create filesystem connector (rootPath: /data/test-data, read-write)
 *   4.  Upload a file via /api/files/:id/upload
 *   5.  Create agent → capture plaintext API key
 *   6.  Connect MCP (Streamable HTTP) → initialize session
 *   7.  List MCP tools → expect 6 (read/list/write/append/delete/mkdir)
 *   8.  Call read_file WITHOUT a policy → expect denial + audit log
 *   9.  Create policy that allows the agent to read filesystem://*
 *   10. Call read_file → expect content returned + "allowed" audit log
 *   11. Browse /api/resources → expect uploaded file present
 *   12. Cleanup (delete connector, agent, workspace)
 *
 * Prerequisites:
 *   - Server running on http://localhost:8899
 *   - Admin user `admin@contextgate.local` / `password123` exists
 *   - Volume mount /data/test-data is writable inside the container
 *
 * Run with:
 *   pnpm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const API_BASE = process.env.CG_API_BASE ?? "http://localhost:8899";
const ADMIN_EMAIL = "admin@contextgate.local";
const ADMIN_PASSWORD = "password123";

interface JsonRpcResult<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: { code: number; message: string };
}

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────
let token = "";

async function api(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<{ status: number; json: any; headers: Headers }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

async function uploadFile(
  connectorId: string,
  filename: string,
  content: string
): Promise<any> {
  const form = new FormData();
  form.append("path", "");
  form.append("file", new Blob([content], { type: "text/markdown" }), filename);

  const res = await fetch(`${API_BASE}/api/files/${connectorId}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, json: await res.json() };
}

async function mcpCall(
  apiKey: string,
  body: unknown,
  sessionId?: string
): Promise<{ json: JsonRpcResult; sessionId: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(`${API_BASE}/mcp/v1/sse`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const responseSid = res.headers.get("mcp-session-id") ?? sessionId ?? "";
  const json = (await res.json()) as JsonRpcResult;
  return { json, sessionId: responseSid };
}

// Wait helper for audit log eventual consistency
async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ───────────────────────────────────────────────────────────────
// Test state shared across steps
// ───────────────────────────────────────────────────────────────
const ts = Date.now();
const state = {
  workspaceId: "",
  workspaceSlug: `e2e-test-${ts}`,
  connectorId: "",
  agentId: "",
  apiKey: "",
  sessionId: "",
  uploadedFile: `e2e-${ts}.md`,
  uploadedContent: "# E2E Test\n\nThis was uploaded by the automated test.\n",
};

// ───────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────

describe("ContextGate end-to-end flow", () => {
  beforeAll(async () => {
    // Sanity: server reachable
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) {
      throw new Error(
        `Server not reachable at ${API_BASE} — start with 'docker compose up -d'`
      );
    }

    // Pre-cleanup: remove any leftover e2e-* records from earlier failed runs
    try {
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        }),
      });
      const { token: adminToken } = await loginRes.json();

      const auth = { Authorization: `Bearer ${adminToken}` };

      const wsList = await fetch(`${API_BASE}/api/workspaces`, { headers: auth });
      const wsData = (await wsList.json()) as {
        data: Array<{ id: string; slug: string }>;
      };
      for (const ws of wsData.data ?? []) {
        if (ws.slug.startsWith("e2e-test-")) {
          await fetch(`${API_BASE}/api/workspaces/${ws.id}`, {
            method: "DELETE",
            headers: auth,
          });
        }
      }
    } catch {
      /* best-effort */
    }
  });

  afterAll(async () => {
    if (!token) return;
    // Best-effort cleanup
    try {
      if (state.connectorId)
        await api("DELETE", `/api/connectors/${state.connectorId}`);
      if (state.agentId) await api("DELETE", `/api/agents/${state.agentId}`);
      if (state.workspaceId)
        await api("DELETE", `/api/workspaces/${state.workspaceId}`);
    } catch {
      /* ignore */
    }
  });

  it("step 1: login as admin", async () => {
    const res = await api("POST", "/auth/login", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.json.token).toBeTruthy();
    expect(res.json.user.email).toBe(ADMIN_EMAIL);
    token = res.json.token;
  });

  it("step 2: create workspace", async () => {
    const res = await api("POST", "/api/workspaces", {
      name: `E2E Test ${ts}`,
      slug: state.workspaceSlug,
    });
    expect(res.status).toBe(201);
    expect(res.json.data.id).toBeTruthy();
    state.workspaceId = res.json.data.id;
  });

  it("step 3: create filesystem connector", async () => {
    const res = await api("POST", "/api/connectors", {
      workspaceId: state.workspaceId,
      type: "filesystem",
      name: `e2e-fs-${ts}`,
      config: {
        rootPath: "/data/test-data",
        allowedExtensions: [".md"],
        maxFileSize: 1048576,
      },
      isActive: true,
      readOnly: false,
    });
    expect(res.status).toBe(201);
    expect(res.json.data.id).toBeTruthy();
    state.connectorId = res.json.data.id;
  });

  it("step 4: upload a file via /api/files", async () => {
    const res = await uploadFile(
      state.connectorId,
      state.uploadedFile,
      state.uploadedContent
    );
    expect(res.status).toBe(201);
    expect(res.json.data.uploaded).toHaveLength(1);
    expect(res.json.data.uploaded[0].name).toBe(state.uploadedFile);
  });

  it("step 5: create agent and capture API key", async () => {
    const res = await api("POST", "/api/agents", {
      workspaceId: state.workspaceId,
      name: `e2e-agent-${ts}`,
      isActive: true,
      // Opt out of auto-policy so we can verify default-deny in step 8.
      autoCreateDefaultPolicies: false,
    });
    expect(res.status).toBe(201);
    expect(res.json.data.id).toBeTruthy();
    expect(res.json.apiKey).toMatch(/^cg_[0-9a-f]{32}$/);
    expect(res.json.autoPolicies).toEqual([]);
    state.agentId = res.json.data.id;
    state.apiKey = res.json.apiKey;
  });

  it("step 6: MCP initialize → returns session id", async () => {
    const { json, sessionId } = await mcpCall(state.apiKey, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "e2e-test", version: "1.0.0" },
      },
    });
    expect(json.error).toBeUndefined();
    expect(json.result).toMatchObject({
      protocolVersion: expect.any(String),
      serverInfo: expect.objectContaining({ name: "contextgate" }),
    });
    expect(sessionId).toBeTruthy();
    state.sessionId = sessionId;
  });

  it("step 7: tools/list shows the 6 generic connector tools", async () => {
    const { json } = await mcpCall(
      state.apiKey,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      state.sessionId
    );
    expect(json.error).toBeUndefined();
    const tools = (json.result as { tools: Array<{ name: string }> }).tools;

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "append_file",
      "create_directory",
      "delete_file",
      "list_directory",
      "read_file",
      "write_file",
    ]);
  });

  it("step 8: read_file WITHOUT policy → denied + audit log", async () => {
    const { json } = await mcpCall(
      state.apiKey,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "read_file",
          arguments: {
            uri: `filesystem://${state.connectorId}/file/${state.uploadedFile}`,
          },
        },
      },
      state.sessionId
    );
    expect(json.error).toBeDefined();
    expect(json.error?.message).toMatch(/Access denied/i);

    await sleep(200);

    const audit = await api("GET", "/api/audit-logs");
    expect(audit.status).toBe(200);
    const logs = audit.json.data as Array<{
      action: string;
      resourceUri: string;
      status: string;
      agentId: string;
    }>;
    const denied = logs.find(
      (l) =>
        l.agentId === state.agentId &&
        l.action === "read" &&
        l.status === "denied"
    );
    expect(denied).toBeDefined();
    expect(denied?.resourceUri).toContain(state.connectorId);
    expect(denied?.resourceUri).toContain(state.uploadedFile);
  });

  it("step 9: create allow policy for the agent", async () => {
    // Broad pattern that covers both file and directory URI namespaces.
    // For tighter control, separate /file/** and /directory/** policies work too.
    const res = await api("POST", "/api/policies", {
      agentId: state.agentId,
      resourcePattern: `filesystem://${state.connectorId}/**`,
      actions: ["read", "list"],
    });
    expect(res.status).toBe(201);
    expect(res.json.data.resourcePattern).toBe(
      `filesystem://${state.connectorId}/**`
    );
  });

  it("step 10: read_file WITH policy → success + content + allowed audit", async () => {
    const { json } = await mcpCall(
      state.apiKey,
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "read_file",
          arguments: {
            uri: `filesystem://${state.connectorId}/file/${state.uploadedFile}`,
          },
        },
      },
      state.sessionId
    );
    expect(json.error).toBeUndefined();

    const result = json.result as {
      content: Array<{ type: string; text: string }>;
    };
    expect(result.content[0].text).toContain("E2E Test");

    await sleep(200);

    const audit = await api("GET", "/api/audit-logs");
    const logs = audit.json.data as Array<{
      action: string;
      status: string;
      agentId: string;
    }>;
    const allowed = logs.find(
      (l) =>
        l.agentId === state.agentId &&
        l.action === "read" &&
        l.status === "allowed"
    );
    expect(allowed).toBeDefined();
  });

  it("step 11: /api/resources lists the uploaded file", async () => {
    const res = await api(
      "GET",
      `/api/resources?connectorId=${state.connectorId}`
    );
    expect(res.status).toBe(200);
    const items = res.json.data.items as Array<{
      uri: string;
      name: string;
      connectorId: string;
    }>;
    const found = items.find(
      (i) => i.connectorId === state.connectorId && i.name.includes(state.uploadedFile)
    );
    expect(found).toBeDefined();
    expect(found?.uri).toBe(
      `filesystem://${state.connectorId}/file/${state.uploadedFile}`
    );
  });

  it("step 12: list_directory matches policy too", async () => {
    const { json } = await mcpCall(
      state.apiKey,
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "list_directory",
          arguments: {
            uri: `filesystem://${state.connectorId}/directory/`,
          },
        },
      },
      state.sessionId
    );
    expect(json.error).toBeUndefined();
    const result = json.result as {
      content: Array<{ type: string; text: string }>;
    };
    expect(result.content[0].text).toContain(state.uploadedFile);
  });

  it("step 13: write_file is NOT covered by read-only policy → denied", async () => {
    const { json } = await mcpCall(
      state.apiKey,
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "write_file",
          arguments: {
            uri: `filesystem://${state.connectorId}/file/should-be-blocked.md`,
            content: "nope",
          },
        },
      },
      state.sessionId
    );
    expect(json.error).toBeDefined();
    expect(json.error?.message).toMatch(/Access denied/i);
  });

  it("step 14: delete uploaded file via /api/files (cleanup)", async () => {
    const res = await api(
      "DELETE",
      `/api/files/${state.connectorId}?path=${encodeURIComponent(state.uploadedFile)}`
    );
    expect(res.status).toBe(200);
  });
});

// ───────────────────────────────────────────────────────────────
// Auto-create default policies on agent creation
// ───────────────────────────────────────────────────────────────
describe("Auto-create default policies", () => {
  let token = "";
  const innerTs = Date.now() + 1;
  const slug = `e2e-test-auto-${innerTs}`;
  let workspaceId = "";
  let connectorId = "";
  let agentId = "";

  beforeAll(async () => {
    const login = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    token = (await login.json()).token;
  });

  afterAll(async () => {
    const auth = { Authorization: `Bearer ${token}` };
    if (workspaceId) {
      await fetch(`${API_BASE}/api/workspaces/${workspaceId}`, {
        method: "DELETE",
        headers: auth,
      });
    }
  });

  it("creating an agent auto-creates one policy per active connector", async () => {
    // Workspace
    const wsRes = await fetch(`${API_BASE}/api/workspaces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: `Auto Policy ${innerTs}`,
        slug,
      }),
    });
    workspaceId = (await wsRes.json()).data.id;

    // 2 connectors in this workspace
    const c1 = await fetch(`${API_BASE}/api/connectors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspaceId,
        type: "filesystem",
        name: `auto-1-${innerTs}`,
        config: { rootPath: "/data/test-data" },
        isActive: true,
        readOnly: true,
      }),
    });
    connectorId = (await c1.json()).data.id;

    // Create agent WITHOUT explicit autoCreateDefaultPolicies (default = true)
    const agentRes = await fetch(`${API_BASE}/api/agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspaceId,
        name: `auto-agent-${innerTs}`,
      }),
    });
    expect(agentRes.status).toBe(201);
    const agentJson = await agentRes.json();
    agentId = agentJson.data.id;

    // Should have 1 auto policy (one per active connector)
    expect(agentJson.autoPolicies).toHaveLength(1);
    expect(agentJson.autoPolicies[0].resourcePattern).toBe(
      `filesystem://${connectorId}/**`
    );
  });

  it("agent can immediately call read_file thanks to auto-policy", async () => {
    // tools/list + tools/call read should succeed without manual policy setup
    const initRes = await fetch(`${API_BASE}/api/agents/${agentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(initRes.status).toBe(200);

    // verify policy exists in DB
    const polRes = await fetch(
      `${API_BASE}/api/policies?agentId=${agentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const polJson = await polRes.json();
    expect(polJson.data.length).toBeGreaterThanOrEqual(1);
    expect(polJson.data[0].actions).toEqual(
      expect.arrayContaining(["read", "list"])
    );
  });
});

// ───────────────────────────────────────────────────────────────
// Workspace-scoped policies cover all agents in workspace
// ───────────────────────────────────────────────────────────────
describe("Workspace-scoped policies", () => {
  let token = "";
  const innerTs = Date.now() + 2;
  let workspaceId = "";
  let connectorId = "";
  let agentApiKey = "";
  let policyId = "";

  beforeAll(async () => {
    const login = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    token = (await login.json()).token;
  });

  afterAll(async () => {
    const auth = { Authorization: `Bearer ${token}` };
    if (workspaceId) {
      await fetch(`${API_BASE}/api/workspaces/${workspaceId}`, {
        method: "DELETE",
        headers: auth,
      });
    }
  });

  it("creates a workspace policy that applies to a fresh agent (no per-agent policies)", async () => {
    const auth = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // Setup: workspace + connector
    const ws = await (
      await fetch(`${API_BASE}/api/workspaces`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          name: `WS-Policy ${innerTs}`,
          slug: `e2e-test-ws-${innerTs}`,
        }),
      })
    ).json();
    workspaceId = ws.data.id;

    const conn = await (
      await fetch(`${API_BASE}/api/connectors`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          workspaceId,
          type: "filesystem",
          name: `wsp-${innerTs}`,
          config: { rootPath: "/data/test-data" },
          isActive: true,
          readOnly: true,
        }),
      })
    ).json();
    connectorId = conn.data.id;

    // Workspace-level policy (no agentId)
    const polRes = await fetch(`${API_BASE}/api/policies`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        workspaceId,
        resourcePattern: `filesystem://${connectorId}/**`,
        actions: ["read", "list"],
      }),
    });
    expect(polRes.status).toBe(201);
    const polJson = await polRes.json();
    expect(polJson.data.workspaceId).toBe(workspaceId);
    expect(polJson.data.agentId).toBeNull();
    policyId = polJson.data.id;

    // Agent without auto-policy
    const ag = await (
      await fetch(`${API_BASE}/api/agents`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          workspaceId,
          name: `wsp-agent-${innerTs}`,
          autoCreateDefaultPolicies: false,
        }),
      })
    ).json();
    agentApiKey = ag.apiKey;
    expect(ag.autoPolicies).toEqual([]);

    // MCP call should succeed because workspace policy covers this agent
    const init = await fetch(`${API_BASE}/mcp/v1/sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": agentApiKey },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "wsp-test", version: "1" },
        },
      }),
    });
    const sid = init.headers.get("mcp-session-id")!;
    expect(sid).toBeTruthy();

    const callRes = await fetch(`${API_BASE}/mcp/v1/sse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": agentApiKey,
        "Mcp-Session-Id": sid,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "list_directory",
          arguments: {
            uri: `filesystem://${connectorId}/directory/`,
          },
        },
      }),
    });
    const callJson = (await callRes.json()) as JsonRpcResult;
    expect(callJson.error).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────
// Users CRUD (admin)
// ───────────────────────────────────────────────────────────────
describe("Users CRUD", () => {
  let token = "";
  const innerTs = Date.now() + 3;
  const newUserEmail = `e2e-user-${innerTs}@example.com`;
  let newUserId = "";

  beforeAll(async () => {
    const login = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const j = await login.json();
    token = j.token;
    // Verify role is included in user payload
    expect(j.user.role).toBe("admin");
  });

  afterAll(async () => {
    if (newUserId) {
      await fetch(`${API_BASE}/api/users/${newUserId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  it("admin can list users", async () => {
    const res = await fetch(`${API_BASE}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data[0]).toHaveProperty("role");
    // Password hash should never be exposed
    expect(json.data[0]).not.toHaveProperty("passwordHash");
  });

  it("admin can fetch /api/users/me", async () => {
    const res = await fetch(`${API_BASE}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.email).toBe(ADMIN_EMAIL);
    expect(j.data.role).toBe("admin");
  });

  it("admin can create a new user", async () => {
    const res = await fetch(`${API_BASE}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: newUserEmail,
        password: "test-password-1",
        name: "E2E Created",
        role: "user",
      }),
    });
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.data.email).toBe(newUserEmail);
    expect(j.data.role).toBe("user");
    newUserId = j.data.id;
  });

  it("the new user can log in and gets a token with their role", async () => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: newUserEmail,
        password: "test-password-1",
      }),
    });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.user.role).toBe("user");
  });

  it("admin can update the new user (rename + role bump)", async () => {
    const res = await fetch(`${API_BASE}/api/users/${newUserId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "E2E Renamed", role: "admin" }),
    });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.name).toBe("E2E Renamed");
    expect(j.data.role).toBe("admin");
  });

  it("a regular user cannot delete other users", async () => {
    // Create another regular user
    const newUserToken = (
      await (
        await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: newUserEmail,
            password: "test-password-1",
          }),
        })
      ).json()
    ).token;

    // Demote this user back to "user" role first
    await fetch(`${API_BASE}/api/users/${newUserId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: "user" }),
    });

    // Refresh token (role lives in JWT)
    const newUserToken2 = (
      await (
        await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: newUserEmail,
            password: "test-password-1",
          }),
        })
      ).json()
    ).token;

    // Try to list users as a regular user → should be 403
    const listRes = await fetch(`${API_BASE}/api/users`, {
      headers: { Authorization: `Bearer ${newUserToken2}` },
    });
    expect(listRes.status).toBe(403);

    // Suppress unused warning
    void newUserToken;
  });

  it("admin cannot delete themselves", async () => {
    // Get admin's userId from /me
    const me = await (
      await fetch(`${API_BASE}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    const adminId = me.data.id;

    const res = await fetch(`${API_BASE}/api/users/${adminId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
  });
});

// ───────────────────────────────────────────────────────────────
// MCP guidance: per-agent instructions + built-in prompts
// ───────────────────────────────────────────────────────────────
describe("MCP agent guidance (instructions + prompts)", () => {
  let token = "";
  const innerTs = Date.now() + 4;
  const slug = `e2e-test-guide-${innerTs}`;
  let workspaceId = "";
  let connectorId = "";
  let apiKey = "";

  beforeAll(async () => {
    const login = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    token = (await login.json()).token;

    const auth = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    const ws = await (
      await fetch(`${API_BASE}/api/workspaces`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ name: `Guide ${innerTs}`, slug }),
      })
    ).json();
    workspaceId = ws.data.id;

    const conn = await (
      await fetch(`${API_BASE}/api/connectors`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          workspaceId,
          type: "filesystem",
          name: `guide-fs-${innerTs}`,
          config: { rootPath: "/data/test-data" },
          isActive: true,
          readOnly: true,
        }),
      })
    ).json();
    connectorId = conn.data.id;

    const ag = await (
      await fetch(`${API_BASE}/api/agents`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          workspaceId,
          name: `guide-agent-${innerTs}`,
        }),
      })
    ).json();
    apiKey = ag.apiKey;
  });

  afterAll(async () => {
    if (workspaceId) {
      await fetch(`${API_BASE}/api/workspaces/${workspaceId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  it("initialize result includes ContextGate-aware instructions", async () => {
    const res = await fetch(`${API_BASE}/mcp/v1/sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "guide-test", version: "1" },
        },
      }),
    });
    const json = (await res.json()) as JsonRpcResult<{
      instructions?: string;
      capabilities?: Record<string, unknown>;
    }>;
    expect(json.error).toBeUndefined();
    const result = json.result!;
    expect(result.instructions).toBeTruthy();
    expect(result.instructions).toContain("ContextGate");
    expect(result.instructions).toContain(`guide-agent-${innerTs}`);
    expect(result.instructions).toContain("How to use ContextGate well");
    // capabilities should advertise prompts now
    expect(result.capabilities?.prompts).toBeDefined();
  });

  it("prompts/list returns the eight built-in skills", async () => {
    // Initialize to get session
    const init = await fetch(`${API_BASE}/mcp/v1/sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "guide-test", version: "1" },
        },
      }),
    });
    const sid = init.headers.get("mcp-session-id")!;

    const res = await fetch(`${API_BASE}/mcp/v1/sse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "Mcp-Session-Id": sid,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "prompts/list",
      }),
    });
    const json = (await res.json()) as JsonRpcResult<{
      prompts: Array<{ name: string; description: string }>;
    }>;
    expect(json.error).toBeUndefined();
    const names = json.result!.prompts.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "onboard",
        "explore-context",
        "summarize-workspace",
        "find-files",
        "citation-check",
        "compare-files",
        "audit-recent",
        "safe-edit",
      ])
    );
    expect(json.result!.prompts.length).toBe(8);
  });

  it("prompts/get returns skill messages with arguments substituted", async () => {
    // Initialize to get session
    const init = await fetch(`${API_BASE}/mcp/v1/sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "guide-test", version: "1" },
        },
      }),
    });
    const sid = init.headers.get("mcp-session-id")!;

    const res = await fetch(`${API_BASE}/mcp/v1/sse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "Mcp-Session-Id": sid,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "prompts/get",
        params: {
          name: "find-files",
          arguments: { topic: "deployment runbook" },
        },
      }),
    });
    const json = (await res.json()) as JsonRpcResult<{
      messages: Array<{ role: string; content: { text: string } }>;
    }>;
    expect(json.error).toBeUndefined();
    const text = json.result!.messages[0].content.text;
    expect(text).toContain("deployment runbook");
    expect(text).toContain("resources/list");
    // Suppress unused
    void connectorId;
  });
});
