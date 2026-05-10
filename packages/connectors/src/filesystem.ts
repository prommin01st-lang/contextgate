/**
 * FileSystem Connector — URI-based filesystem operations.
 *
 * URI shapes:
 *   filesystem://<connectorId>/file/<relative-path>
 *   filesystem://<connectorId>/directory/<relative-path>
 *
 * The MCP server calls the URI-based methods directly; legacy
 * listTools/callTool are kept empty so unit tests still compile.
 */

import { promises as fs } from "fs";
import * as path from "path";
import {
  MCPResource,
  ConnectorConfig,
  BaseConnector,
  ReadResult,
  ListResult,
  WriteResult,
  DirectoryEntry,
} from "./base.js";

export interface FileSystemConfig {
  rootPath: string;
  allowedExtensions?: string[];
  maxFileSize?: number;
}

export class FileSystemConnector extends BaseConnector {
  readonly config: ConnectorConfig;
  private resolvedRoot!: string;

  constructor(config: ConnectorConfig) {
    super();
    this.config = config;
  }

  // ─── lifecycle ────────────────────────────────────────────────
  async connect(): Promise<void> {
    const cfg = this.cfg();
    this.resolvedRoot = path.resolve(cfg.rootPath);
    const stat = await fs.stat(this.resolvedRoot);
    if (!stat.isDirectory()) {
      throw new Error(`rootPath is not a directory: ${this.resolvedRoot}`);
    }
  }

  async disconnect(): Promise<void> {}

  // ─── resources ────────────────────────────────────────────────
  async listResources(): Promise<MCPResource[]> {
    const cfg = this.cfg();
    const out: MCPResource[] = [];
    await this.walkDir(this.resolvedRoot, "", out, cfg.allowedExtensions);
    return out;
  }

  async readResource(uri: string): Promise<MCPResource> {
    const result = await this.readByUri(uri);
    return {
      uri,
      name: this.parseUri(uri).path,
      mimeType: result.mimeType,
      text: result.content,
    };
  }

  // ─── URI-based ops ────────────────────────────────────────────
  async readByUri(uri: string): Promise<ReadResult> {
    const { kind, path: rel } = this.parseUri(uri);
    if (kind !== "file") {
      throw new Error(`read_file requires a file:// URI, got "${uri}"`);
    }
    const full = this.resolveSafePath(rel);

    const stat = await fs.stat(full);
    if (!stat.isFile()) throw new Error(`Not a file: ${rel}`);

    const cfg = this.cfg();
    if (cfg.maxFileSize != null && stat.size > cfg.maxFileSize) {
      throw new Error(`File exceeds max size limit (${cfg.maxFileSize} bytes)`);
    }
    this.assertExtensionAllowed(full);

    const content = await fs.readFile(full, "utf-8");
    return { content, mimeType: this.getMimeType(full) };
  }

