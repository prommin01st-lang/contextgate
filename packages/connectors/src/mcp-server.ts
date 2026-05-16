/**
 * MCP Server Wrapper for ContextGate Connectors.
 *
 * Exposes a small set of GENERIC tools (no UUIDs in names) and the standard
 * MCP `resources` and `prompts` capabilities. Per request the server uses
 * the per-agent registry to look up which connector owns a URI, then
 * dispatches the action to that connector.
 *
 * Tool surface:
 *   - read_file(uri)
 *   - list_directory(uri, maxDepth?)
 *   - write_file(uri, content)
 *   - append_file(uri, content)
 *   - delete_file(uri)
 *   - create_directory(uri)
 *
 * Resource surface:
 *   - resources/list           — flat list of every readable resource
 *   - resources/read(uri)      — read a resource by URI
 *   - resources/templates/list — URI templates per connector for autocomplete
 *
 * Prompt surface:
 *   - 8 built-in skills (see BUILTIN_PROMPTS below)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ConnectorRegistry } from "./registry.js";
import { BaseConnector, MCPTool } from "./base.js";

interface CreateMCPServerOptions {
  /** Per-agent instructions injected into the initialize result. */
  instructions?: string;
}

// ───────────────────────────────────────────────────────────────
// Generic tool definitions
// ───────────────────────────────────────────────────────────────

const URI_PROP = {
  type: "string",
  description:
    "Resource URI (e.g. filesystem://<connectorId>/file/<path>). " +
    "Call list_directory or resources/list first to discover URIs.",
};

const TOOL_DEFS: MCPTool[] = [
  {
    name: "read_file",
    description:
      "Read a file's contents from any connector by URI. Use list_directory or resources/list first to discover available URIs.",
    inputSchema: {
      type: "object",
      properties: { uri: URI_PROP },
      required: ["uri"],
    },
  },
  {
    name: "list_directory",
    description:
      "List entries inside a directory URI. Pass an empty path or the connector root to see top-level contents.",
    inputSchema: {
      type: "object",
      properties: {
        uri: {
          ...URI_PROP,
          description:
            "Directory URI (e.g. filesystem://<connectorId>/directory/ for the root, or .../directory/<path> for a sub-folder).",
        },
        maxDepth: {
          type: "number",
          description: "Maximum recursion depth (default 1, max 5).",
        },
      },
      required: ["uri"],
    },
  },
  {
    name: "write_file",
    description:
      "Create or fully overwrite a file. Only allowed on read-write connectors. The write is total — content replaces the entire file.",
    inputSchema: {
      type: "object",
      properties: {
        uri: URI_PROP,
        content: { type: "string", description: "Full new file contents." },
      },
      required: ["uri", "content"],
    },
  },
  {
    name: "append_file",
    description:
      "Append text to an existing file (creates it if missing). Only allowed on read-write connectors.",
    inputSchema: {
      type: "object",
      properties: {
        uri: URI_PROP,
        content: { type: "string", description: "Text to append." },
      },
      required: ["uri", "content"],
    },
  },
  {
    name: "delete_file",
    description:
      "Delete a file or empty directory. Only allowed on read-write connectors.",
    inputSchema: {
      type: "object",
      properties: { uri: URI_PROP },
      required: ["uri"],
    },
  },
  {
    name: "create_directory",
    description:
      "Create a new directory (recursive). Only allowed on read-write connectors.",
    inputSchema: {
      type: "object",
      properties: { uri: URI_PROP },
      required: ["uri"],
    },
  },
];

// Resolve which connector owns the URI; throws if unknown.
function findConnectorForUri(
  registry: ConnectorRegistry,
  uri: string
): BaseConnector {
  const owner = registry.listConnectors().find((c) => c.canHandle(uri));
  if (!owner) {
    throw new Error(
      `No connector registered for URI: ${uri}. ` +
        `Available connectors: ${registry
          .listConnectors()
          .map((c) => c.uriPrefix())
          .join(", ") || "(none)"}`
    );
  }
  return owner;
}

