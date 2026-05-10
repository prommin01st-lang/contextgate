/**
 * MCP Route Handler for ContextGate Server
 *
 * Supports two transport patterns:
 *
 * 1. Streamable HTTP (MCP 2025-03-26+)
 *    - POST /mcp/v1/sse → JSON-RPC request, returns JSON response
 *    - DELETE /mcp/v1/sse → terminate session (Mcp-Session-Id header)
 *    Used by: Kimi (http transport), modern MCP clients
 *
 * 2. Legacy SSE Transport (backward compat for mcp-remote etc.)
 *    - GET /mcp/v1/sse → opens SSE stream + returns endpoint event
 *    - POST /mcp/v1/sse/{sessionId} → send message, response over SSE
 *    Used by: mcp-remote, older MCP clients
 */

import { Hono } from "hono";
import type { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ConnectorRegistry, createMCPServer } from "@contextgate/connectors";
import { db } from "@contextgate/core";
import { agents, connectors as connectorsTable } from "@contextgate/core";
import { and, eq } from "drizzle-orm";
import { apiKeyMiddleware } from "../middleware/auth";
import { policyEngine } from "../lib/policy-engine";
import { extractToolContext, writeAuditLog } from "../lib/mcp-audit";
import { loadAgentContext, buildInstructions } from "../lib/agent-context";

// ───────────────────────────────────────────────────────────────
// Transport: Legacy SSE
// ───────────────────────────────────────────────────────────────
class HonoSSETransport implements Transport {
  sessionId: string;
  onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  private controller?: ReadableStreamDefaultController;
  private encoder = new TextEncoder();
  private closed = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  setController(controller: ReadableStreamDefaultController) {
    this.controller = controller;
  }

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed || !this.controller) {
      throw new Error("Transport not connected");
    }
    this.controller.enqueue(
      this.encoder.encode(`event: message\ndata: ${JSON.stringify(message)}\n\n`)
    );
  }

  async close(): Promise<void> {
    this.closed = true;
    this.controller?.close();
    this.onclose?.();
  }

  handleMessage(message: unknown, extra?: MessageExtraInfo): void {
    this.onmessage?.(message as JSONRPCMessage, extra);
  }
}

// ───────────────────────────────────────────────────────────────
// Transport: Streamable HTTP
// ───────────────────────────────────────────────────────────────
class StreamableHttpTransport implements Transport {
  sessionId: string;
  onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  private pending = new Map<string | number, (response: JSONRPCMessage) => void>();
  private closed = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async start(): Promise<void> {}

  // Server (MCP SDK) calls this to send responses to client
  async send(message: JSONRPCMessage): Promise<void> {
    const msg = message as { id?: string | number };
    if (msg.id !== undefined && msg.id !== null) {
      const resolver = this.pending.get(msg.id);
      if (resolver) {
        resolver(message);
        this.pending.delete(msg.id);
      }
    }
    // Notifications from server (no matching pending) are dropped in this
    // simple JSON request/response model. Use SSE GET endpoint for that.
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const [id, resolver] of this.pending) {
      resolver({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: "Connection closed" },
      } as JSONRPCMessage);
    }
    this.pending.clear();
    this.onclose?.();
  }

  // Called by HTTP handler — submit a request and wait for matching response
  async dispatchRequest(message: JSONRPCMessage): Promise<JSONRPCMessage | null> {
    if (this.closed) {
      throw new Error("Transport closed");
    }

    const msg = message as { id?: string | number };
    // Notifications (no id) — fire and forget
    if (msg.id === undefined || msg.id === null) {
      this.onmessage?.(message);
      return null;
    }

    return new Promise((resolve) => {
      this.pending.set(msg.id!, resolve);
      this.onmessage?.(message);

      // Safety timeout (30s)
      setTimeout(() => {
        if (this.pending.has(msg.id!)) {
          this.pending.delete(msg.id!);
          resolve({
            jsonrpc: "2.0",
            id: msg.id,
            error: { code: -32603, message: "Request timeout" },
          } as JSONRPCMessage);
        }
      }, 30000);
    });
  }
}

// In-memory session stores
const sseSessions = new Map<string, HonoSSETransport>();
const httpSessions = new Map<string, StreamableHttpTransport>();

// Per-agent registries — each agent sees only their workspace's connectors.
// Without this isolation a stale registry from one workspace could leak to
// another agent's MCP session.
const agentRegistries = new Map<string, ConnectorRegistry>();

// ───────────────────────────────────────────────────────────────
// Policy enforcement + audit log helper
// ───────────────────────────────────────────────────────────────

