import { useState } from 'react';
import {
  BookOpen,
  Sparkles,
  Plug,
  Bot,
  Shield,
  ClipboardList,
  Zap,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../lib/utils';

/* -----------------------------------------------------------------
 * Small helpers — local to this page
 * --------------------------------------------------------------- */

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="relative group">
      <pre className="bg-muted/50 border border-border rounded-xl p-4 text-xs font-mono overflow-x-auto whitespace-pre">
        {lang && (
          <span className="text-muted-foreground/60 text-[10px] uppercase tracking-wide block mb-1">
            {lang}
          </span>
        )}
        <code className="text-foreground">{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-card border border-border opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
        title="Copy"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

function Step({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
        {num}
      </div>
      <div className="flex-1 pb-4">
        <h4 className="font-medium text-foreground mb-2">{title}</h4>
        <div className="text-sm text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: typeof BookOpen;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" strokeWidth={1.75} />
        </div>
        <h2 className="font-serif text-2xl tracking-tight text-foreground">
          {title}
        </h2>
      </div>
      {description && (
        <p className="text-sm text-muted-foreground mb-5 max-w-2xl">
          {description}
        </p>
      )}
      <div className="card-claude p-6 space-y-4">{children}</div>
    </section>
  );
}

function Pill({
  variant = 'info',
  children,
}: {
  variant?: 'info' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
}) {
  return <span className={`pill pill-${variant}`}>{children}</span>;
}

/* -----------------------------------------------------------------
 * Main Help page
 * --------------------------------------------------------------- */

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'quickstart', label: 'Quick start' },
  { id: 'agents', label: 'Agents & API keys' },
  { id: 'connect-client', label: 'Connect MCP client' },
  { id: 'tools', label: 'Tools & URI scheme' },
  { id: 'policies', label: 'Policies' },
  { id: 'mcp-proxy', label: 'MCP proxy (Chrome, GitHub, …)' },
  { id: 'audit', label: 'Audit logs' },
  { id: 'troubleshoot', label: 'Troubleshooting' },
];

