/**
 * FileSystem Connector Tests
 * Uses Node.js built-in test runner (node:test) and assert.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { promises as fs, mkdtempSync } from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { FileSystemConnector } from "./filesystem.js";
import type { ConnectorConfig } from "./base.js";

describe("FileSystemConnector", async () => {
  let tempDir: string;
  let connector: FileSystemConnector;

  before(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "cg-fs-test-"));
    await fs.writeFile(path.join(tempDir, "hello.txt"), "Hello, World!");
    await fs.mkdir(path.join(tempDir, "subdir"));
    await fs.writeFile(path.join(tempDir, "subdir", "nested.md"), "# Nested");

    const config: ConnectorConfig = {
      id: "fs-test",
      name: "Test Filesystem",
      type: "filesystem",
      config: {
        rootPath: tempDir,
      },
      readOnly: true,
      workspaceId: "ws-test",
    };

    connector = new FileSystemConnector(config);
    await connector.connect();
  });

  after(async () => {
    await connector.disconnect();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should be instantiated and connected", async () => {
    assert.ok(connector);
    assert.strictEqual(connector.config.id, "fs-test");
  });

  it("listResources() returns files", async () => {
    const resources = await connector.listResources();
    const names = resources.map((r) => r.name.replace(/\\/g, "/")).sort();
    assert.deepStrictEqual(names, ["hello.txt", "subdir/nested.md"]);
  });

  it("callTool read_file returns content", async () => {
    const result = await connector.callTool("read_file_fs-test", { path: "hello.txt" });
    assert.ok(result && typeof result === "object");
    assert.strictEqual((result as any).content, "Hello, World!");
    assert.strictEqual((result as any).mimeType, "text/plain");
  });

  it("callTool list_directory returns entries", async () => {
    const result = await connector.callTool("list_directory_fs-test", { path: "", maxDepth: 2 });
    assert.ok(result && typeof result === "object");
    const content = (result as any).content as string;
    assert.ok(content.includes("hello.txt"));
    assert.ok(content.includes("subdir/"));
    assert.ok(content.includes("subdir/nested.md"));
  });

  it("callTool read_file blocks path traversal", async () => {
    await assert.rejects(
      async () => connector.callTool("read_file_fs-test", { path: "../outside.txt" }),
      /path traversal/
    );
  });
});
