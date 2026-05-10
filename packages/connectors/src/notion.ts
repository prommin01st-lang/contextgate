/**
 * Notion Connector for ContextGate
 * Whitelist-enforced database/page access
 */

import { Client as NotionClient } from "@notionhq/client";
import { MCPResource, ConnectorConfig, BaseConnector, ReadResult, MCPTool } from "./base.js";

export interface NotionConfig {
  token: string;
  databaseIds?: string[];
  pageIds?: string[];
}

export class NotionConnector extends BaseConnector {
  readonly config: ConnectorConfig;
  private client!: NotionClient;

  constructor(config: ConnectorConfig) {
    super();
    this.config = config;
  }

  async readByUri(uri: string): Promise<ReadResult> {
    const resource = await this.readResource(uri);
    return { content: resource.text ?? "", mimeType: resource.mimeType };
  }

  async connect(): Promise<void> {
    const cfg = this.config.config as unknown as NotionConfig;
    this.client = new NotionClient({ auth: cfg.token });
    // Validate token
    await this.client.users.me({});
  }

  async disconnect(): Promise<void> {
    // NotionClient is stateless
  }

  async listResources(): Promise<MCPResource[]> {
    const cfg = this.config.config as unknown as NotionConfig;
    const resources: MCPResource[] = [];

    // Search and filter by whitelist
    const searchRes = await this.client.search({
      page_size: 100,
    });

    // TODO: update for @notionhq/client v5 types (data_source vs database)
    for (const item of searchRes.results as any[]) {
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
    const cfg = this.config.config as unknown as NotionConfig;

    // SECURITY: whitelist enforcement
    if (parsed.type === "database") {
      if (cfg.databaseIds != null && !cfg.databaseIds.includes(parsed.id)) {
        throw new Error(`Database not in whitelist: ${parsed.id}`);
      }
      // TODO: update for @notionhq/client v5 API changes
      const rows = await (this.client.databases as any).query({
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
        name: `read_page_${this.config.id}`,
        description: `Read a Notion page via ${this.config.name}`,
        inputSchema: {
          type: "object",
          properties: {
            pageId: { type: "string", description: "Notion page ID" },
          },
          required: ["pageId"],
        },
      },
    ];
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    if (name === `read_page_${this.config.id}`) {
      const { pageId } = args as { pageId: string };
      return this.handleReadPage(pageId);
    }

    return { message: "Tool not found" };
  }

  // ─── private helpers ──────────────────────────────────────────────

  private async handleReadPage(pageId: string): Promise<{ content: string }> {
    const cfg = this.config.config as unknown as NotionConfig;

    // SECURITY: whitelist enforcement
    if (cfg.pageIds != null && !cfg.pageIds.includes(pageId)) {
      throw new Error(`Page not in whitelist: ${pageId}`);
    }

    const page = await this.client.pages.retrieve({ page_id: pageId });
    const blocks = await this.client.blocks.children.list({
      block_id: pageId,
      page_size: 100,
    });

    const md = this.blocksToMarkdown(blocks.results as any[]);
    return { content: md };
  }

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