function toolResult(payload: unknown) {
  return {
    content: [
      {
        type: "text",
        text:
          typeof payload === "string"
            ? payload
            : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

// ─── Tool merging for proxy connectors ─────────────────────────

/**
 * Namespace separator for proxied tools.
 *
 * `__` (double underscore) is the only safe choice across LLM providers
 * because most function-name validators only allow `[a-zA-Z0-9_-]`. We
 * can't use `:` (Kimi/OpenAI reject), and `-`/`_` are ambiguous because
 * tool names and slugs both use them.
 *
 * Slugs are guaranteed to contain no underscores (regex `[a-z0-9-]`),
 * so `__` cleanly separates `<slug>__<toolName>`.
 */
export const NAMESPACE_SEPARATOR = "__";

/**
 * Build the merged tool list: static URI-based tools + prefixed connector tools.
 * Connector tools are prefixed with "<slug>__" to avoid collisions.
 */
async function getAllTools(registry: ConnectorRegistry): Promise<MCPTool[]> {
  const staticTools = [...TOOL_DEFS];
  const connectors = registry.listConnectors();
  const extraLists = await Promise.all(
    connectors.map(async (c) => {
      try {
        const tools = await c.listTools();
        const ns = c.toolNamespace();
        if (!ns) return tools;
        return tools.map((t) => ({
          ...t,
          name: `${ns}${NAMESPACE_SEPARATOR}${t.name}`,
          description: `[${c.config.name}] ${t.description}`,
        }));
      } catch (err) {
        console.error(`[MCP] listTools failed for ${c.config.name}:`, err);
        return [];
      }
    })
  );
  return staticTools.concat(extraLists.flat());
}

function findConnectorBySlug(
  registry: ConnectorRegistry,
  slug: string
): BaseConnector | undefined {
  return registry.listConnectors().find((c) => c.toolNamespace() === slug);
}

// ───────────────────────────────────────────────────────────────
// Built-in prompts ("skills")
// ───────────────────────────────────────────────────────────────

interface PromptDefinition {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
  build: (args: Record<string, string>) => Array<{
    role: "user" | "assistant";
    content: { type: "text"; text: string };
  }>;
}

const BUILTIN_PROMPTS: PromptDefinition[] = [
  {
    name: "onboard",
    description:
      "Skill: first-time orientation — what is this ContextGate workspace and what should the user try?",
    build: () => [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "I'm new here. Show me around this ContextGate workspace.\n\n" +
            "1. Read your own instructions (the system message). Pull out the workspace name and the data sources you can reach.\n" +
            "2. Call `resources/list` (or `list_directory` for each connector root URI) so the user sees top-level structure.\n" +
            "3. Suggest 3 concrete questions the user could ask given what they see. Make them specific (file names / table names) — not generic.\n" +
            "4. Mention which actions are read-only vs read-write so the user knows what's safe.\n" +
            "5. Stop. Wait for the user to pick a direction.",
        },
      },
    ],
  },
  {
    name: "explore-context",
    description:
      "Skill: discover what data this ContextGate workspace contains before answering.",
    build: () => [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "Walk me through the data this ContextGate workspace exposes:\n\n" +
            "1. Call `resources/list` to enumerate all available resources.\n" +
            "2. Group the result by URI prefix (i.e. by connector) and present a short tree (no more than 30 entries).\n" +
            "3. Note any connector that returned an error or appears read-only.\n" +
            "4. Stop. Do NOT read file contents in this step — wait for me to ask.\n" +
            "5. End with a single line summarising what kinds of questions this workspace can answer.",
        },
      },
    ],
  },
  {
    name: "summarize-workspace",
    description:
      "Skill: produce a high-level summary of what's stored across all connectors.",
    build: () => [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "Produce a one-page executive summary of this workspace:\n\n" +
            "1. Use `resources/list` to enumerate all resources.\n" +
            "2. Sample-read 5 representative resources via `read_file` (mix of small + large names).\n" +
            "3. From those samples, infer broad categories of content (e.g. 'product specs', 'meeting notes', 'configs').\n" +
            "4. Output:\n" +
            "   - **Workspace contains:** <N> connectors / ~<X> resources (estimate)\n" +
            "   - **Categories:** bulleted list with 1-line descriptions\n" +
            "   - **Likely use cases:** 3 questions this workspace can answer well\n" +
            "   - **Gaps:** what's clearly missing or sparse\n" +
            "5. Cite at least 3 URIs to ground your inferences.",
        },
      },
    ],
  },
  {
    name: "find-files",
    description:
      "Skill: locate files matching a topic without bulk-reading the whole tree.",
    arguments: [
      {
        name: "topic",
        description: "Keyword or short phrase describing what to find.",
        required: true,
      },
    ],
    build: (args) => {
      const topic = args.topic ?? "<topic>";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Find resources relevant to: **${topic}**.\n\n` +
              `Approach:\n` +
              `1. Call \`resources/list\` to enumerate candidates.\n` +
              `2. Pick at most 5 URIs whose names plausibly relate to the topic.\n` +
              `3. Read each chosen URI with \`read_file\`.\n` +
              `4. For each URI return:\n` +
              `   - the URI you read\n` +
              `   - one-sentence relevance verdict\n` +
              `   - a single representative quote (≤25 words)\n` +
              `5. If none match, say so explicitly. Don't invent contents.`,
          },
        },
      ];
    },
  },
  {
    name: "citation-check",
    description:
      "Skill: verify whether a specific claim is supported by files in the workspace.",
    arguments: [
      {
        name: "claim",
        description: "The factual claim to verify (one sentence).",
        required: true,
      },
    ],
    build: (args) => {
      const claim = args.claim ?? "<claim>";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Verify this claim against the workspace: **"${claim}"**\n\n` +
              `Procedure:\n` +
              `1. Identify the 3-5 most likely URIs that would contain evidence (use \`resources/list\` and pick by name).\n` +
              `2. Read each candidate with \`read_file\` and search for direct support, contradiction, or silence.\n` +
              `3. Report a verdict in this format:\n` +
              `   - **Verdict:** Supported / Contradicted / Not found\n` +
              `   - **Evidence:** quote (≤30 words) + URI for each fragment\n` +
              `   - **Confidence:** High / Medium / Low + one-sentence reasoning\n` +
              `4. Do NOT extrapolate beyond what the files say. If silent, say "Not found" — do not guess.`,
          },
        },
      ];
    },
  },
  {
    name: "compare-files",
    description:
      "Skill: read two files and produce a structured comparison or diff summary.",
    arguments: [
      { name: "uriA", description: "URI of the first resource.", required: true },
      { name: "uriB", description: "URI of the second resource.", required: true },
    ],
    build: (args) => {
      const a = args.uriA ?? "<uriA>";
      const b = args.uriB ?? "<uriB>";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Compare \`${a}\` and \`${b}\`.\n\n` +
              `1. Read both with \`read_file\`.\n` +
              `2. Produce:\n` +
              `   - **Common ground:** 3-5 bullets where the files agree.\n` +
              `   - **Differences:** 3-5 bullets where they disagree or one says more than the other.\n` +
              `   - **Recommendation:** which file is more authoritative and why (or "they cover different scopes — keep both").\n` +
              `3. Quote at least one short snippet from each file.\n` +
              `4. If either file is missing or unreadable, say so and stop.`,
          },
        },
      ];
    },
  },
  {
    name: "audit-recent",
    description:
      "Skill: explain what this agent has been doing recently — useful for users debugging access issues.",
    build: () => [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "Summarise this agent's recent activity for the user.\n\n" +
            "ContextGate logs every tool call as audit events with status (allowed/denied/error). " +
            "You don't have direct read access to those logs from MCP, but you can:\n\n" +
            "1. Tell the user where to view them: the dashboard's `/audit` page (Live mode shows real-time entries).\n" +
            "2. Recap your own recent actions in this conversation: which tools you called, on what URIs, what you got back.\n" +
            "3. If any call recently returned `Access denied`, surface the URI and remind the user that policies are managed in `/policies` in the dashboard.\n" +
            "4. Suggest filters they can apply on the audit page.",
        },
      },
    ],
  },
  {
    name: "safe-edit",
    description:
      "Skill: propose a file edit, verify it with the user, then write atomically.",
    arguments: [
      {
        name: "uri",
        description: "URI of the file to edit (must already exist).",
        required: true,
      },
      {
        name: "instruction",
        description: "Plain-language description of the change.",
        required: true,
      },
    ],
    build: (args) => {
      const uri = args.uri ?? "<uri>";
      const instruction = args.instruction ?? "<instruction>";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Edit file \`${uri}\`. Goal: ${instruction}\n\n` +
              `Procedure:\n` +
              `1. Call \`read_file\` to fetch the current contents.\n` +
              `2. Show me a diff (before / after) of ONLY the lines that change.\n` +
              `3. Wait for me to type "yes" before doing anything.\n` +
              `4. Once confirmed, call \`write_file\` with the full new content.\n` +
              `5. Confirm by reading the file again and showing the first 20 lines.\n` +
              `If the connector is read-only, abort at step 2 and tell me.`,
          },
        },
      ];
    },
  },
];