interface ToolCallMessage {
  jsonrpc: string;
  id: string | number;
  method: "tools/call";
  params: { name: string; arguments?: unknown };
}

function isToolCallRequest(msg: unknown): msg is ToolCallMessage {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as { method?: unknown; id?: unknown; params?: unknown };
  return (
    m.method === "tools/call" &&
    (typeof m.id === "string" || typeof m.id === "number") &&
    typeof m.params === "object" &&
    m.params !== null
  );
}

/**
 * Run policy + audit on a tool call. Returns:
 *   - a ready-to-send "denied" response when policy rejects the call
 *   - null when the call is allowed and the caller should dispatch normally
 *
 * For non-tool-call messages this is a no-op.
 */
async function authorizeAndAudit(
  message: JSONRPCMessage,
  agentId: string,
  workspaceId: string,
  ipAddress: string | null
): Promise<JSONRPCMessage | null> {
  if (!isToolCallRequest(message)) return null;

  const ctx = extractToolContext(message.params.name, message.params.arguments);
  if (!ctx) return null; // not a connector-scoped tool — let SDK handle

  const decision = await policyEngine.check(agentId, ctx.uri, ctx.action);

  await writeAuditLog({
    workspaceId,
    agentId,
    action: ctx.action,
    resourceUri: ctx.uri,
    status: decision.allowed ? "allowed" : "denied",
    details: {
      tool: message.params.name,
      args: message.params.arguments,
      reason: decision.reason,
      matchedPolicyId: decision.matchedPolicyId,
    },
    ipAddress,
  });

  if (decision.allowed) return null;

  return {
    jsonrpc: "2.0",
    id: message.id,
    error: {
      code: -32603,
      message: `Access denied: ${decision.reason}`,
    },
  } as JSONRPCMessage;
}

/**
 * Look up the agent's workspaceId. Cached per request — small enough to
 * not need a long-lived cache.
 */
async function getAgentWorkspace(agentId: string): Promise<string | null> {
  const rows = await db
    .select({ workspaceId: agents.workspaceId })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  return rows[0]?.workspaceId ?? null;
}

/**
 * Hydrate the registry with active connectors from the agent's workspace.
 *
 * Returns a registry scoped to this agent. Stale instances (connectors that
 * were deleted, deactivated, or moved to another workspace) are disconnected
 * and removed before re-creating the current set, so what the MCP server
 * sees always matches the database.
 */
async function getAgentRegistry(agentId: string): Promise<ConnectorRegistry> {
  let registry = agentRegistries.get(agentId);
  if (!registry) {
    registry = new ConnectorRegistry();
    agentRegistries.set(agentId, registry);
  }

  const agentRows = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  if (agentRows.length === 0) return registry;
  const workspaceId = agentRows[0].workspaceId;

  const connectorRows = await db
    .select()
    .from(connectorsTable)
    .where(
      and(
        eq(connectorsTable.workspaceId, workspaceId),
        eq(connectorsTable.isActive, true)
      )
    );

  const liveIds = new Set(connectorRows.map((r) => r.id));

  // 1) Drop instances that are no longer in DB (or moved away)
  for (const existing of registry.listConnectors()) {
    if (!liveIds.has(existing.config.id)) {
      try {
        await existing.disconnect();
      } catch {
        /* ignore */
      }
      // ConnectorRegistry doesn't expose remove(), so we re-construct it
      // below if needed. For simplicity just disconnect — listConnectors()
      // will still include it until we rebuild. So instead we rebuild:
    }
  }
  // Hard rebuild: clear all and re-add. Cheap because connectors are just
  // adapters over already-validated config.
  await registry.disconnectAll();

  // 2) Add fresh instances for every live connector
  for (const row of connectorRows) {
    try {
      const instance = registry.create({
        id: row.id,
        name: row.name,
        type: row.type,
        config: row.config as Record<string, unknown>,
        readOnly: row.readOnly,
        workspaceId: row.workspaceId,
      });
      await instance.connect();
      console.log(
        `[MCP] Hydrated connector ${row.type}/${row.name} (${row.id}) readOnly=${row.readOnly}`
      );
    } catch (err) {
      console.error(
        `[MCP] Failed to hydrate connector ${row.id} (${row.type}):`,
        err
      );
    }
  }

  return registry;
}

// ───────────────────────────────────────────────────────────────
// Route handlers
// ───────────────────────────────────────────────────────────────
const mcpRoutes = new Hono();

