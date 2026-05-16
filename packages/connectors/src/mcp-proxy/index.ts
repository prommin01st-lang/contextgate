/**
 * MCP-to-MCP proxy module.
 *
 * Exposes external MCP servers (Chrome DevTools, GitHub, Notion, …) as
 * ContextGate connectors. Currently supports stdio transport; HTTP/SSE
 * coming in a later phase.
 */
export { StdioMcpClient } from "./stdio-client.js";
export type { StdioClientOptions } from "./stdio-client.js";

export { MCPProxyStdioConnector } from "./proxy-connector.js";
export type { MCPProxyStdioConfig } from "./proxy-connector.js";
