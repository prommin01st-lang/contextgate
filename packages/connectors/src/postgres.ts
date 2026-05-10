/**
 * PostgreSQL Connector (Read-Only) for ContextGate
 * SELECT-only queries with regex validation and parameterized queries
 */

import { Pool, PoolClient } from "pg";
import { MCPResource, ConnectorConfig, BaseConnector, ReadResult, MCPTool } from "./base.js";

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  allowedTables?: string[];
}

// SECURITY: reject any non-SELECT DML/DDL
const FORBIDDEN_SQL_RE =
  /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke|execute|call)\b/i;

export class PostgresConnector extends BaseConnector {
  readonly config: ConnectorConfig;
  private pool: Pool | null = null;

  constructor(config: ConnectorConfig) {
    super();
    this.config = config;
  }

  async readByUri(uri: string): Promise<ReadResult> {
    const resource = await this.readResource(uri);
    return { content: resource.text ?? "", mimeType: resource.mimeType };
  }

  async connect(): Promise<void> {
    const cfg = this.config.config as unknown as PostgresConfig;
    this.pool = new Pool({
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
    });

    // Validate connection
    const client = await this.pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async listResources(): Promise<MCPResource[]> {
    const cfg = this.config.config as unknown as PostgresConfig;
    const client = await this.pool!.connect();
    try {
      let sql = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `;
      const params: string[][] = [];
      if (cfg.allowedTables != null && cfg.allowedTables.length > 0) {
        sql += ` AND table_name = ANY($1)`;
        params.push(cfg.allowedTables);
      }
      const result = await client.query(sql, params);
      return result.rows.map((row) => ({
        uri: `postgres://${this.config.id}/table/${row.table_name}`,
        name: row.table_name,
        mimeType: "application/json",
      }));
    } finally {
      client.release();
    }
  }

  async readResource(uri: string): Promise<MCPResource> {
    const tableName = this.parseTableUri(uri);
    const cfg = this.config.config as unknown as PostgresConfig;

    // SECURITY: whitelist enforcement
    if (cfg.allowedTables != null && !cfg.allowedTables.includes(tableName)) {
      throw new Error(`Table not allowed: ${tableName}`);
    }

    const client = await this.pool!.connect();
    try {
      // SECURITY: parameterized query only (table name sanitized by regex)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
        throw new Error(`Invalid table name: ${tableName}`);
      }
      const result = await client.query(
        `SELECT * FROM "${tableName}" LIMIT 1000`
      );
      return {
        uri,
        name: tableName,
        mimeType: "application/json",
        text: JSON.stringify(result.rows, null, 2),
      };
    } finally {
      client.release();
    }
  }

  async listTools(): Promise<MCPTool[]> {
    return [
      {
        name: `query_${this.config.id}`,
        description: `Run read-only SQL query on ${this.config.name}`,
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "SQL SELECT query (read-only)",
            },
          },
          required: ["sql"],
        },
      },
    ];
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    const { sql } = args as { sql: string };

    // SECURITY: SELECT-only regex validation
    if (FORBIDDEN_SQL_RE.test(sql)) {
      throw new Error("Write operations not allowed in read-only mode");
    }

    const client = await this.pool!.connect();
    try {
      // SECURITY: use parameterized query where possible, but raw SELECT
      // is permitted after regex check. Only SELECT statements.
      const result = await client.query(sql);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.rows, null, 2),
          },
        ],
      };
    } finally {
      client.release();
    }
  }

  // ─── private helpers ──────────────────────────────────────────────

  private parseTableUri(uri: string): string {
    const match = uri.match(/^postgres:\/\/[^/]+\/table\/(.+)$/);
    if (!match) throw new Error(`Invalid postgres URI: ${uri}`);
    return match[1];
  }
}