// ----- Streamable HTTP: POST / -----
// Accepts JSON-RPC, returns JSON response with Mcp-Session-Id header.
mcpRoutes.post("/", apiKeyMiddleware, async (c) => {
  const agentId = c.get("agentId" as never) as string | undefined;

  let message: JSONRPCMessage;
  try {
    message = (await c.req.json()) as JSONRPCMessage;
  } catch {
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
      400
    );
  }

  // Determine session id
  const isInitialize =
    typeof (message as { method?: string }).method === "string" &&
    (message as { method: string }).method === "initialize";

  let sessionId = c.req.header("Mcp-Session-Id");
  if (!sessionId || isInitialize) {
    sessionId = crypto.randomUUID();
  }

  // Get or create transport for this session.
  // We pass a per-agent registry so MCP only sees this agent's workspace.
  let transport = httpSessions.get(sessionId);
  if (!transport) {
    transport = new StreamableHttpTransport(sessionId);
    httpSessions.set(sessionId, transport);
    if (agentId) {
      const registry = await getAgentRegistry(agentId);
      const ctx = await loadAgentContext(agentId);
      const server = createMCPServer(registry, {
        instructions: buildInstructions(ctx),
      });
      await server.connect(transport);
    }
  } else if (agentId) {
    // Re-hydrate per request so dashboard changes appear without restart.
    await getAgentRegistry(agentId);
  }

  // Policy + audit enforcement for tool calls
  if (agentId) {
    const workspaceId = await getAgentWorkspace(agentId);
    if (workspaceId) {
      const ipAddress =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
        c.req.header("x-real-ip") ??
        null;
      const denial = await authorizeAndAudit(
        message,
        agentId,
        workspaceId,
        ipAddress
      );
      if (denial) {
        return new Response(JSON.stringify(denial), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Mcp-Session-Id": sessionId,
          },
        });
      }
    }
  }

  const response = await transport.dispatchRequest(message);

  // Notification: 202 Accepted, no body
  if (!response) {
    return new Response(null, {
      status: 202,
      headers: { "Mcp-Session-Id": sessionId },
    });
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Mcp-Session-Id": sessionId,
    },
  });
});

// ----- Streamable HTTP: DELETE / -----
// Terminate a session.
mcpRoutes.delete("/", apiKeyMiddleware, async (c) => {
  const sessionId = c.req.header("Mcp-Session-Id");
  if (!sessionId) {
    return c.json({ error: "Mcp-Session-Id header required" }, 400);
  }
  const transport = httpSessions.get(sessionId);
  if (transport) {
    await transport.close();
    httpSessions.delete(sessionId);
  }
  return new Response(null, { status: 204 });
});

// ----- Legacy SSE: GET / -----
// Opens an SSE stream. Used by older clients (mcp-remote etc.)
mcpRoutes.get("/", apiKeyMiddleware, async (c) => {
  const agentId = c.get("agentId" as never) as string | undefined;
  if (!agentId) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const registry = await getAgentRegistry(agentId);
  const ctx = await loadAgentContext(agentId);

  const sessionId = crypto.randomUUID();
  const transport = new HonoSSETransport(sessionId);
  sseSessions.set(sessionId, transport);

  const server = createMCPServer(registry, {
    instructions: buildInstructions(ctx),
  });
  await server.connect(transport);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      transport.setController(controller);
      controller.enqueue(
        encoder.encode(`event: endpoint\ndata: /mcp/v1/sse/${sessionId}\n\n`)
      );

      const heartbeat = setInterval(() => {
        if (transport["closed"]) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(
            encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`)
          );
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      c.req.raw.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        transport.close();
        sseSessions.delete(sessionId);
      });
    },
    cancel() {
      transport.close();
      sseSessions.delete(sessionId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

// ----- Legacy SSE: POST /:sessionId -----
// Receive JSON-RPC message for an open SSE session.
mcpRoutes.post("/:sessionId", apiKeyMiddleware, async (c) => {
  const sessionId = c.req.param("sessionId");
  const transport = sseSessions.get(sessionId);
  if (!transport) {
    return c.json({ error: "Session not found" }, 404);
  }

  const body = await c.req.json();

  // Policy + audit enforcement for tool calls
  const agentId = c.get("agentId" as never) as string | undefined;
  if (agentId) {
    const workspaceId = await getAgentWorkspace(agentId);
    if (workspaceId) {
      const ipAddress =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
        c.req.header("x-real-ip") ??
        null;
      const denial = await authorizeAndAudit(
        body,
        agentId,
        workspaceId,
        ipAddress
      );
      if (denial) {
        // Send the denial back through the SSE stream the client is listening on
        try {
          await transport.send(denial);
        } catch {
          /* ignore */
        }
        return c.text("Accepted", 202);
      }
    }
  }

  transport.handleMessage(body);
  return c.text("Accepted", 202);
});

export { mcpRoutes };
