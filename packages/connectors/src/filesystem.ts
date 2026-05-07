/**
 * FileSystem Connector for ContextGate
 * Secure file access with path traversal protection and size limits
 */

import { promises as fs } from "fs";
import * as path from "path";
import { MCPResource, MCPTool, ConnectorConfig, BaseConnector } from "./types.js";

export interface FileSystemConfig {
  rootPath: string;
  allowedExtensions?: string[];
  maxFileSize?: number; // bytes
}

export class FileSystemConnector implements BaseConnector {
  readonly config: ConnectorConfig;
  private resolvedRoot!: string;

  constructor(config: ConnectorConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const cfg = this.config.config as FileSystemConfig;
    this.resolvedRoot = path.resolve(cfg.rootPath);
    const stat = await fs.stat(this.resolvedRoot);
    if (!stat.isDirectory()) {
      throw new Error(`rootPath is not a directory: ${this.resolvedRoot}`);
    }
  }

  async disconnect(): Promise<void> {
    // No persistent connections
  }

  async listResources(): Promise<MCPResource[]> {
    const cfg = this.config.config as FileSystemConfig;
    const resources: MCPResource[] = [];
    await this.walkDir(this.resolvedRoot, "", resources, cfg.allowedExtensions);
    return resources;
  }

  async readResource(uri: string): Promise<MCPResource> {
    const relativePath = this.parseUri(uri);
    const fullPath = path.resolve(path.join(this.resolvedRoot, relativePath));

    // SECURITY: path traversal protection
    if (!fullPath.startsWith(this.resolvedRoot)) {
      throw new Error("Access denied: path traversal detected");
    }

    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${uri}`);
    }

    // SECURITY: max file size check
    const cfg = this.config.config as FileSystemConfig;
    if (cfg.maxFileSize != null && stat.size > cfg.maxFileSize) {
      throw new Error(`File exceeds max size limit (${cfg.maxFileSize} bytes)`);
    }

    // SECURITY: extension check
    if (cfg.allowedExtensions != null) {
      const ext = path.extname(fullPath).toLowerCase();
      if (!cfg.allowedExtensions.includes(ext)) {
        throw new Error(`File extension not allowed: ${ext}`);
      }
    }

    const content = await fs.readFile(fullPath, "utf-8");
    return {
      uri,
      name: relativePath,
      mimeType: this.getMimeType(fullPath),
      text: content,
    };
  }

  async listTools(): Promise<MCPTool[]> {
    return [
      {
        name: `search_files_${this.config.id}`,
        description: `Search files in ${this.config.name}`,
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Glob pattern or search term" },
          },
          required: ["query"],
        },
      },
    ];
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    return { message: "Not implemented in Phase 1" };
  }

  // ─── private helpers ──────────────────────────────────────────────

  private parseUri(uri: string): string {
    const prefix = `filesystem://${this.config.id}/file/`;
    if (!uri.startsWith(prefix)) {
      throw new Error(`Invalid filesystem URI: ${uri}`);
    }
    return decodeURIComponent(uri.slice(prefix.length));
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
          uri: `filesystem://${this.config.id}/file/${relPath.replace(/\\/g, "/")}`,
          name: relPath,
          mimeType: this.getMimeType(entry.name),
        });
      }
    }
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
