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

export abstract class BaseConnector {
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract listResources(): Promise<MCPResource[]>;
  abstract readResource(uri: string): Promise<MCPResource>;
  abstract listTools(): Promise<MCPTool[]>;
  abstract callTool(name: string, args: unknown): Promise<unknown>;
}
