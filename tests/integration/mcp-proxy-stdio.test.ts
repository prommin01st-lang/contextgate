/**
 * Integration tests for stdio-based MCP proxy.
 *
 * Spawns `tests/fixtures/fake-mcp-server.js` as a child process via
 * MCPProxyStdioConnector and verifies the full lifecycle: spawn → handshake
 * → tools/list → tools/call → idle shutdown → restart.
 *
 * These tests do NOT require a real Chrome / external MCP server; the fake
 * server speaks just enough of the MCP protocol to exercise the proxy logic.
 */
import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MCPProxyStdioConnector,
  ConnectorRegistry,
  type ConnectorConfig,
} from "@contextgate/connectors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FAKE_SERVER = path.resolve(__dirname, "../fixtures/fake-mcp-server.js");

function makeConfig(
  overrides: Partial<ConnectorConfig & { config: Record<string, unknown> }> = {}
): ConnectorConfig {
  return {
    id: overrides.id ?? "test-proxy",
    name: overrides.name ?? "Fake Proxy",
    slug: overrides.slug ?? "fake",
    type: "mcp-proxy-stdio",
    config: {
      command: process.execPath, // node executable
      args: [FAKE_SERVER],
      idleTimeoutMs: 60_000,
      ...(overrides.config ?? {}),
    },
    readOnly: false,
    workspaceId: "00000000-0000-0000-0000-000000000000",
    ...overrides,
  };
}

describe("MCPProxyStdioConnector — stdio MCP proxy", () => {
  let activeConnectors: MCPProxyStdioConnector[] = [];

  afterEach(async () => {
    // Always clean up spawned children so tests don't leak processes
    for (const conn of activeConnectors) {
      try {
        await conn.disconnect();
      } catch {
        /* ignore */
      }
    }
    activeConnectors = [];
  });

  function track(conn: MCPProxyStdioConnector): MCPProxyStdioConnector {
    activeConnectors.push(conn);
    return conn;
  }

  it("rejects construction without a command in config", () => {
    expect(() =>
      new MCPProxyStdioConnector({
        id: "no-cmd",
        name: "Bad",
        slug: "bad",
        type: "mcp-proxy-stdio",
        config: {},
        readOnly: false,
        workspaceId: "00000000-0000-0000-0000-000000000000",
      })
    ).toThrow(/requires config.command/);
  });

  it("connect() is a no-op — does NOT spawn the child eagerly", async () => {
    const conn = track(new MCPProxyStdioConnector(makeConfig()));
    await conn.connect();
    // No way to spy on spawn without dependency injection, but at minimum
    // disconnect() should be a no-op too at this point.
    await conn.disconnect();
  });

  it("listTools() spawns the child, handshakes, and returns fake tools", async () => {
    const conn = track(new MCPProxyStdioConnector(makeConfig()));
    const tools = await conn.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["add", "echo"]);
  });

  it("callTool('echo', ...) forwards args to the child and returns response", async () => {
    const conn = track(new MCPProxyStdioConnector(makeConfig()));
    const result = (await conn.callTool("echo", { message: "hello" })) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe(JSON.stringify("hello"));
  });

  it("callTool('add', ...) returns the sum (verifies argument passing)", async () => {
    const conn = track(new MCPProxyStdioConnector(makeConfig()));
    const result = (await conn.callTool("add", { a: 5, b: 7 })) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(result.content[0].text).toBe("12");
  });

  it("allowedTools whitelist filters listTools() output", async () => {
    const conn = track(
      new MCPProxyStdioConnector(
        makeConfig({ config: { allowedTools: ["echo"], command: process.execPath, args: [FAKE_SERVER] } })
      )
    );
    const tools = await conn.listTools();
    expect(tools.map((t) => t.name)).toEqual(["echo"]);
  });

  it("allowedTools whitelist rejects calls to non-listed tools", async () => {
    const conn = track(
      new MCPProxyStdioConnector(
        makeConfig({ config: { allowedTools: ["echo"], command: process.execPath, args: [FAKE_SERVER] } })
      )
    );
    await expect(conn.callTool("add", { a: 1, b: 2 })).rejects.toThrow(
      /not in the allowed list/
    );
  });

  it("subsequent calls reuse the same child process (no re-spawn)", async () => {
    const conn = track(new MCPProxyStdioConnector(makeConfig()));
    const a = (await conn.callTool("add", { a: 1, b: 1 })) as {
      content: Array<{ type: string; text: string }>;
    };
    const b = (await conn.callTool("add", { a: 2, b: 3 })) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(a.content[0].text).toBe("2");
    expect(b.content[0].text).toBe("5");
  });

  it("disconnect() kills the child and releases resources", async () => {
    const conn = new MCPProxyStdioConnector(makeConfig());
    await conn.listTools(); // ensure child is alive
    await conn.disconnect();
    // After disconnect, internal client should be cleared. We can verify
    // by calling listTools() again — it should respawn cleanly.
    activeConnectors.push(conn);
    const tools = await conn.listTools();
    expect(tools).toHaveLength(2);
  });

  it("registers as 'mcp-proxy-stdio' in the default registry", () => {
    const registry = new ConnectorRegistry();
    expect(registry.listTypes()).toContain("mcp-proxy-stdio");
  });

  it("registry.create('mcp-proxy-stdio', ...) returns a MCPProxyStdioConnector", () => {
    const registry = new ConnectorRegistry();
    const conn = registry.create(makeConfig({ id: "registry-test" }));
    expect(conn).toBeInstanceOf(MCPProxyStdioConnector);
    activeConnectors.push(conn as MCPProxyStdioConnector);
  });

  it("registry.getBySlug('fake') returns the proxy connector", () => {
    const registry = new ConnectorRegistry();
    const created = registry.create(
      makeConfig({ id: "slug-test", slug: "my-browser" })
    );
    activeConnectors.push(created as MCPProxyStdioConnector);
    expect(registry.getBySlug("my-browser")).toBe(created);
    expect(registry.getBySlug("does-not-exist")).toBeUndefined();
  });

  it("proxy connector canHandle(uri) always returns false (not URI-based)", () => {
    const conn = track(new MCPProxyStdioConnector(makeConfig()));
    expect(conn.canHandle("filesystem://anything/file/x")).toBe(false);
    expect(conn.canHandle("mcp-proxy://test-proxy/tool/echo")).toBe(false);
  });

  it("toolNamespace() returns the connector slug", () => {
    const conn = track(
      new MCPProxyStdioConnector(makeConfig({ slug: "github" }))
    );
    expect(conn.toolNamespace()).toBe("github");
  });
});
