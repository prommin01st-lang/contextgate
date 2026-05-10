import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@contextgate/core";
import { connectors } from "@contextgate/core";
import { eq } from "drizzle-orm";

const connectorRoutes = new Hono();

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  type: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  config: z.record(z.any()).optional().default({}),
  isActive: z.boolean().optional().default(true),
  readOnly: z.boolean().optional().default(true),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
  readOnly: z.boolean().optional(),
});

// LIST
connectorRoutes.get("/", async (c) => {
  const data = await db.select().from(connectors);
  return c.json({ data });
});

// GET ONE
connectorRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const results = await db.select().from(connectors).where(eq(connectors.id, id)).limit(1);
  if (results.length === 0) {
    return c.json({ error: "Connector not found" }, 404);
  }
  return c.json({ data: results[0] });
});

// CREATE
connectorRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");
  const result = await db
    .insert(connectors)
    .values({
      workspaceId: body.workspaceId,
      type: body.type,
      name: body.name,
      config: body.config,
      isActive: body.isActive,
      readOnly: body.readOnly,
    })
    .returning();
  return c.json({ data: result[0] }, 201);
});

// UPDATE
connectorRoutes.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await db.select().from(connectors).where(eq(connectors.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: "Connector not found" }, 404);
  }

  const result = await db
    .update(connectors)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.config !== undefined && { config: body.config }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.readOnly !== undefined && { readOnly: body.readOnly }),
      updatedAt: new Date(),
    })
    .where(eq(connectors.id, id))
    .returning();

  return c.json({ data: result[0] });
});

// DELETE
connectorRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db.select().from(connectors).where(eq(connectors.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: "Connector not found" }, 404);
  }

  await db.delete(connectors).where(eq(connectors.id, id));
  return c.json({ message: "Connector deleted" });
});

export { connectorRoutes };
