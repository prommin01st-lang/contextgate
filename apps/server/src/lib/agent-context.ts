/**
 * Build the per-agent "instructions" string sent during MCP initialize.
 *
 * Most modern MCP clients (Claude Desktop, Cursor, Cline, Kimi, etc.) read
 * this field and inject it into the LLM's system prompt. Use it to teach
 * the model:
 *
 *   1. What ContextGate is and what role it plays
 *   2. Which tools/connectors this specific agent can call
 *   3. How to think about read-only vs read-write data
 *   4. The expected workflow (discover → read → use → cite)
 *
 * Keep the text concise but specific — generic boilerplate gets ignored.
 */

import { db } from "@contextgate/core";
import {
  agents,
  workspaces,
  connectors as connectorsTable,
  policies,
} from "@contextgate/core";
import { and, eq, isNull, or } from "drizzle-orm";

interface ConnectorSummary {
  id: string;
  name: string;
  type: string;
  readOnly: boolean;
}

interface PolicySummary {
  resourcePattern: string;
  actions: string[];
  scope: "agent" | "workspace";
}

export interface AgentContext {
  agentId: string;
  agentName: string;
  workspaceId: string;
  workspaceName: string;
  connectors: ConnectorSummary[];
  policies: PolicySummary[];
}

/**
 * Pull everything we need to describe the agent's environment in one query
 * pass. Returns null when the agent doesn't exist (caller should fall back
 * to generic instructions in that case).
 */
export async function loadAgentContext(
  agentId: string
): Promise<AgentContext | null> {
  const agentRows = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  if (agentRows.length === 0) return null;
  const agent = agentRows[0];

  const wsRows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, agent.workspaceId))
    .limit(1);
  const workspaceName = wsRows[0]?.name ?? "Unknown workspace";

  const connectorRows = await db
    .select()
    .from(connectorsTable)
    .where(
      and(
        eq(connectorsTable.workspaceId, agent.workspaceId),
        eq(connectorsTable.isActive, true)
      )
    );

  const policyRows = await db
    .select()
    .from(policies)
    .where(
      or(
        and(eq(policies.agentId, agentId), isNull(policies.workspaceId)),
        and(eq(policies.workspaceId, agent.workspaceId), isNull(policies.agentId))
      )
    );

  return {
    agentId: agent.id,
    agentName: agent.name,
    workspaceId: agent.workspaceId,
    workspaceName,
    connectors: connectorRows.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      readOnly: c.readOnly,
    })),
    policies: policyRows.map((p) => ({
      resourcePattern: p.resourcePattern,
      actions: p.actions ?? [],
      scope: p.workspaceId ? "workspace" : "agent",
    })),
  };
}

/**
 * Build the instructions text injected as a system-prompt hint.
 */
export function buildInstructions(ctx: AgentContext | null): string {
  if (!ctx) return GENERIC_INSTRUCTIONS;

  const parts: string[] = [];

  parts.push(
    `You are connected to **ContextGate**, a governed gateway that exposes ` +
      `your organisation's documents, files, and database tables to AI ` +
      `agents through the Model Context Protocol.`
  );

  parts.push(
    `**You are agent "${ctx.agentName}"** in workspace **"${ctx.workspaceName}"**. ` +
      `Every tool call you make is authenticated, audit-logged, and policy-checked.`
  );

  // Available data sources
  if (ctx.connectors.length === 0) {
    parts.push(
      `## Data sources\n` +
        `No connectors are configured yet. Tell the user there is nothing ` +
        `to read until an admin sets up a connector in the ContextGate dashboard.`
    );
  } else {
    const lines = ctx.connectors.map((c) => {
      const mode = c.readOnly ? "read-only" : "read-write";
      return `- **${c.name}** (${c.type}, ${mode})`;
    });
    parts.push(`## Data sources you can reach\n${lines.join("\n")}`);
  }

  // Capabilities derived from policies
  if (ctx.policies.length === 0) {
    parts.push(
      `## ⚠ No access policies\n` +
        `You currently have **no policies**, so every tool call will be denied. ` +
        `If the user asks why you cannot read anything, point them to the ` +
        `ContextGate **Policies** page in the dashboard.`
    );
  } else {
    const allowedActions = new Set<string>();
    const patterns: string[] = [];
    for (const p of ctx.policies) {
      for (const a of p.actions) allowedActions.add(a);
      patterns.push(`  - \`${p.resourcePattern}\` → ${p.actions.join(", ")} (${p.scope})`);
    }
    parts.push(
      `## What you are allowed to do\n` +
        `Permitted actions: **${[...allowedActions].sort().join(", ")}**\n` +
        `Active policies:\n${patterns.join("\n")}`
    );
  }

  // Workflow guidance
  parts.push(
    `## How to use ContextGate well\n` +
      `1. Call \`resources/list\` (or \`list_directory\` on a connector root URI) ` +
      `to discover what URIs exist before guessing.\n` +
      `2. Use \`read_file\` to fetch the **smallest piece of context that ` +
      `answers the user's question**. Do NOT bulk-read entire trees.\n` +
      `3. When the user wants a fact, **cite the URI** you read it from so ` +
      `they can verify.\n` +
      `4. Treat read-only connectors as immutable. Never invent URIs or ` +
      `pretend to write to them.\n` +
      `5. For read-write connectors, **confirm with the user** before ` +
      `\`write_file\` / \`delete_file\` operations — those are logged ` +
      `as mutations and may overwrite real work.\n` +
      `6. Tool calls take a single \`uri\` argument (plus \`content\` for ` +
      `writes). Build URIs from the templates exposed via ` +
      `\`resources/templates/list\`.\n` +
      `7. If a tool call returns "Access denied", do not retry; tell the ` +
      `user the resource is outside your policy and stop.`
  );

  // Available prompts
  parts.push(
    `## Reusable prompts (skills)\n` +
      `If your client supports MCP \`prompts\`, call \`prompts/get\` with one ` +
      `of these to get a step-by-step recipe instead of reasoning ad-hoc:\n` +
      `- **onboard** — first-time orientation for the user\n` +
      `- **explore-context** — survey the workspace before answering\n` +
      `- **summarize-workspace** — produce a one-page executive summary\n` +
      `- **find-files** \`(topic)\` — locate files about a topic without bulk-reading\n` +
      `- **citation-check** \`(claim)\` — verify a claim against the files\n` +
      `- **compare-files** \`(fileA, fileB)\` — structured diff/comparison\n` +
      `- **audit-recent** — explain recent agent activity to the user\n` +
      `- **safe-edit** \`(path, instruction)\` — read → diff → confirm → write workflow\n\n` +
      `Prefer these recipes — they encode the safe, predictable behaviour ` +
      `users expect from a governed gateway.`
  );

  return parts.join("\n\n");
}

const GENERIC_INSTRUCTIONS = `You are connected to ContextGate, a governed MCP gateway.
List available tools first, then use them to answer the user's question.
Every call is audit-logged.`;
