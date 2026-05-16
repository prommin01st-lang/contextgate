import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createHash } from "crypto";
import { db } from "@contextgate/core";
import { agents, connectors as connectorsTable, policies } from "@contextgate/core";
import { eq, and } from "drizzle-orm";

const agentRoutes = new Hono();

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  isActive: z.boolean().optional().default(true),
  /**
   * If true (default) the API will create one read-only policy per active
   * connector in the workspace, granting the new agent immediate access.
   * Set to false when you want to configure policies manually.
   */
  autoCreateDefaultPolicies: z.boolean().optional().default(true),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
});

function generateApiKey(): string {
  return `cg_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Hash an API key with SHA-256 for storage. This is one-way:
 * we cannot recover the plaintext from the hash, only verify by
 * hashing an incoming key and comparing to the stored hash.
 */
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Map connector type → URI scheme used by tool calls / policies.
 * Mirrors the schemes produced by each Connector implementation.
 */
function schemeForType(type: string): string {
  switch (type) {
    case "filesystem":
      return "filesystem";
    case "postgres":
      return "postgres";
    case "notion":
      return "notion";
    default:
      return type;
  }
}

// LIST
agentRoutes.get("/", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (workspaceId) {
    const data = await db.select().from(agents).where(eq(agents.workspaceId, workspaceId));
    return c.json({ data });
  }
  const data = await db.select().from(agents);
  return c.json({ data });
});

// GET ONE
agentRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const results = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  if (results.length === 0) {
    return c.json({ error: "Agent not found" }, 404);
  }
  return c.json({ data: results[0] });
});

// CREATE
agentRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  // Store the SHA-256 hash, NOT the plaintext key. The plaintext is
  // returned to the caller exactly once — they must save it themselves.
  const result = await db
    .insert(agents)
    .values({
      workspaceId: body.workspaceId,
      name: body.name,
      apiKeyHash,
      isActive: body.isActive,
    })
    .returning();

  const newAgent = result[0];

  // Auto-create one read-only policy per active connector in the workspace.
  // Without this every new agent would land in default-deny limbo until
  // someone manually crafts policies — bad UX. Admins can revoke or tighten
  // the auto-generated policies later.
  let autoPolicies: Array<{ id: string; resourcePattern: string }> = [];
  if (body.autoCreateDefaultPolicies) {
    const activeConnectors = await db
      .select()
      .from(connectorsTable)
      .where(
        and(
          eq(connectorsTable.workspaceId, body.workspaceId),
          eq(connectorsTable.isActive, true)
        )
      );

    for (const conn of activeConnectors) {
      let pattern: string;
      let actions: string[];

      if (conn.type === "mcp-proxy-stdio") {
        pattern = `mcp-proxy://${conn.id}/tool/**`;
        actions = ["call"];
      } else {
        const scheme = schemeForType(conn.type);
        pattern = `${scheme}://${conn.id}/**`;
        actions = ["read", "list"];
      }

      const inserted = await db
        .insert(policies)
        .values({
          agentId: newAgent.id,
          resourcePattern: pattern,
          actions,
        })
        .returning();
      autoPolicies.push({
        id: inserted[0].id,
        resourcePattern: pattern,
      });
    }
  }

  return c.json(
    {
      data: newAgent,
      apiKey,
      autoPolicies,
    },
    201
  );
});

// UPDATE
agentRoutes.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const result = await db
    .update(agents)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(agents.id, id))
    .returning();

  return c.json({ data: result[0] });
});

// DELETE
agentRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: "Agent not found" }, 404);
  }

  await db.delete(agents).where(eq(agents.id, id));
  return c.json({ message: "Agent deleted" });
});

export { agentRoutes };