  async listByUri(uri: string, maxDepth = 3): Promise<ListResult> {
    const { path: rel } = this.parseUri(uri, /*allowDirectoryWithoutPrefix*/ true);
    const fullDir = this.resolveSafePath(rel);

    const stat = await fs.stat(fullDir);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${rel}`);
    }

    const entries = await this.walkDirectory(fullDir, rel, 0, maxDepth);
    return { uri, entries };
  }

  async writeByUri(uri: string, content: string): Promise<WriteResult> {
    this.assertWritable("write_file");
    const { path: rel } = this.parseUri(uri, false, "file");
    const full = this.resolveSafePath(rel);
    this.assertExtensionAllowed(full);

    const cfg = this.cfg();
    const bytes = Buffer.byteLength(content, "utf-8");
    if (cfg.maxFileSize != null && bytes > cfg.maxFileSize) {
      throw new Error(
        `Content exceeds max file size limit (${cfg.maxFileSize} bytes)`
      );
    }

    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf-8");
    return { uri, bytesWritten: bytes };
  }

  async appendByUri(uri: string, content: string): Promise<WriteResult> {
    this.assertWritable("append_file");
    const { path: rel } = this.parseUri(uri, false, "file");
    const full = this.resolveSafePath(rel);
    this.assertExtensionAllowed(full);

    const cfg = this.cfg();
    const bytes = Buffer.byteLength(content, "utf-8");

    if (cfg.maxFileSize != null) {
      try {
        const stat = await fs.stat(full);
        if (stat.size + bytes > cfg.maxFileSize) {
          throw new Error(
            `Append would exceed max file size limit (${cfg.maxFileSize} bytes)`
          );
        }
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        if (bytes > cfg.maxFileSize) {
          throw new Error(
            `Content exceeds max file size limit (${cfg.maxFileSize} bytes)`
          );
        }
      }
    }

    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.appendFile(full, content, "utf-8");
    return { uri, bytesWritten: bytes };
  }

  async deleteByUri(uri: string): Promise<{ uri: string }> {
    this.assertWritable("delete_file");
    const { kind, path: rel } = this.parseUri(uri, true);
    const full = this.resolveSafePath(rel);

    const stat = await fs.stat(full);
    if (kind === "file" && !stat.isFile()) {
      throw new Error(`Not a file: ${rel}`);
    }
    if (stat.isFile()) {
      this.assertExtensionAllowed(full);
      await fs.unlink(full);
    } else {
      await fs.rm(full, { recursive: true, force: true });
    }
    return { uri };
  }

  async createDirectoryByUri(uri: string): Promise<{ uri: string }> {
    this.assertWritable("create_directory");
    const { path: rel } = this.parseUri(uri, true, "directory");
    const full = this.resolveSafePath(rel);
    await fs.mkdir(full, { recursive: true });
    return { uri };
  }

  // ─── helpers ──────────────────────────────────────────────────
  private cfg(): FileSystemConfig {
    return this.config.config as unknown as FileSystemConfig;
  }

  /**
   * Parse a `filesystem://<id>/{file|directory}/<path>` URI.
   * If `allowDirectoryWithoutPrefix` is true, the bare prefix
   * `filesystem://<id>/` is also accepted (treated as root directory).
   * If `expectKind` is set, mismatches throw.
   */
  private parseUri(
    uri: string,
    allowDirectoryWithoutPrefix = false,
    expectKind?: "file" | "directory"
  ): { kind: "file" | "directory"; path: string } {
    const prefix = this.uriPrefix();
    if (!uri.startsWith(prefix)) {
      throw new Error(`Invalid filesystem URI: ${uri}`);
    }
    const rest = uri.slice(prefix.length);

    if (rest === "" || rest === "/") {
      if (allowDirectoryWithoutPrefix || expectKind === "directory") {
        return { kind: "directory", path: "" };
      }
      throw new Error(`URI missing path: ${uri}`);
    }

    let kind: "file" | "directory";
    let pathPart: string;
    if (rest.startsWith("file/")) {
      kind = "file";
      pathPart = rest.slice("file/".length);
    } else if (rest.startsWith("directory/")) {
      kind = "directory";
      pathPart = rest.slice("directory/".length);
    } else if (allowDirectoryWithoutPrefix) {
      // tolerate bare path → assume directory
      kind = "directory";
      pathPart = rest;
    } else {
      throw new Error(`URI must contain /file/ or /directory/: ${uri}`);
    }

    if (expectKind && kind !== expectKind) {
      throw new Error(
        `URI kind mismatch — expected ${expectKind}, got ${kind}: ${uri}`
      );
    }

    return { kind, path: decodeURIComponent(pathPart) };
  }

  private resolveSafePath(relativePath: string): string {
    const root = path.resolve(this.resolvedRoot);
    const full = path.resolve(path.join(root, relativePath));
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error("Access denied: path traversal detected");
    }
    return full;
  }

  private assertExtensionAllowed(fullPath: string): void {
    const cfg = this.cfg();
    if (cfg.allowedExtensions == null || cfg.allowedExtensions.length === 0) return;
    const ext = path.extname(fullPath).toLowerCase();
    if (!cfg.allowedExtensions.includes(ext)) {
      throw new Error(`File extension not allowed: ${ext || "(none)"}`);
    }
  }

  private assertWritable(op: string): void {
    if (this.config.readOnly) {
      throw new Error(
        `Connector "${this.config.name}" is read-only — ${op} disabled`
      );
    }
  }

  private async walkDir(
    dir: string,
    rel: string,
    out: MCPResource[],
    allowedExts?: string[]
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = rel ? path.join(rel, entry.name) : entry.name;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkDir(fullPath, relPath, out, allowedExts);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (allowedExts != null && !allowedExts.includes(ext)) continue;
        out.push({
          uri: `${this.uriPrefix()}file/${relPath.replace(/\\/g, "/")}`,
          name: relPath,
          mimeType: this.getMimeType(entry.name),
        });
      }
    }
  }

  private async walkDirectory(
    dir: string,
    rel: string,
    depth: number,
    maxDepth: number
  ): Promise<DirectoryEntry[]> {
    if (depth > maxDepth) return [];
    const entries: DirectoryEntry[] = [];
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const relPath = rel ? `${rel}/${item.name}` : item.name;
      const baseUri = this.uriPrefix();
      if (item.isDirectory()) {
        entries.push({
          name: item.name,
          type: "directory",
          uri: `${baseUri}directory/${relPath}`,
        });
        if (depth + 1 <= maxDepth) {
          const sub = await this.walkDirectory(
            path.join(dir, item.name),
            relPath,
            depth + 1,
            maxDepth
          );
          entries.push(...sub);
        }
      } else {
        entries.push({
          name: item.name,
          type: "file",
          uri: `${baseUri}file/${relPath}`,
        });
      }
    }
    return entries;
  }

  private getMimeType(file: string): string {
    const ext = path.extname(file).toLowerCase();
    const map: Record<string, string> = {
      ".md": "text/markdown",
      ".txt": "text/plain",
      ".json": "application/json",
      ".csv": "text/csv",
      ".ts": "text/typescript",
      ".js": "text/javascript",
      ".html": "text/html",
      ".css": "text/css",
      ".xml": "application/xml",
      ".yaml": "text/yaml",
      ".yml": "text/yaml",
    };
    return map[ext] ?? "application/octet-stream";
  }
}
