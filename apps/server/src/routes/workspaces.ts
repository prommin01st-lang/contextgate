import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@contextgate/core";
import { workspaces } from "@contextgate/core";
import { eq } from "drizzle-orm";

const workspaceRoutes = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  settings: z.record(z.any()).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  settings: z.record(z.any()).optional(),
});

// LIST
workspaceRoutes.get("/", async (c) => {
  const data = await db.select().from(workspaces);
  return c.json({ data });
});

// GET ONE
workspaceRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const results = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  if (results.length === 0) {
    return c.json({ error: "Workspace not found" }, 404);
  }
  return c.json({ data: results[0] });
});

// CREATE
workspaceRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");
  const result = await db
    .insert(workspaces)
    .values({
      name: body.name,
      slug: body.slug,
      settings: body.settings ?? {},
    })
    .returning();
  return c.json({ data: result[0] }, 201);
});

// UPDATE
workspaceRoutes.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  const result = await db
    .update(workspaces)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.settings !== undefined && { settings: body.settings }),
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, id))
    .returning();

  return c.json({ data: result[0] });
});

// DELETE
workspaceRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: "Workspace not found" }, 404);
  }

  await db.delete(workspaces).where(eq(workspaces.id, id));
  return c.json({ message: "Workspace deleted" });
});

export { workspaceRoutes };
