import { Hono } from "hono";
import { jwtVerify, SignJWT } from "jose";
import { createHash } from "crypto";
import { db } from "@contextgate/core";
import { agents } from "@contextgate/core";
import { eq } from "drizzle-orm";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "contextgate-dev-secret-change-in-production"
);

export type Variables = {
  userId?: string;
  userRole?: string;
  workspaceId?: string;
  agentId?: string;
};

/** Hash an API key with SHA-256 for indexed lookup. */
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// ───────────────────────────────────────────────────────────────
// JWT Middleware — for REST API routes
// ───────────────────────────────────────────────────────────────
export const authMiddleware = async (c: any, next: any) => {
  const auth = c.req.header("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized — missing or invalid Authorization header" }, 401);
  }

  const token = auth.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { clockTolerance: 60 });
    c.set("userId", payload.sub as string | undefined);
    c.set("userRole", (payload.role as string) || "user");
    c.set("workspaceId", (payload.workspaceId as string) || undefined);
    await next();
  } catch {
    return c.json({ error: "Unauthorized — invalid token" }, 401);
  }
};

/**
 * Admin-only guard — must run after authMiddleware. Returns 403 if the
 * authenticated user does not have role "admin".
 */
export const requireAdmin = async (c: any, next: any) => {
  const role = c.get("userRole");
  if (role !== "admin") {
    return c.json({ error: "Forbidden — admin role required" }, 403);
  }
  await next();
};

// ───────────────────────────────────────────────────────────────
// API Key Middleware — for MCP / SSE endpoints
//
// Accepts the API key in any of these locations (first match wins):
//   1. x-api-key header
//   2. Authorization: Bearer <key>
//   3. api_key query parameter
//   4. apiKey query parameter
// ───────────────────────────────────────────────────────────────
export const apiKeyMiddleware = async (c: any, next: any) => {
  const headerKey = c.req.header("x-api-key");
  const authHeader = c.req.header("Authorization") || c.req.header("authorization");
  const bearerKey =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : undefined;
  const queryKey = c.req.query("api_key") || c.req.query("apiKey");

  const apiKey = headerKey || bearerKey || queryKey;

  if (!apiKey) {
    return c.json(
      {
        error:
          "Unauthorized — provide API key via 'x-api-key' header, 'Authorization: Bearer <key>', or '?api_key=<key>' query param",
      },
      401
    );
  }

  // TODO: implement proper API key hashing and comparison (bcryptjs or crypto)
  // Look up by SHA-256 hash (preferred — what new agents store).
  // Fall back to plaintext lookup for backward compatibility with agents
  // created before hashing was implemented.
  const apiKeyHash = hashApiKey(apiKey);
  let results = await db
    .select()
    .from(agents)
    .where(eq(agents.apiKeyHash, apiKeyHash))
    .limit(1);

  if (results.length === 0) {
    // Legacy: agents created with plaintext keys before hashing landed
    results = await db
      .select()
      .from(agents)
      .where(eq(agents.apiKeyHash, apiKey))
      .limit(1);
  }

  if (results.length === 0) {
    return c.json({ error: "Unauthorized — invalid API key" }, 401);
  }

  const agent = results[0];
  c.set("agentId", agent.id);
  await next();
};

// ───────────────────────────────────────────────────────────────
// Rate Limiting Placeholder
// ───────────────────────────────────────────────────────────────
export const rateLimitMiddleware = async (c: any, next: any) => {
  // TODO: implement Redis-based sliding-window rate limiting
  await next();
};

export { SignJWT };
