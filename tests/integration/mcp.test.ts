import { describe, it, expect } from "vitest";
import { ConnectorRegistry } from "@contextgate/connectors/registry.js";
import { FileSystemConnector } from "@contextgate/connectors/filesystem.js";
import { createMCPServer } from "@contextgate/connectors/mcp-server.js";

const baseConfig = {
  readOnly: false,
  workspaceId: "00000000-0000-0000-0000-000000000000",
};

describe("ConnectorRegistry", () => {
  it("can be instantiated", () => {
    const registry = new ConnectorRegistry();
    expect(registry).toBeDefined();
    expect(registry.listTypes()).toContain("filesystem");
    expect(registry.listTypes()).toContain("postgres");
    expect(registry.listTypes()).toContain("notion");
  });

  it("can create and retrieve a connector", () => {
    const registry = new ConnectorRegistry();
    const connector = registry.create({
      ...baseConfig,
      id: "fs-1",
      name: "Test FS",
      type: "filesystem",
      config: { rootPath: "/tmp" },
    });
    expect(connector).toBeDefined();
    expect(registry.get("fs-1")).toBe(connector);
  });
});

describe("FileSystemConnector (URI-based API)", () => {
  it("connects to a temp path", async () => {
    const connector = new FileSystemConnector({
      ...baseConfig,
      id: "fs-test",
      name: "Test Filesystem",
      type: "filesystem",
      config: { rootPath: "/tmp" },
    });
    expect(connector).toBeDefined();
    expect(connector.config.type).toBe("filesystem");
    await expect(connector.connect()).resolves.not.toThrow();
  });

  it("recognises its own URIs via canHandle()", async () => {
    const connector = new FileSystemConnector({
      ...baseConfig,
      id: "fs-handle",
      name: "Test FS",
      type: "filesystem",
      config: { rootPath: "/tmp" },
    });
    await connector.connect();

    expect(connector.canHandle("filesystem://fs-handle/file/x.md")).toBe(true);
    expect(connector.canHandle("filesystem://fs-handle/directory/")).toBe(true);
    expect(connector.canHandle("filesystem://other-conn/file/x.md")).toBe(false);
    expect(connector.canHandle("postgres://fs-handle/table/users")).toBe(false);
    expect(connector.uriPrefix()).toBe("filesystem://fs-handle/");
  });

  it("listByUri returns directory entries with URIs", async () => {
    const connector = new FileSystemConnector({
      ...baseConfig,
      id: "fs-list",
      name: "Test FS",
      type: "filesystem",
      config: { rootPath: "/tmp" },
    });
    await connector.connect();

    const result = await connector.listByUri(
      "filesystem://fs-list/directory/",
      0
    );
    expect(result.uri).toBe("filesystem://fs-list/directory/");
    expect(Array.isArray(result.entries)).toBe(true);
    // Every entry must have a URI we can dispatch back through MCP
    for (const e of result.entries) {
      expect(e.uri.startsWith("filesystem://fs-list/")).toBe(true);
      expect(["file", "directory"]).toContain(e.type);
    }
  });

  it("write/delete throw when readOnly", async () => {
    const connector = new FileSystemConnector({
      ...baseConfig,
      readOnly: true,
      id: "fs-ro",
      name: "Read Only FS",
      type: "filesystem",
      config: { rootPath: "/tmp" },
    });
    await connector.connect();

    await expect(
      connector.writeByUri("filesystem://fs-ro/file/x.md", "hi")
    ).rejects.toThrow(/read-only/);
    await expect(
      connector.deleteByUri("filesystem://fs-ro/file/x.md")
    ).rejects.toThrow(/read-only/);
  });
});

describe("createMCPServer", () => {
  it("returns a server object", () => {
    const registry = new ConnectorRegistry();
    const server = createMCPServer(registry);
    expect(server).toBeDefined();
    expect(typeof server.setRequestHandler).toBe("function");
  });

  it("builds with optional instructions", () => {
    const registry = new ConnectorRegistry();
    const server = createMCPServer(registry, {
      instructions: "Test instructions",
    });
    expect(server).toBeDefined();
  });
});
