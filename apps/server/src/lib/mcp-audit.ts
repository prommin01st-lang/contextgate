/**
 * MCP Audit + URI extraction helpers
 *
 * Maps MCP tool names + arguments to:
 *   - canonical action (read | list | write | delete | use)
 *   - resource URI (e.g. filesystem://<connId>/file/<path>)
 *
 * The MCP server now exposes GENERIC tools (read_file, list_directory, …)
 * with the URI passed as an argument, so context extraction is trivial:
 * the URI lives in `args.uri` and the action is implied by the tool name.
 *
 * Plus a single helper to write an entry to the audit_logs table.
 */

import { db } from "@contextgate/core";
import { auditLogs } from "@contextgate/core";

// ───────────────────────────────────────────────────────────────
// Tool name → action mapping
// ───────────────────────────────────────────────────────────────

const TOOL_TO_ACTION: Record<string, string> = {
  read_file: "read",
  list_directory: "list",
  write_file: "write",
  append_file: "write",
  delete_file: "delete",
  create_directory: "write",
};

export interface ToolContext {
  /** UUID of the connector the tool acts on (parsed from URI). */
  connectorId: string;
  /** Canonical action for policy + audit purposes. */
  action: string;
  /** Resource URI used by the policy engine. */
  uri: string;
}

/**
 * Extract policy/audit context from a tool call.
 * Returns null if the tool name isn't one we recognise as a connector op.
 */
export function extractToolContext(
  toolName: string,
  args: unknown
): ToolContext | null {
  const action = TOOL_TO_ACTION[toolName];
  if (!action) return null;

  const uri =
    args && typeof args === "object" && "uri" in args
      ? String((args as { uri: unknown }).uri ?? "")
      : "";
  if (!uri) return null;

  // Pull the connector UUID from the URI (any scheme).
  // Pattern: <scheme>://<connectorId>/...
  const m = uri.match(/^[a-z]+:\/\/([^/]+)\//i);
  if (!m) return null;
  const connectorId = m[1];

  return { connectorId, action, uri };
}

// ───────────────────────────────────────────────────────────────
// Audit log writer
// ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  workspaceId: string;
  agentId?: string | null;
  action: string;
  resourceUri?: string | null;
  status: "allowed" | "denied" | "success" | "error";
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      workspaceId: entry.workspaceId,
      agentId: entry.agentId ?? null,
      action: entry.action,
      resourceUri: entry.resourceUri ?? null,
      status: entry.status,
      details: entry.details ?? {},
      ipAddress: entry.ipAddress ?? null,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}
