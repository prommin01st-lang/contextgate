/**
 * Notion Connector for ContextGate
 * Whitelist-enforced database/page access
 */

import { Client as NotionClient } from "@notionhq/client";
import { MCPResource, MCPTool, ConnectorConfig, BaseConnector } from "./types.js";

export interface NotionConfig {
  token: string;
  databaseIds?: string[];
  pageIds?: string[];
}

export class NotionConnector implements BaseConnector {
  readonly config: ConnectorConfig;
  private client!: NotionClient;

  constructor(config: ConnectorConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const cfg = this.config.config as NotionConfig;
    this.client = new NotionClient({ auth: cfg.token });
    // Validate token
    await this.client.users.me({});
  }

  async disconnect(): Promise<void> {
    // NotionClient is stateless
  }

  async listResources(): Promise<MCPResource[]> {
    const cfg = this.config.config as NotionConfig;
    const resources: MCPResource[] = [];

    // Search and filter by whitelist
    const searchRes = await this.client.search({
      page_size: 100,
    });

    for (const item of searchRes.results) {
      if (item.object === "database") {
        if (cfg.databaseIds == null || cfg.databaseIds.includes(item.id)) {
          const db = item as any;
          const title = db.title?.[0]?.plain_text ?? "Untitled Database";
          resources.push({
            uri: `notion://${this.config.id}/database/${item.id}`,
            name: title,
            mimeType: "application/json",
          });
        }
      } else if (item.object === "page") {
        if (cfg.pageIds == null || cfg.pageIds.includes(item.id)) {
          const page = item as any;
          const title = this.extractPageTitle(page);
          resources.push({
            uri: `notion://${this.config.id}/page/${item.id}`,
            name: title,
            mimeType: "text/markdown",
          });
        }
      }
    }

    return resources;
  }

  async readResource(uri: string): Promise<MCPResource> {
    const parsed = this.parseUri(uri);
    const cfg = this.config.config as NotionConfig;

    // SECURITY: whitelist enforcement
    if (parsed.type === "database") {
      if (cfg.databaseIds != null && !cfg.databaseIds.includes(parsed.id)) {
        throw new Error(`Database not in whitelist: ${parsed.id}`);
      }
      const rows = await this.client.databases.query({
        database_id: parsed.id,
        page_size: 100,
      });
      return {
        uri,
        name: parsed.id,
        mimeType: "application/json",
        text: JSON.stringify(rows.results, null, 2),
      };
    }

    if (parsed.type === "page") {
      if (cfg.pageIds != null && !cfg.pageIds.includes(parsed.id)) {
        throw new Error(`Page not in whitelist: ${parsed.id}`);
      }
      const page = await this.client.pages.retrieve({ page_id: parsed.id });
      const blocks = await this.client.blocks.children.list({
        block_id: parsed.id,
        page_size: 100,
      });
      const md = this.blocksToMarkdown(blocks.results as any[]);
      return {
        uri,
        name: this.extractPageTitle(page as any),
        mimeType: "text/markdown",
        text: md,
      };
    }

    throw new Error(`Unknown Notion resource type: ${parsed.type}`);
  }

  async listTools(): Promise<MCPTool[]> {
    return [
      {
        name: `search_notion_${this.config.id}`,
        description: `Search Notion pages/databases via ${this.config.name}`,
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
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

  private parseUri(uri: string): { type: "database" | "page"; id: string } {
    const match = uri.match(/^notion:\/\/[^/]+\/(database|page)\/(.+)$/);
    if (!match) throw new Error(`Invalid Notion URI: ${uri}`);
    return { type: match[1] as "database" | "page", id: match[2] };
  }

  private extractPageTitle(page: any): string {
    if (page.properties?.title?.title?.[0]?.plain_text) {
      return page.properties.title.title[0].plain_text;
    }
    if (page.properties?.Name?.title?.[0]?.plain_text) {
      return page.properties.Name.title[0].plain_text;
    }
    return "Untitled";
  }

  private blocksToMarkdown(blocks: any[]): string {
    const lines: string[] = [];
    for (const block of blocks) {
      const text = block[block.type]?.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
      switch (block.type) {
        case "paragraph":
          lines.push(text);
          break;
        case "heading_1":
          lines.push(`# ${text}`);
          break;
        case "heading_2":
          lines.push(`## ${text}`);
          break;
        case "heading_3":
          lines.push(`### ${text}`);
          break;
        case "bulleted_list_item":
          lines.push(`- ${text}`);
          break;
        case "numbered_list_item":
          lines.push(`1. ${text}`);
          break;
        case "to_do":
          lines.push(`- [${block.to_do.checked ? "x" : " "}] ${text}`);
          break;
        case "code":
          lines.push(`\`\`\`${block.code.language ?? ""}\n${text}\n\`\`\``);
          break;
        case "quote":
          lines.push(`> ${text}`);
          break;
        case "divider":
          lines.push(`---`);
          break;
        default:
          lines.push(text);
      }
    }
    return lines.join("\n\n");
  }
}
