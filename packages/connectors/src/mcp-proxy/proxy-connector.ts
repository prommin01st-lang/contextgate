/**
 * MCPProxyStdioConnector — proxies an external stdio-based MCP server.
 *
 * Lifecycle: spawn-on-demand + idle timeout.
 *
 *   - `connect()` validates config but DOES NOT spawn the child. Spawning
 *     can be slow (Chrome ~3s) so we defer until the first actual tool
 *     call or listTools() request.
 *
 *   - `listTools()` and `callTool()` call `ensureRunning()` first, which
 *     spawns the child + performs the MCP handshake if needed.
 *
 *   - An idle timer is reset on every call. When it fires (default 5 min
 *     of inactivity) the child is killed. Subsequent calls re-spawn.
 *
 *   - `disconnect()` clears the timer and kills the child gracefully.
 *
 * Tool name handling:
 *   The MCP server prefixes external tools with `<slug>:` when returning
 *   them from `tools/list`. When a `tools/call` with `<slug>:<name>` comes
 *   in, mcp-server.ts strips the prefix and calls `connector.callTool(name, args)`
 *   — so the connector receives the ORIGINAL tool name and forwards it
 *   verbatim to the child.
 */
import { BaseConnector } from "../base.js";
import type {
  ConnectorConfig,
  MCPResource,
  MCPTool,
} from "../base.js";
import { StdioMcpClient } from "./stdio-client.js";

export interface MCPProxyStdioConfig {
  /** Executable to spawn (e.g. "npx", "node", "uvx"). */
  command: string;
  /** Arguments to pass after the command. */
  args?: string[];
  /** Extra environment variables (merged on top of process.env). */
  env?: Record<string, string>;
  /** Working directory for the child process. */
  cwd?: string;
  /** Idle timeout in milliseconds. 0 disables idle shutdown. Default 5 min. */
  idleTimeoutMs?: number;
  /** Soft cap on initialize handshake. Default 15s. */
  startupTimeoutMs?: number;
  /** Hard cap on any single tool call. Default 60s. */
  callTimeoutMs?: number;
  /**
   * Optional whitelist of tool names (un-prefixed) to expose. If set, tools
   * outside the list are filtered out at `listTools()` time and a call
   * to one of them via `callTool()` is rejected.
   */
  allowedTools?: string[];
}

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export class MCPProxyStdioConnector extends BaseConnector {
  readonly config: ConnectorConfig;
  private client: StdioMcpClient | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private startupLock: Promise<void> | null = null;
  private readonly proxyConfig: MCPProxyStdioConfig;
  private cachedTools: MCPTool[] | null = null;

  constructor(config: ConnectorConfig) {
    super();
    this.config = config;

    const raw = (config.config ?? {}) as Partial<MCPProxyStdioConfig>;
    if (!raw.command || typeof raw.command !== "string") {
      throw new Error(
        `MCPProxyStdioConnector "${config.name}" requires config.command (string)`
      );
    }
    this.proxyConfig = {
      command: raw.command,
      args: Array.isArray(raw.args) ? raw.args.map(String) : [],
      env:
        raw.env && typeof raw.env === "object"
          ? (raw.env as Record<string, string>)
          : {},
      cwd: typeof raw.cwd === "string" ? raw.cwd : undefined,
      idleTimeoutMs:
        typeof raw.idleTimeoutMs === "number"
          ? raw.idleTimeoutMs
          : DEFAULT_IDLE_TIMEOUT_MS,
      startupTimeoutMs:
        typeof raw.startupTimeoutMs === "number"
          ? raw.startupTimeoutMs
          : undefined,
      callTimeoutMs:
        typeof raw.callTimeoutMs === "number" ? raw.callTimeoutMs : undefined,
      allowedTools: Array.isArray(raw.allowedTools)
        ? raw.allowedTools.map(String)
        : undefined,
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────

  /** No-op: we defer spawning until the first call. */
  async connect(): Promise<void> {
    // Intentionally empty — spawn lazily so the dashboard's connector list
    // doesn't pay 3+ second startup cost on every page refresh.
  }

  /** Kill the child if running and clear timers. */
  async disconnect(): Promise<void> {
    this.clearIdleTimer();
    const client = this.client;
    this.client = null;
    this.cachedTools = null;
    if (client) {
      await client.stop();
    }
  }

  // ─── Resources (proxy connectors don't expose any) ─────────────

  async listResources(): Promise<MCPResource[]> {
    return [];
  }

  async readResource(uri: string): Promise<MCPResource> {
    throw new Error(
      `MCPProxyStdioConnector "${this.config.name}" does not expose resources (uri=${uri})`
    );
  }

  // ─── Tool API ──────────────────────────────────────────────────

  async listTools(): Promise<MCPTool[]> {
    await this.ensureRunning();
    this.resetIdleTimer();
    if (this.cachedTools) return this.filterAllowed(this.cachedTools);
    const tools = await this.client!.listTools();
    this.cachedTools = tools;
    return this.filterAllowed(tools);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const allowed = this.proxyConfig.allowedTools;
    // allowedTools: []  or omitted  →  allow all (no whitelist)
    if (allowed && allowed.length > 0 && !allowed.includes(name)) {
      throw new Error(
        `Tool "${name}" is not in the allowed list for connector "${this.config.name}". ` +
          `Allowed: ${allowed.join(", ")}. ` +
          `Remove "allowedTools" from the connector config to allow every tool.`
      );
    }
    await this.ensureRunning();
    this.resetIdleTimer();
    return this.client!.callTool(name, args);
  }

  // ─── URI overrides — proxy connectors are not URI-based ────────

  override canHandle(_uri: string): boolean {
    return false;
  }

  // ─── Internals ─────────────────────────────────────────────────

  /** Spawn + handshake if needed. Concurrent callers share one startup. */
  private async ensureRunning(): Promise<void> {
    if (this.client?.isRunning()) return;

    // Coalesce concurrent starts so we don't spawn N children
    if (this.startupLock) return this.startupLock;

    this.startupLock = (async () => {
      try {
        const client = new StdioMcpClient({
          command: this.proxyConfig.command,
          args: this.proxyConfig.args,
          env: this.proxyConfig.env,
          cwd: this.proxyConfig.cwd,
          startupTimeoutMs: this.proxyConfig.startupTimeoutMs,
          callTimeoutMs: this.proxyConfig.callTimeoutMs,
          onStderr: (line) =>
            console.error(`[${this.config.name}] ${line}`),
          onExit: (code, signal) => {
            console.warn(
              `[${this.config.name}] child exited code=${code} signal=${signal}`
            );
            this.cachedTools = null;
            this.client = null;
            this.clearIdleTimer();
          },
        });
        await client.start();
        this.client = client;
      } finally {
        this.startupLock = null;
      }
    })();

    return this.startupLock;
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    const ms = this.proxyConfig.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    if (ms <= 0) return; // disabled
    this.idleTimer = setTimeout(() => {
      void this.idleShutdown();
    }, ms);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private async idleShutdown(): Promise<void> {
    const client = this.client;
    if (!client) return;
    console.info(
      `[${this.config.name}] idle shutdown — child killed after ${
        this.proxyConfig.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
      }ms idle`
    );
    this.client = null;
    this.cachedTools = null;
    try {
      await client.stop();
    } catch (err) {
      console.error(`[${this.config.name}] error during idle shutdown:`, err);
    }
  }

  private filterAllowed(tools: MCPTool[]): MCPTool[] {
    const allowed = this.proxyConfig.allowedTools;
    if (!allowed || allowed.length === 0) return tools;
    return tools.filter((t) => allowed.includes(t.name));
  }
}
