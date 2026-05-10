/**
 * Resources Routes — browse resources across all configured connectors.
 *
 * Endpoints (mounted at /api/resources):
 *   GET / [?workspaceId=][&connectorId=]
 *     → live discovery from each connector via connector.listResources()
 *     → returns flat list with connector metadata for grouping
 */

import { Hono } from "hono";
import { ConnectorRegistry } from "@contextgate/connectors";
import { db } from "@contextgate/core";
import { connectors as connectorsTable } from "@contextgate/core";
import { and, eq } from "drizzle-orm";

const resourceRoutes = new Hono();

// Local registry for resource browsing (separate from MCP route's registry,
// but uses the same factory pattern). Connector instances are cached in this
// process and re-created when their config changes.
const browseRegistry = new ConnectorRegistry();

interface BrowseConnectorRow {
  id: string;
  name: string;
  type: string;
  workspaceId: string;
  config: Record<string, unknown>;
  readOnly: boolean;
  isActive: boolean;
}

async function ensureConnector(row: BrowseConnectorRow) {
  const existing = browseRegistry.get(row.id);
  if (existing) return existing;

  const instance = browseRegistry.create({
    id: row.id,
    name: row.name,
    type: row.type,
    config: row.config,
    readOnly: row.readOnly,
    workspaceId: row.workspaceId,
  });
  await instance.connect();
  return instance;
}

resourceRoutes.get("/", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  const connectorId = c.req.query("connectorId");

  // Build connector query
  const conditions = [eq(connectorsTable.isActive, true)];
  if (workspaceId) conditions.push(eq(connectorsTable.workspaceId, workspaceId));
  if (connectorId) conditions.push(eq(connectorsTable.id, connectorId));

  const rows = await db
    .select()
    .from(connectorsTable)
    .where(and(...conditions));

  type ResourceItem = {
    uri: string;
    name: string;
    mimeType: string | null;
    connectorId: string;
    connectorName: string;
    connectorType: string;
  };

  const all: ResourceItem[] = [];
  const errors: Array<{ connectorId: string; connectorName: string; error: string }> = [];

  for (const row of rows) {
    try {
      const instance = await ensureConnector({
        id: row.id,
        name: row.name,
        type: row.type,
        workspaceId: row.workspaceId,
        config: row.config as Record<string, unknown>,
        readOnly: row.readOnly,
        isActive: row.isActive,
      });

      const resources = await instance.listResources();
      for (const r of resources) {
        all.push({
          uri: r.uri,
          name: r.name,
          mimeType: r.mimeType ?? null,
          connectorId: row.id,
          connectorName: row.name,
          connectorType: row.type,
        });
      }
    } catch (err) {
      const e = err as Error;
      errors.push({
        connectorId: row.id,
        connectorName: row.name,
        error: e.message ?? "Failed to list",
      });
    }
  }

  return c.json({
    data: {
      total: all.length,
      items: all,
      errors,
    },
  });
});

export { resourceRoutes };
