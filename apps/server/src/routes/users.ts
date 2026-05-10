/**
 * Users CRUD — admin-only endpoints for managing accounts.
 *
 * The current authenticated user can also fetch / update their own record
 * regardless of role (handy for "view profile" or "change password").
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import { db } from "@contextgate/core";
import { users } from "@contextgate/core";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth";

const userRoutes = new Hono();

const ROLES = ["admin", "user"] as const;

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(255).optional(),
  role: z.enum(ROLES).optional().default("user"),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(ROLES).optional(),
});

function publicShape(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// ─── List (admin only) ──────────────────────────────────────────
userRoutes.get("/", requireAdmin, async (c) => {
  const data = await db.select().from(users);
  return c.json({ data: data.map(publicShape) });
});

// ─── Get current user ───────────────────────────────────────────
// `/me` must be defined before `/:id` so the literal path wins routing.
userRoutes.get("/me", async (c) => {
  const userId = c.get("userId" as never) as string | undefined;
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (rows.length === 0) return c.json({ error: "User not found" }, 404);
  return c.json({ data: publicShape(rows[0]) });
});

// ─── Get by id ──────────────────────────────────────────────────
// Self can fetch self regardless of role; otherwise admin only.
userRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId" as never) as string | undefined;
  const role = c.get("userRole" as never) as string | undefined;

  if (id !== userId && role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (rows.length === 0) return c.json({ error: "User not found" }, 404);
  return c.json({ data: publicShape(rows[0]) });
});

// ─── Create (admin only) ────────────────────────────────────────
userRoutes.post("/", requireAdmin, zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");

  const existing = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = bcryptjs.hashSync(body.password, 10);
  const result = await db
    .insert(users)
    .values({
      email: body.email,
      passwordHash,
      name: body.name ?? null,
      role: body.role,
    })
    .returning();

  return c.json({ data: publicShape(result[0]) }, 201);
});

// ─── Update ─────────────────────────────────────────────────────
// Admin can update anyone; non-admins can only update themselves
// (and cannot change their own role).
userRoutes.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const userId = c.get("userId" as never) as string | undefined;
  const role = c.get("userRole" as never) as string | undefined;

  if (id !== userId && role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const existing = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (existing.length === 0) return c.json({ error: "User not found" }, 404);

  // Non-admins cannot change role
  if (role !== "admin" && body.role !== undefined) {
    return c.json({ error: "Forbidden — only admins can change roles" }, 403);
  }

  // Email uniqueness if changed
  if (body.email && body.email !== existing[0].email) {
    const dup = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (dup.length > 0) {
      return c.json({ error: "Email already taken" }, 409);
    }
  }

  const updates: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.name !== undefined) updates.name = body.name;
  if (body.email !== undefined) updates.email = body.email;
  if (body.role !== undefined) updates.role = body.role;
  if (body.password !== undefined) {
    updates.passwordHash = bcryptjs.hashSync(body.password, 10);
  }

  const result = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning();

  return c.json({ data: publicShape(result[0]) });
});

// ─── Delete (admin only) ────────────────────────────────────────
userRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId" as never) as string | undefined;

  // Prevent admins from deleting themselves (would lock out access)
  if (id === userId) {
    return c.json({ error: "Cannot delete your own account" }, 400);
  }

  const existing = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (existing.length === 0) return c.json({ error: "User not found" }, 404);

  await db.delete(users).where(eq(users.id, id));
  return c.json({ message: "User deleted" });
});

export { userRoutes };
