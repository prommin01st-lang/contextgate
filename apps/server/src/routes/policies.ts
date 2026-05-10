import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@contextgate/core";
import { policies } from "@contextgate/core";
import { eq, or } from "drizzle-orm";

const policyRoutes = new Hono();

// Either agentId OR workspaceId must be set, not both, not neither.
const createSchema = z
  .object({
    agentId: z.string().uuid().optional(),
    workspaceId: z.string().uuid().optional(),
    resourcePattern: z.string().min(1).max(500),
    actions: z.array(z.string()).min(1).default(["read"]),
  })
  .refine((d) => Boolean(d.agentId) !== Boolean(d.workspaceId), {
    message: "Provide exactly one of agentId or workspaceId",
  });

const updateSchema = z.object({
  resourcePattern: z.string().min(1).max(500).optional(),
  actions: z.array(z.string()).min(1).optional(),
});

// LIST — supports filter by agentId or workspaceId
policyRoutes.get("/", async (c) => {
  const agentId = c.req.query("agentId");
  const workspaceId = c.req.query("workspaceId");

  if (agentId) {
    const data = await db.select().from(policies).where(eq(policies.agentId, agentId));
    return c.json({ data });
  }
  if (workspaceId) {
    // Return both workspace-level policies AND policies of agents in that workspace
    // For simplicity here, just return workspace-level policies.
    const data = await db
      .select()
      .from(policies)
      .where(eq(policies.workspaceId, workspaceId));
    return c.json({ data });
  }

  const data = await db.select().from(policies);
  return c.json({ data });
});

// GET ONE
policyRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const results = await db.select().from(policies).where(eq(policies.id, id)).limit(1);
  if (results.length === 0) {
    return c.json({ error: "Policy not found" }, 404);
  }
  return c.json({ data: results[0] });
});

// CREATE
policyRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");
  const result = await db
    .insert(policies)
    .values({
      agentId: body.agentId ?? null,
      workspaceId: body.workspaceId ?? null,
      resourcePattern: body.resourcePattern,
      actions: body.actions,
    })
    .returning();
  return c.json({ data: result[0] }, 201);
});

// UPDATE
policyRoutes.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await db.select().from(policies).where(eq(policies.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: "Policy not found" }, 404);
  }

  const result = await db
    .update(policies)
    .set({
      ...(body.resourcePattern !== undefined && { resourcePattern: body.resourcePattern }),
      ...(body.actions !== undefined && { actions: body.actions }),
    })
    .where(eq(policies.id, id))
    .returning();

  return c.json({ data: result[0] });
});

// DELETE
policyRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db.select().from(policies).where(eq(policies.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: "Policy not found" }, 404);
  }

  await db.delete(policies).where(eq(policies.id, id));
  return c.json({ message: "Policy deleted" });
});

export { policyRoutes };