export function Help() {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5899';
  const apiBase = origin.replace(':5899', ':8899');
  const mcpEndpoint = `${apiBase}/mcp/v1/sse`;

  return (
    <div className="flex gap-8">
      {/* Sticky TOC */}
      <aside className="hidden lg:block w-56 shrink-0">
        <div className="sticky top-6 space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground/60 mb-2 px-2">
            On this page
          </p>
          {TOC.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground',
                'hover:bg-muted hover:text-foreground transition-colors'
              )}
            >
              <ChevronRight className="w-3 h-3 opacity-50" />
              {item.label}
            </a>
          ))}
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 max-w-3xl space-y-12">
        <header>
          <div className="inline-flex items-center gap-2 mb-3 text-xs font-medium tracking-wide uppercase text-muted-foreground">
            <BookOpen className="w-3.5 h-3.5" />
            Documentation
          </div>
          <h1 className="font-serif text-4xl tracking-tight text-foreground">
            Help &amp; Guide
          </h1>
          <p className="text-muted-foreground mt-2">
            Learn how to set up ContextGate, connect AI agents, and govern access
            to your data sources.
          </p>
        </header>

        {/* ────────────────────────── OVERVIEW ──────────────────────────── */}
        <Section
          id="overview"
          icon={Sparkles}
          title="What is ContextGate?"
          description="A governed MCP (Model Context Protocol) gateway. One endpoint, many connectors, full audit and policy enforcement."
        >
          <p className="text-sm text-muted-foreground">
            Every AI agent in your team — Claude, Cursor, Cline, Kimi, Continue — talks
            to a <em>single endpoint</em>. Behind it ContextGate exposes:
          </p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-foreground">Filesystem</strong> — read/write files
              within a sandboxed root path
            </li>
            <li>
              <strong className="text-foreground">PostgreSQL</strong> — read-only SELECT
              queries with table whitelist
            </li>
            <li>
              <strong className="text-foreground">Notion</strong> — page &amp; database
              access with token-scoped whitelist
            </li>
            <li>
              <strong className="text-foreground">MCP Proxy (stdio)</strong> — wrap any
              external MCP server (Chrome DevTools, GitHub, Slack, …) behind one
              governed endpoint
            </li>
          </ul>
          <div className="border-l-2 border-primary/40 pl-4 mt-3">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Why use a gateway?</strong> Without
              one, every agent gets its own credentials, no audit trail, and no
              way to revoke access. ContextGate solves all three.
            </p>
          </div>
        </Section>

        {/* ────────────────────────── QUICK START ───────────────────────── */}
        <Section
          id="quickstart"
          icon={Zap}
          title="Quick start — 5 steps to your first tool call"
        >
          <Step num={1} title="Create a workspace">
            <p>
              Workspaces isolate connectors, agents, and policies. One workspace
              per team / project. Go to <strong>Workspaces → New workspace</strong>.
            </p>
          </Step>

          <Step num={2} title="Add a connector">
            <p>
              Click <strong>Connectors → New connector</strong>. Pick a type
              (start with <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">filesystem</code>), set a name + the config (e.g.
              <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono"> rootPath: /data/files</code>).
            </p>
            <p>
              The connector becomes the source the agent reads from. You can
              upload/edit files later via the folder icon next to the connector
              row.
            </p>
          </Step>

          <Step num={3} title="Create an agent">
            <p>
              <strong>Agents → New agent</strong>. ContextGate generates an
              API key in the form <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">cg_xxxxxxxxxxxxxxxx</code>.
              <strong className="text-amber-700 dark:text-amber-400"> Save it now</strong> — you can't see it again.
            </p>
            <p>
              By default, an agent automatically gets <Pill variant="info">read</Pill>{' '}
              <Pill variant="info">list</Pill> policies for every active connector
              in the workspace.
            </p>
          </Step>

          <Step num={4} title="Configure your MCP client">
            <p>
              Tell your agent (Claude Desktop / Cursor / etc.) where ContextGate
              lives and pass the API key. See <a href="#connect-client" className="text-primary hover:underline">Connect MCP client</a> below for per-tool config examples.
            </p>
          </Step>

          <Step num={5} title="Try a tool call">
            <p>
              In your agent, ask it to "list files in your connector". Behind the
              scenes it calls <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">list_directory</code>;
              you'll see the call appear in <strong>Audit logs</strong> within seconds.
            </p>
          </Step>
        </Section>

        {/* ────────────────────────── AGENTS & API KEYS ─────────────────── */}
        <Section
          id="agents"
          icon={Bot}
          title="Agents &amp; API keys"
          description="How identity works in ContextGate."
        >
          <p className="text-sm text-muted-foreground">
            An agent is a separate identity for each AI client. Use one agent
            per LLM-tool installation, per machine, or per teammate — that way
            you can revoke one without affecting the others.
          </p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
            <li>API keys are <strong className="text-foreground">shown once</strong> on creation, then stored as SHA-256 hash only.</li>
            <li>If lost, delete the agent and create a new one — there's no recovery flow.</li>
            <li>Three ways to send the key:
              <CodeBlock
                lang="HTTP headers / query"
                code={`# 1. Standard Authorization header (recommended)
Authorization: Bearer cg_xxxxxxxxxxxxxxxx

# 2. Custom header (for clients that don't allow Authorization)
X-API-Key: cg_xxxxxxxxxxxxxxxx

# 3. URL query parameter (last resort — appears in logs)
${mcpEndpoint}?api_key=cg_xxxxxxxxxxxxxxxx`}
              />
            </li>
          </ul>
        </Section>

        {/* ────────────────────────── CONNECT MCP CLIENT ─────────────────── */}
        <Section
          id="connect-client"
          icon={Plug}
          title="Connect an MCP client"
          description="Copy the config block that matches your tool. Replace <agent-api-key> with the key from step 3."
        >
          <h3 className="text-base font-medium text-foreground">
            Claude Desktop &nbsp;·&nbsp; Streamable HTTP transport
          </h3>
          <p className="text-sm text-muted-foreground">
            Open <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS)
            or <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">%APPDATA%\Claude\claude_desktop_config.json</code> (Windows):
          </p>
          <CodeBlock
            lang="json"
            code={`{
  "mcpServers": {
    "contextgate": {
      "transport": {
        "type": "http",
        "url": "${mcpEndpoint}",
        "headers": {
          "Authorization": "Bearer <agent-api-key>"
        }
      }
    }
  }
}`}
          />

          <div className="h-px bg-border my-2" />

          <h3 className="text-base font-medium text-foreground">
            Cursor &nbsp;·&nbsp; ~/.cursor/mcp.json
          </h3>
          <CodeBlock
            lang="json"
            code={`{
  "mcpServers": {
    "contextgate": {
      "url": "${mcpEndpoint}",
      "headers": {
        "Authorization": "Bearer <agent-api-key>"
      }
    }
  }
}`}
          />

          <div className="h-px bg-border my-2" />

          <h3 className="text-base font-medium text-foreground">
            Cline &nbsp;·&nbsp; VS Code settings
          </h3>
          <CodeBlock
            lang="json"
            code={`{
  "cline.mcpServers": {
    "contextgate": {
      "url": "${mcpEndpoint}?api_key=<agent-api-key>"
    }
  }
}`}
          />

          <div className="h-px bg-border my-2" />

          <h3 className="text-base font-medium text-foreground">
            Kimi &nbsp;·&nbsp; environment variable approach
          </h3>
          <p className="text-sm text-muted-foreground">
            Kimi's MCP UI doesn't pass headers — use the query-param URL:
          </p>
          <CodeBlock
            lang="text"
            code={`URL:  ${mcpEndpoint}?api_key=<agent-api-key>`}
          />

          <div className="h-px bg-border my-2" />

          <h3 className="text-base font-medium text-foreground">
            Legacy clients (mcp-remote, older Continue)
          </h3>
          <p className="text-sm text-muted-foreground">
            We also support the legacy SSE transport. Use the same URL — the
            server auto-detects whether the client does HTTP POST or SSE GET.
          </p>
        </Section>

        {/* ────────────────────────── TOOLS & URI ─────────────────────────── */}
        <Section
          id="tools"
          icon={BookOpen}
          title="Tools &amp; URI scheme"
          description="What the agent sees, and how it talks to your data."
        >
          <p className="text-sm text-muted-foreground">
            Once connected, an agent gets 6 generic URI-based tools. Each takes
            a <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">uri</code> argument
            that names a resource on a specific connector.
          </p>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Tool</th>
                  <th className="text-left px-4 py-2 font-medium">Action</th>
                  <th className="text-left px-4 py-2 font-medium">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                <tr><td className="px-4 py-2 font-mono">read_file</td><td className="px-4 py-2"><Pill>read</Pill></td><td className="px-4 py-2 text-muted-foreground">Fetch a file's contents</td></tr>
                <tr><td className="px-4 py-2 font-mono">list_directory</td><td className="px-4 py-2"><Pill>list</Pill></td><td className="px-4 py-2 text-muted-foreground">Enumerate folder contents</td></tr>
                <tr><td className="px-4 py-2 font-mono">write_file</td><td className="px-4 py-2"><Pill variant="warning">write</Pill></td><td className="px-4 py-2 text-muted-foreground">Overwrite a file</td></tr>
                <tr><td className="px-4 py-2 font-mono">append_file</td><td className="px-4 py-2"><Pill variant="warning">write</Pill></td><td className="px-4 py-2 text-muted-foreground">Append to a file</td></tr>
                <tr><td className="px-4 py-2 font-mono">delete_file</td><td className="px-4 py-2"><Pill variant="danger">delete</Pill></td><td className="px-4 py-2 text-muted-foreground">Remove a file/empty folder</td></tr>
                <tr><td className="px-4 py-2 font-mono">create_directory</td><td className="px-4 py-2"><Pill variant="warning">write</Pill></td><td className="px-4 py-2 text-muted-foreground">Make a folder (recursive)</td></tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-medium text-foreground mt-4">URI shapes</h3>
          <CodeBlock
            lang="text"
            code={`# Filesystem
filesystem://<connectorId>/file/<path>
filesystem://<connectorId>/directory/<path>

# Postgres (read-only)
postgres://<connectorId>/table/<table-name>

# Notion
notion://<connectorId>/page/<id>
notion://<connectorId>/database/<id>

# MCP proxy (tool calls — synthetic URI for policy/audit)
mcp-proxy://<connectorId>/tool/<toolName>`}
          />
          <p className="text-xs text-muted-foreground">
            Tip: ask the agent to call <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">resources/list</code> first
            — it returns every reachable URI without bulk-reading.
          </p>
        </Section>

        {/* ────────────────────────── POLICIES ─────────────────────────── */}
        <Section
          id="policies"
          icon={Shield}
          title="Policies — glob-pattern access control"
          description="Without a matching allow-policy, everything is denied. Edit on the Policies page."
        >
          <p className="text-sm text-muted-foreground">
            A policy is a tuple of <strong className="text-foreground">scope</strong> (agent or workspace),
            <strong className="text-foreground"> resource pattern</strong> (glob), and
            <strong className="text-foreground"> actions</strong> (read / list / write / delete / call).
          </p>
          <h3 className="text-base font-medium text-foreground mt-2">Glob syntax</h3>
          <CodeBlock
            lang="text"
            code={`*    matches anything EXCEPT "/"
**   matches anything INCLUDING "/"
?    matches a single character`}
          />
          <h3 className="text-base font-medium text-foreground mt-2">Common patterns</h3>
          <CodeBlock
            lang="text"
            code={`# Full access to one connector
filesystem://abc-123/**            → read, list, write

# Read-only access across all filesystem connectors in the workspace
filesystem://**/file/**            → read

# Only Markdown files
filesystem://abc-123/file/**.md    → read

# All tools on one proxy connector
mcp-proxy://abc-123/tool/**        → call

# One specific tool across any proxy connector
mcp-proxy://**/tool/take_screenshot → call`}
          />
          <div className="border-l-2 border-amber-400/60 pl-4 mt-2 bg-amber-50/30 dark:bg-amber-950/20 rounded-r-lg py-2">
            <p className="text-xs text-muted-foreground">
              <strong className="text-amber-700 dark:text-amber-400">Default-deny.</strong> New agents
              get auto-policies for active connectors at creation time — they don't
              inherit policies retroactively if you add a connector later. Add policies
              manually on the <a href="/policies" className="text-primary hover:underline">Policies page</a> when you spin up new sources.
            </p>
          </div>
        </Section>

        {/* ────────────────────────── MCP PROXY ─────────────────────────── */}
        <Section
          id="mcp-proxy"
          icon={Plug}
          title="MCP Proxy — wrap external MCP servers"
          description="Use ContextGate as a unified front door for stdio-based MCP servers like Chrome DevTools, GitHub MCP, Slack MCP, etc."
        >
          <p className="text-sm text-muted-foreground">
            Pick <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">MCP Proxy (stdio)</code> as
            the connector type, then give it a <strong className="text-foreground">slug</strong> —
            this slug becomes the prefix on every tool the proxied server exposes:
          </p>
          <CodeBlock
            lang="text"
            code={`slug: chrome-prod
external server tools: click, navigate_page, take_screenshot, ...
→ agent sees: chrome-prod__click, chrome-prod__navigate_page, chrome-prod__take_screenshot`}
          />
          <h3 className="text-base font-medium text-foreground mt-2">Example config — Chrome DevTools MCP</h3>
          <CodeBlock
            lang="json"
            code={`{
  "command": "npx",
  "args": ["-y", "chrome-devtools-mcp@latest", "--slim"],
  "env": {
    "CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS": "1"
  },
  "idleTimeoutMs": 300000,
  "allowedTools": ["navigate_page", "take_screenshot", "evaluate_script"]
}`}
          />
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
            <li><strong className="text-foreground">Spawn-on-demand:</strong> the child process starts on the first tool call, not at connector creation.</li>
            <li><strong className="text-foreground">Idle timeout:</strong> killed after 5 min of no calls (configurable). Resource-friendly.</li>
            <li><strong className="text-foreground">allowedTools:</strong> optional whitelist — tools not listed are filtered out and rejected.</li>
            <li><strong className="text-foreground">Audit:</strong> every proxied tool call writes a row with action <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">call</code> and URI <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">mcp-proxy://{'<id>'}/tool/{'<name>'}</code>.</li>
          </ul>
        </Section>

        {/* ────────────────────────── AUDIT ─────────────────────────── */}
        <Section
          id="audit"
          icon={ClipboardList}
          title="Audit logs"
          description="Every tool call lands here within ~1 second."
        >
          <p className="text-sm text-muted-foreground">
            Open <a href="/audit" className="text-primary hover:underline">Audit logs</a> — it auto-refreshes
            every 5 seconds (toggle in the header). Filter by status, search by
            action or resource URI.
          </p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
            <li><Pill variant="success">allowed</Pill> — policy matched, dispatched to connector</li>
            <li><Pill variant="danger">denied</Pill> — no matching policy (default-deny)</li>
            <li><Pill>success</Pill> — connector returned data (for tools that have side-effects)</li>
            <li><Pill variant="danger">error</Pill> — connector threw an exception</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Logs are append-only. The retention policy is yours to set at the
            database level — ContextGate doesn't expire them automatically.
          </p>
        </Section>

        {/* ────────────────────────── TROUBLESHOOT ─────────────────────────── */}
        <Section
          id="troubleshoot"
          icon={AlertCircle}
          title="Common issues"
        >
          <details className="group rounded-xl border border-border bg-muted/20 p-4">
            <summary className="cursor-pointer font-medium text-foreground">
              "Unauthorized — missing or invalid Authorization header"
            </summary>
            <p className="text-sm text-muted-foreground mt-2">
              The client isn't sending the API key. Check that you copied the
              full key including the <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">cg_</code> prefix.
              Try the <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">?api_key=...</code> URL form
              as a fallback.
            </p>
          </details>

          <details className="group rounded-xl border border-border bg-muted/20 p-4">
            <summary className="cursor-pointer font-medium text-foreground">
              All tool calls return "Access denied"
            </summary>
            <p className="text-sm text-muted-foreground mt-2">
              The agent has no matching policies. Either:
            </p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 mt-2 space-y-1">
              <li>Create policies manually on the <a href="/policies" className="text-primary hover:underline">Policies</a> page</li>
              <li>Delete &amp; recreate the agent — it will auto-receive default policies for active connectors</li>
            </ul>
          </details>

          <details className="group rounded-xl border border-border bg-muted/20 p-4">
            <summary className="cursor-pointer font-medium text-foreground">
              Tools list is empty in the client
            </summary>
            <p className="text-sm text-muted-foreground mt-2">
              Make sure the connector is <Pill variant="success">Active</Pill>. Then in the
              client, restart the MCP session — most clients cache the tools list
              and only re-fetch it on session start.
            </p>
          </details>

          <details className="group rounded-xl border border-border bg-muted/20 p-4">
            <summary className="cursor-pointer font-medium text-foreground">
              "Slug already exists in this workspace" when creating a proxy connector
            </summary>
            <p className="text-sm text-muted-foreground mt-2">
              Slugs are unique per workspace. Pick a different slug or delete the
              old connector first.
            </p>
          </details>

          <details className="group rounded-xl border border-border bg-muted/20 p-4">
            <summary className="cursor-pointer font-medium text-foreground">
              Chrome DevTools MCP proxy never returns from its first call
            </summary>
            <p className="text-sm text-muted-foreground mt-2">
              First spawn downloads Chrome (~3-5s) and the npm package (~10s on first use).
              Increase <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">startupTimeoutMs</code> in the
              connector config to 60_000+ on slow networks.
            </p>
          </details>
        </Section>

        <footer className="pt-6 pb-12 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Need more? Check the project README on GitHub
            <ExternalLink className="w-3 h-3 inline ml-1 align-text-bottom" />
          </p>
        </footer>
      </div>
    </div>
  );
}