// ───────────────────────────────────────────────────────────────
// Factory
// ───────────────────────────────────────────────────────────────

export function createMCPServer(
  registry: ConnectorRegistry,
  options: CreateMCPServerOptions = {}
) {
  const server = new Server(
    { name: "contextgate", version: "0.2.0" },
    {
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: options.instructions,
    }
  );

  // ─── Tools ────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: await getAllTools(registry) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as {
      uri?: string;
      content?: string;
      maxDepth?: number;
    };

    // ── Namespaced tool (proxy connector) ─────────────────────
    const sepIdx = name.indexOf(NAMESPACE_SEPARATOR);
    if (sepIdx > 0) {
      const slug = name.slice(0, sepIdx);
      const originalName = name.slice(sepIdx + NAMESPACE_SEPARATOR.length);
      const conn = findConnectorBySlug(registry, slug);
      if (!conn) {
        throw new Error(`No proxy connector found for namespace "${slug}"`);
      }
      return toolResult(await conn.callTool(originalName, args));
    }

    // ── URI-based generic tools ───────────────────────────────
    if (!a.uri) throw new Error(`Missing required argument 'uri' for ${name}`);
    const conn = findConnectorForUri(registry, a.uri);

    switch (name) {
      case "read_file":
        return toolResult(await conn.readByUri(a.uri));
      case "list_directory":
        return toolResult(await conn.listByUri(a.uri, a.maxDepth));
      case "write_file":
        if (typeof a.content !== "string")
          throw new Error("write_file requires 'content' (string)");
        return toolResult(await conn.writeByUri(a.uri, a.content));
      case "append_file":
        if (typeof a.content !== "string")
          throw new Error("append_file requires 'content' (string)");
        return toolResult(await conn.appendByUri(a.uri, a.content));
      case "delete_file":
        return toolResult(await conn.deleteByUri(a.uri));
      case "create_directory":
        return toolResult(await conn.createDirectoryByUri(a.uri));
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // ─── Resources ────────────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const all: Array<{
      uri: string;
      name: string;
      mimeType?: string;
    }> = [];
    for (const c of registry.listConnectors()) {
      try {
        const items = await c.listResources();
        for (const r of items) {
          all.push({
            uri: r.uri,
            name: `${c.config.name}/${r.name}`,
            mimeType: r.mimeType,
          });
        }
      } catch {
        // Skip connectors that fail to enumerate; the dashboard
        // /resources page surfaces the error instead.
      }
    }
    return { resources: all };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
    const uri = request.params.uri as string;
    const conn = findConnectorForUri(registry, uri);
    const resource = await conn.readResource(uri);
    return {
      contents: [
        {
          uri: resource.uri,
          mimeType: resource.mimeType,
          text: resource.text,
        },
      ],
    };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    // One template per active connector — lets clients autocomplete URIs.
    const templates = registry.listConnectors().map((c) => ({
      uriTemplate: `${c.uriPrefix()}file/{path}`,
      name: c.config.name,
      description: `Files in ${c.config.name} (${c.config.type}${
        c.config.readOnly ? ", read-only" : ", read-write"
      })`,
      mimeType: undefined,
    }));
    return { resourceTemplates: templates };
  });

  // ─── Prompts ──────────────────────────────────────────────
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: BUILTIN_PROMPTS.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params;
    const def = BUILTIN_PROMPTS.find((p) => p.name === name);
    if (!def) throw new Error(`Prompt not found: ${name}`);

    const messages = def.build((args ?? {}) as Record<string, string>);
    return {
      description: def.description,
      messages,
    };
  });

  return server;
}
