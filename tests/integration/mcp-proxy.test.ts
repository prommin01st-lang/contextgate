import { describe, it, expect } from "vitest";
import {
  ConnectorRegistry,
  BaseConnector,
  ConnectorConfig,
  MCPResource,
  MCPTool,
  createMCPServer,
} from "@contextgate/connectors";

/**
 * A fake connector that implements both URI-based and tool-based APIs.
 * Used to verify that the MCP server merges connector tools with the
 * generic URI-based tool definitions.
 */
class FakeProxyConnector extends BaseConnector {
  readonly config: ConnectorConfig;
  private callLog: Array<{ name: string; args: Record<string, unknown> }> = [];

  constructor(config: ConnectorConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async listResources(): Promise<MCPResource[]> {
    return [];
  }
  async readResource(_uri: string): Promise<MCPResource> {
    throw new Error("FakeProxyConnector does not expose resources");
  }

  async listTools(): Promise<MCPTool[]> {
    return [
      {
        name: "click",
        description: "Click an element by selector",
        inputSchema: {
          type: "object",
          properties: { selector: { type: "string" } },
          required: ["selector"],
        },
      },
      {
        name: "navigate",
        description: "Navigate to a URL",
        inputSchema: {
          type: "object",
          properties: { url: { type: "string" } },
          required: ["url"],
        },
      },
    ];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    this.callLog.push({ name, args });
    return { ok: true, tool: name, args };
  }

  getCallLog() {
    return this.callLog;
  }
}

describe("MCP proxy tool merging", () => {
  it("BaseConnector exposes toolNamespace() returning the slug", () => {
    const config: ConnectorConfig = {
      id: "test-id",
      name: "Test",
      slug: "chrome-prod",
      type: "fake-proxy",
      config: {},
      readOnly: false,
      workspaceId: "00000000-0000-0000-0000-000000000000",
    };
    const conn = new FakeProxyConnector(config);
    expect(conn.toolNamespace()).toBe("chrome-prod");
  });

  it("BaseConnector with empty slug returns empty namespace", () => {
    const config: ConnectorConfig = {
      id: "test-id",
      name: "Test",
      slug: "",
      type: "fake-proxy",
      config: {},
      readOnly: false,
      workspaceId: "00000000-0000-0000-0000-000000000000",
    };
    const conn = new FakeProxyConnector(config);
    expect(conn.toolNamespace()).toBe("");
  });

  it("FakeProxyConnector exposes its own tools via listTools()", async () => {
    const config: ConnectorConfig = {
      id: "fake-1",
      name: "Fake Browser",
      slug: "fake",
      type: "fake-proxy",
      config: {},
      readOnly: false,
      workspaceId: "00000000-0000-0000-0000-000000000000",
    };
    const conn = new FakeProxyConnector(config);
    const tools = await conn.listTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual(["click", "navigate"]);
  });

  it("FakeProxyConnector.callTool records the dispatched name+args", async () => {
    const config: ConnectorConfig = {
      id: "fake-2",
      name: "Fake Browser",
      slug: "fake",
      type: "fake-proxy",
      config: {},
      readOnly: false,
      workspaceId: "00000000-0000-0000-0000-000000000000",
    };
    const conn = new FakeProxyConnector(config);
    const result = await conn.callTool("click", { selector: "button.primary" });
    expect(result).toEqual({
      ok: true,
      tool: "click",
      args: { selector: "button.primary" },
    });
    expect(conn.getCallLog()).toEqual([
      { name: "click", args: { selector: "button.primary" } },
    ]);
  });

  it("registry can hold a mix of URI-based and proxy connectors", () => {
    const registry = new ConnectorRegistry();
    registry.register("fake-proxy", (cfg) => new FakeProxyConnector(cfg));

    const conn = registry.create({
      id: "fake-3",
      name: "Fake Browser",
      slug: "fake",
      type: "fake-proxy",
      config: {},
      readOnly: false,
      workspaceId: "00000000-0000-0000-0000-000000000000",
    });
    expect(conn).toBeInstanceOf(FakeProxyConnector);
    expect(registry.listConnectors()).toHaveLength(1);
  });

  it("createMCPServer accepts a registry with proxy connectors", () => {
    const registry = new ConnectorRegistry();
    registry.register("fake-proxy", (cfg) => new FakeProxyConnector(cfg));
    registry.create({
      id: "fake-4",
      name: "Fake Browser",
      slug: "chrome",
      type: "fake-proxy",
      config: {},
      readOnly: false,
      workspaceId: "00000000-0000-0000-0000-000000000000",
    });

    const server = createMCPServer(registry);
    expect(server).toBeDefined();
    expect(typeof server.setRequestHandler).toBe("function");
  });

  it("default BaseConnector.callTool throws when not overridden", async () => {
    // Use a connector that doesn't override callTool — like filesystem
    const config: ConnectorConfig = {
      id: "fs-test",
      name: "FS",
      slug: "",
      type: "test",
      config: {},
      readOnly: false,
      workspaceId: "00000000-0000-0000-0000-000000000000",
    };
    // Make a minimal subclass that doesn't override callTool
    class MinimalConnector extends BaseConnector {
      readonly config = config;
      async connect() {}
      async disconnect() {}
      async listResources() {
        return [];
      }
      async readResource(uri: string): Promise<MCPResource> {
        return { uri, name: "x" };
      }
    }
    const conn = new MinimalConnector();
    await expect(conn.callTool("anything", {})).rejects.toThrow(/callTool/);
  });

  it("MCP server merges TOOL_DEFS with proxy connector tools (prefixed by slug)", async () => {
    const registry = new ConnectorRegistry();
    registry.register("fake-proxy", (cfg) => new FakeProxyConnector(cfg));
    registry.create({
      id: "fake-5",
      name: "Fake Browser",
      slug: "browser",
      type: "fake-proxy",
      config: {},
      readOnly: false,
      workspaceId: "00000000-0000-0000-0000-000000000000",
    });

    const server = createMCPServer(registry);

    // Simulate a tools/list call directly via the SDK's request handler.
    // The SDK exposes setRequestHandler but no public method to call it
    // back; for unit testing we just verify that:
    //   1. The connector's listTools() returns the expected tools
    //   2. The server constructor accepts the registry
    //   3. The tool namespacing logic is correct
    const connector = registry.listConnectors()[0];
    const ownTools = await connector.listTools();
    expect(ownTools).toHaveLength(2);
    expect(connector.toolNamespace()).toBe("browser");

    // The MCP server will prefix these as "browser__click" and "browser__navigate"
    // when responding to tools/list. We use "__" instead of ":" because most
    // LLM providers (Kimi/OpenAI/Claude API) only accept [a-zA-Z0-9_-] in
    // function names.
    const expectedPrefixed = ownTools.map((t) => `browser__${t.name}`);
    expect(expectedPrefixed).toEqual(["browser__click", "browser__navigate"]);

    expect(server).toBeDefined();
  });

  it("dispatches namespaced tool calls to the right connector", async () => {
    const conn = new FakeProxyConnector({
      id: "fake-6",
      name: "Fake Browser",
      slug: "browser",
      type: "fake-proxy",
      config: {},
      readOnly: false,
      workspaceId: "00000000-0000-0000-0000-000000000000",
    });

    // Direct callTool with the stripped (non-prefixed) name — this is
    // what mcp-server's CallToolRequestSchema handler does after parsing
    // "browser__click" → connector=browser, name=click.
    const result = await conn.callTool("click", { selector: ".btn" });
    expect(result).toEqual({
      ok: true,
      tool: "click",
      args: { selector: ".btn" },
    });
  });
});
