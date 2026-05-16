/**
 * StdioMcpClient — JSON-RPC over stdin/stdout for spawning external MCP servers.
 *
 * Used by MCPProxyStdioConnector to talk to any standalone MCP server that
 * speaks the stdio transport (e.g. chrome-devtools-mcp, GitHub MCP, etc.).
 *
 * Protocol notes:
 *   - Each message is one JSON object terminated by '\n' (newline-delimited JSON).
 *   - Requests have `id` (string|number) and `method`. Responses have matching `id`
 *     plus either `result` or `error`. Notifications have no `id`.
 *   - On startup we send `initialize` and wait for the response, then send the
 *     `initialized` notification per the MCP spec.
 */
import { spawn, ChildProcess } from "node:child_process";

import type { MCPTool } from "../base.js";

export interface StdioClientOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** Soft cap on initialize handshake (ms). Default 15s — Chrome can be slow. */
  startupTimeoutMs?: number;
  /** Hard cap on any single tool call (ms). Default 60s. */
  callTimeoutMs?: number;
  /** Hook for stderr lines from the child (for surfacing in logs/UI). */
  onStderr?: (line: string) => void;
  /** Hook for unexpected child exit. */
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

interface JSONRPCNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

type IncomingMessage = JSONRPCResponse | JSONRPCNotification;

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const DEFAULT_CALL_TIMEOUT_MS = 60_000;

export class StdioMcpClient {
  private child: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<string | number, PendingCall>();
  private buffer = "";
  private started = false;
  private cachedTools: MCPTool[] | null = null;

  constructor(private readonly options: StdioClientOptions) {}

  /** Whether the child process is alive AND the initialize handshake completed. */
  isRunning(): boolean {
    return this.started && this.child !== null && !this.child.killed;
  }

  /**
   * Spawn the child and perform the MCP initialize handshake. Resolves once
   * the server is ready to receive tools/* requests. Rejects on startup
   * failure (spawn error, non-zero exit, or timeout).
   */
  async start(): Promise<void> {
    if (this.started) return;

    const child = spawn(this.options.command, this.options.args ?? [], {
      env: { ...process.env, ...this.options.env },
      cwd: this.options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child = child;

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk: string) => this.handleStdout(chunk));
    child.stderr?.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line) this.options.onStderr?.(line);
      }
    });

    child.on("exit", (code, signal) => {
      this.handleExit(code, signal);
    });

    child.on("error", (err) => {
      // Spawn failure (e.g. command not found)
      this.failAllPending(new Error(`Child process error: ${err.message}`));
      this.started = false;
      this.child = null;
    });

    // Perform initialize handshake with a startup timeout
    const timeoutMs = this.options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    await this.requestWithTimeout(
      "initialize",
      {
        protocolVersion: "2025-03-26",
        clientInfo: { name: "contextgate-proxy", version: "0.1.0" },
        capabilities: {},
      },
      timeoutMs
    );

    // Per MCP spec: send `initialized` notification after init response
    this.sendNotification("notifications/initialized", {});

    this.started = true;
  }

  /** List tools exposed by the child. Cached on first call. */
  async listTools(): Promise<MCPTool[]> {
    if (!this.started) {
      throw new Error("StdioMcpClient.start() must complete before listTools()");
    }
    if (this.cachedTools) return this.cachedTools;

    const result = await this.requestWithTimeout(
      "tools/list",
      {},
      this.options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS
    );
    const tools = (result as { tools?: MCPTool[] }).tools ?? [];
    this.cachedTools = tools;
    return tools;
  }

  /** Invoke a tool by its original (non-prefixed) name. */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.started) {
      throw new Error("StdioMcpClient.start() must complete before callTool()");
    }
    return this.requestWithTimeout(
      "tools/call",
      { name, arguments: args },
      this.options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS
    );
  }

  /**
   * Gracefully terminate the child. First sends SIGTERM and waits up to
   * 5 seconds, then SIGKILL. Pending requests are rejected.
   */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child || child.killed) {
      this.started = false;
      this.child = null;
      return;
    }

    this.failAllPending(new Error("Client stopped"));

    return new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already dead */
        }
      }, 5_000);

      child.once("exit", () => {
        clearTimeout(killTimer);
        this.started = false;
        this.child = null;
        resolve();
      });

      try {
        child.kill("SIGTERM");
      } catch {
        // Already exited; clean up immediately
        clearTimeout(killTimer);
        this.started = false;
        this.child = null;
        resolve();
      }
    });
  }

  // ─── Internals ─────────────────────────────────────────────────

  /** Send a JSON-RPC request and wait for the matching response. */
  private requestWithTimeout(
    method: string,
    params: unknown,
    timeoutMs: number
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const id = this.nextId++;
      const req: JSONRPCRequest = { jsonrpc: "2.0", id, method, params };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.write(req);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    const note: JSONRPCNotification = { jsonrpc: "2.0", method, params };
    this.write(note);
  }

  private write(message: JSONRPCRequest | JSONRPCNotification): void {
    const child = this.child;
    if (!child || !child.stdin || child.stdin.destroyed) {
      throw new Error("Child stdin not available");
    }
    child.stdin.write(JSON.stringify(message) + "\n");
  }

  /** Accumulate stdout chunks and parse newline-delimited JSON messages. */
  private handleStdout(chunk: string): void {
    this.buffer += chunk;
    let newlineIdx: number;
    while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as IncomingMessage;
        this.dispatch(msg);
      } catch (err) {
        // Malformed JSON line — log via stderr hook so users can see it
        this.options.onStderr?.(
          `[stdio-client] Failed to parse JSON: ${line.slice(0, 200)}`
        );
      }
    }
  }

  private dispatch(msg: IncomingMessage): void {
    // Response (has `id`) — resolve the matching pending call
    if ("id" in msg && msg.id !== undefined && msg.id !== null) {
      const pending = this.pending.get(msg.id);
      if (!pending) {
        this.options.onStderr?.(
          `[stdio-client] Unmatched response id=${msg.id}`
        );
        return;
      }
      this.pending.delete(msg.id);
      clearTimeout(pending.timer);

      if (msg.error) {
        pending.reject(
          new Error(`MCP error ${msg.error.code}: ${msg.error.message}`)
        );
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // Notification (no `id`) — currently we ignore (no subscriptions)
  }

  private handleExit(
    code: number | null,
    signal: NodeJS.Signals | null
  ): void {
    const wasStarted = this.started;
    this.started = false;
    this.child = null;
    this.failAllPending(
      new Error(`Child exited (code=${code}, signal=${signal})`)
    );
    if (wasStarted && this.options.onExit) {
      this.options.onExit(code, signal);
    }
  }

  private failAllPending(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}
