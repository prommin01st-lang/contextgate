/**
 * Connector base types and abstract class.
 *
 * Connectors expose data sources (filesystem, postgres, notion, …) through
 * a URI-based interface. The MCP server defines a small set of GENERIC
 * tools (read_file, list_directory, write_file, …) and dispatches each
 * call to the connector that owns the URI.
 *
 * URI scheme convention:
 *   <type>://<connectorId>/file/<path>
 *   <type>://<connectorId>/directory/<path>
 *   <type>://<connectorId>/page/<id>      (notion)
 *   <type>://<connectorId>/database/<id>  (notion)
 *   <type>://<connectorId>/table/<name>   (postgres)
 */

export interface MCPResource {
  uri: string;
  name: string;
  mimeType?: string;
  text?: string;
  blob?: Uint8Array;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
}

export interface ConnectorConfig {
  id: string;
  name: string;
  slug: string;
  type: string;
  config: Record<string, unknown>;
  readOnly: boolean;
  workspaceId: string;
}

/** Item returned from `listByUri` for the directory-listing tool. */
export interface DirectoryEntry {
  name: string;
  type: "file" | "directory";
  /** URI suitable for read_file / further list_directory calls. */
  uri: string;
}

export interface ListResult {
  uri: string;
  entries: DirectoryEntry[];
}

export interface ReadResult {
  content: string;
  mimeType?: string;
}

export interface WriteResult {
  uri: string;
  bytesWritten: number;
}

export abstract class BaseConnector {
  abstract readonly config: ConnectorConfig;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract listResources(): Promise<MCPResource[]>;
  abstract readResource(uri: string): Promise<MCPResource>;

  // ─── Slug / namespace ──────────────────────────────────────────
  /**
   * Human-readable namespace for tools exposed by this connector.
   * Proxy connectors use their slug (e.g. "chrome-prod"); URI-based
   * connectors return an empty string.
   */
  toolNamespace(): string {
    return this.config.slug ?? "";
  }

  // ─── URI ownership ─────────────────────────────────────────────
  /**
   * Default scheme prefix for this connector. Subclasses can override if
   * they expose more than one scheme.
   */
  uriPrefix(): string {
    return `${this.config.type}://${this.config.id}/`;
  }

  /** Whether this connector should handle the given URI. */
  canHandle(uri: string): boolean {
    return uri.startsWith(this.uriPrefix());
  }

  // ─── Generic operations (default = unsupported) ───────────────
  // Subclasses override the ones they implement. The MCP server calls
  // these directly from its generic tool handlers.

  async readByUri(_uri: string): Promise<ReadResult> {
    throw notSupported(this, "read_file");
  }

  async listByUri(_uri: string, _maxDepth?: number): Promise<ListResult> {
    throw notSupported(this, "list_directory");
  }

  async writeByUri(_uri: string, _content: string): Promise<WriteResult> {
    throw notSupported(this, "write_file");
  }

  async appendByUri(_uri: string, _content: string): Promise<WriteResult> {
    throw notSupported(this, "append_file");
  }

  async deleteByUri(_uri: string): Promise<{ uri: string }> {
    throw notSupported(this, "delete_file");
  }

  async createDirectoryByUri(_uri: string): Promise<{ uri: string }> {
    throw notSupported(this, "create_directory");
  }

  // ─── Tool API (for MCP proxy connectors) ───────────────────────
  /**
   * Return externally-defined tools exposed by this connector.
   * Tool names are automatically prefixed with the connector's slug
   * when surfaced through the MCP server.
   */
  async listTools(): Promise<MCPTool[]> {
    return [];
  }

  /**
   * Execute a tool by name. `name` is the ORIGINAL name (without the
   * slug prefix). Implementations receive the raw JSON arguments.
   */
  async callTool(_name: string, _args: Record<string, unknown>): Promise<unknown> {
    throw notSupported(this, "callTool");
  }
}

function notSupported(c: BaseConnector, op: string): Error {
  return new Error(
    `Connector "${c.config.name}" (${c.config.type}) does not support ${op}`
  );
}
