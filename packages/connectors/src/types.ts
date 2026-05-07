/**
 * Shared types for ContextGate Connectors
 * Compatible with MCP SDK resource/tool abstractions
 */

export interface MCPResource {
  uri: string;
  name: string;
  mimeType: string;
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
  type: string;
  config: Record<string, unknown>;
  readOnly: boolean;
  workspaceId: string;
}

export interface BaseConnector {
  readonly config: ConnectorConfig;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listResources(): Promise<MCPResource[]>;
  readResource(uri: string): Promise<MCPResource>;
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, args: unknown): Promise<unknown>;
}
