#!/usr/bin/env node
/**
 * Fake stdio MCP server — used by integration tests to verify that
 * MCPProxyStdioConnector + StdioMcpClient can spawn a process, complete
 * the MCP initialize handshake, list tools, and dispatch tool calls.
 *
 * Protocol: newline-delimited JSON-RPC 2.0 over stdin/stdout.
 *
 * Supported requests:
 *   - initialize        → { protocolVersion, serverInfo, capabilities: { tools: {} } }
 *   - tools/list        → { tools: [echo, add] }
 *   - tools/call (echo) → { content: [{ type: "text", text: <args> }] }
 *   - tools/call (add)  → { content: [{ type: "text", text: <a + b> }] }
 *
 * Optional behaviour controlled via env vars:
 *   FAKE_MCP_INIT_DELAY_MS  — sleep this long before answering initialize
 *   FAKE_MCP_CRASH_ON_TOOL  — exit(1) when this tool name is called
 *   FAKE_MCP_STDERR         — write this line to stderr on startup
 */

const FAKE_TOOLS = [
  {
    name: "echo",
    description: "Return the arguments verbatim",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
  },
  {
    name: "add",
    description: "Add two numbers",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
      },
      required: ["a", "b"],
    },
  },
];

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleInitialize(id) {
  const delay = Number(process.env.FAKE_MCP_INIT_DELAY_MS ?? "0");
  if (delay > 0) {
    await new Promise((r) => setTimeout(r, delay));
  }
  reply(id, {
    protocolVersion: "2025-03-26",
    serverInfo: { name: "fake-mcp-server", version: "0.0.1" },
    capabilities: { tools: {} },
  });
}

function handleToolCall(id, params) {
  const name = params?.name;
  const args = params?.arguments ?? {};

  if (process.env.FAKE_MCP_CRASH_ON_TOOL && name === process.env.FAKE_MCP_CRASH_ON_TOOL) {
    process.stderr.write(`[fake-mcp] crashing on tool ${name}\n`);
    process.exit(1);
  }

  if (name === "echo") {
    reply(id, {
      content: [
        { type: "text", text: JSON.stringify(args.message ?? args) },
      ],
    });
    return;
  }
  if (name === "add") {
    const sum = Number(args.a ?? 0) + Number(args.b ?? 0);
    reply(id, { content: [{ type: "text", text: String(sum) }] });
    return;
  }
  replyError(id, -32601, `Unknown tool: ${name}`);
}

function handleMessage(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    process.stderr.write(`[fake-mcp] bad JSON: ${line}\n`);
    return;
  }
  const { id, method, params } = msg;

  // Notifications have no id — silently ignore
  if (id === undefined || id === null) return;

  switch (method) {
    case "initialize":
      void handleInitialize(id);
      return;
    case "tools/list":
      reply(id, { tools: FAKE_TOOLS });
      return;
    case "tools/call":
      handleToolCall(id, params);
      return;
    default:
      replyError(id, -32601, `Method not found: ${method}`);
      return;
  }
}

function main() {
  if (process.env.FAKE_MCP_STDERR) {
    process.stderr.write(`${process.env.FAKE_MCP_STDERR}\n`);
  }

  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) handleMessage(line);
    }
  });
  process.stdin.on("end", () => process.exit(0));

  // Allow the parent to terminate us cleanly
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
}

main();
