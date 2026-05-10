import { Hono } from "hono";
import { db } from "@contextgate/core";
import { auditLogs } from "@contextgate/core";
import { eq, desc, sql } from "drizzle-orm";

const auditLogRoutes = new Hono();

/**
 * LIST audit logs with server-side pagination.
 *
 * Audit logs are append-only and grow without bound, so we never want to
 * ship the entire table to the dashboard. The client passes `limit` and
 * `offset`; we always return the matching slice plus the total count so the
 * UI can render "X-Y of Z" + a page window.
 *
 * Query params:
 *   - limit  (default 25, capped at 200)
 *   - offset (default 0)
 */
auditLogRoutes.get("/", async (c) => {
  const rawLimit = Number(c.req.query("limit") ?? "25");
  const rawOffset = Number(c.req.query("offset") ?? "0");
  const limit = Math.min(
    200,
    Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 25)
  );
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

  const [data, totalRow] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs),
  ]);

  return c.json({
    data,
    total: totalRow[0]?.count ?? 0,
    limit,
    offset,
  });
});

// GET ONE
auditLogRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const results = await db.select().from(auditLogs).where(eq(auditLogs.id, id)).limit(1);
  if (results.length === 0) {
    return c.json({ error: "Audit log not found" }, 404);
  }
  return c.json({ data: results[0] });
});

export { auditLogRoutes };
