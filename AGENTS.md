# ContextGate — Agent Guide

> **ContextGate** is an open-source MCP (Model Context Protocol) gateway for organizations. It sits between AI agents and organizational data sources, providing a single governed, audited, policy-enforced data plane.

---

## Project Overview

**Repository type**: TypeScript monorepo (pnpm workspaces + Turbo)
**Primary language**: English (some infrastructure comments also appear in Thai)
**License**: MIT

ContextGate solves the problem of scattered AI agent integrations by providing:

- **Pluggable connectors** — Filesystem, PostgreSQL, Notion, and MCP-proxy (stdio)
- **Glob-pattern policies** — workspace-wide or per-agent allow rules, default-deny
- **Full audit log** — every tool call is logged with action, URI, status, agent, timestamp
- **Per-agent API keys** — SHA-256 hashed, revocable independently
- **MCP-native transports** — Streamable HTTP (modern) and legacy SSE
- **Built-in skills (prompts)** — 8 reusable prompt recipes for safe agent behavior
- **Admin dashboard** — React-based UI for managing workspaces, connectors, agents, policies, users

### Architecture

```
AI agent (Claude/Cursor/Cline/Kimi/…)  ← MCP/HTTPS →  ContextGate Server (Hono/Node.js)
                                                              │
                                    ┌─────────────────────────┼─────────────────────────┐
                                    ↓                         ↓                         ↓
                              PostgreSQL                  Redis                     Connectors
                              (Drizzle ORM)              (cache/future)         (fs/pg/notion/proxy)
```

The dashboard is a static React SPA served by nginx (dev) or Caddy (prod), talking to the server via REST.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 22+ (server), Node.js 20 (dashboard build) |
| Package Manager | pnpm 9.0.0 (corepack-enabled) |
| Monorepo | pnpm workspaces + Turbo |
| Server Framework | Hono 4.x (`@hono/node-server`) |
| Frontend | React 19, Vite 8, TypeScript ~6.0 |
| Styling | Tailwind CSS 3.4, custom CSS variables, dark mode via `class` |
| UI Components | Radix UI primitives (dialog, dropdown, select, toast, tooltip, etc.) |
| State Management | Zustand 5 (auth, theme, toast, workspace) |
| Data Fetching | TanStack Query (React Query) 5 |
| HTTP Client | ky 1.7 |
| Routing | react-router-dom 7 |
| Database ORM | Drizzle ORM 0.30 + drizzle-kit 0.21 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | jose (JWT, HS256), bcryptjs (passwords), SHA-256 (API key hashes) |
| Validation | zod 3.x |
| Testing | Vitest 4.x (globals enabled, node environment) |
| Deployment | Docker Compose, Caddy (prod reverse proxy + auto-TLS), nginx (static) |

---

## Workspace Layout

```
.
├── apps/
│   ├── server/              # Hono backend — REST API + MCP endpoints
│   │   src/
│   │   ├── server.ts        # Entry point — wires middleware + routes
│   │   ├── middleware/
│   │   │   └── auth.ts      # JWT middleware (REST), API key middleware (MCP)
│   │   ├── routes/
│   │   │   ├── auth.ts      # Register / login
│   │   │   ├── workspaces.ts
│   │   │   ├── agents.ts
│   │   │   ├── connectors.ts
│   │   │   ├── policies.ts
│   │   │   ├── audit-logs.ts
│   │   │   ├── files.ts
│   │   │   ├── resources.ts
│   │   │   ├── users.ts
│   │   │   └── mcp.ts       # MCP transport handlers (SSE + Streamable HTTP)
│   │   └── lib/
│   │       ├── policy-engine.ts   # Glob-based access control
│   │       ├── mcp-audit.ts       # Tool context extraction + audit writer
│   │       └── agent-context.ts   # Per-agent MCP instructions builder
│   └── dashboard/           # React + Vite admin UI
│       src/
│       ├── App.tsx          # Router + auth guards
│       ├── main.tsx         # React root (StrictMode)
│       ├── pages/           # Route pages (Dashboard, Workspaces, Agents, …)
│       ├── components/
│       │   ├── forms/       # ConnectorForm, AgentForm, PolicyForm, …
│       │   ├── layout/      # AppLayout, Header, Sidebar, WorkspaceSwitcher
│       │   └── ui/          # Primitives (Button, Dialog, Input, Pagination, …)
│       ├── stores/          # Zustand: auth, theme, toast, workspace
│       └── lib/
│           ├── api.ts       # ky instance with Bearer injection
│           ├── queryClient.ts
│           └── utils.ts
├── packages/
│   ├── core/                # Drizzle schema, migrations, db client
│   │   src/
│   │   ├── db/
│   │   │   ├── schema.ts    # Table definitions (workspaces, users, agents, connectors, resources, policies, auditLogs)
│   │   │   ├── client.ts    # pg Pool + drizzle instance
│   │   │   ├── migrations/  # SQL migration files (Drizzle Kit generated)
│   │   │   └── seed.ts
│   │   └── index.ts         # Re-exports db + schema
│   └── connectors/          # BaseConnector + implementations + MCP server wrapper
│       src/
│       ├── base.ts          # Abstract BaseConnector + types
│       ├── registry.ts      # ConnectorRegistry factory
│       ├── crypto.ts        # Credential encryption helpers
│       ├── filesystem.ts    # FileSystemConnector
│       ├── postgres.ts      # PostgresConnector
│       ├── notion.ts        # NotionConnector
│       ├── mcp-server.ts    # createMCPServer — generic tools + prompts + resources
│       └── mcp-proxy/       # MCP proxy connector (stdio bridge)
│           ├── proxy-connector.ts
│           ├── stdio-client.ts
│           └── index.ts
├── tests/
│   ├── integration/         # Vitest unit/contract tests
│   │   ├── mcp.test.ts      # ConnectorRegistry, FileSystemConnector, createMCPServer
│   │   ├── api.test.ts      # Route module smoke tests + API integration
│   │   ├── mcp-proxy.test.ts
│   │   ├── mcp-proxy-stdio.test.ts
│   │   └── mcp-proxy-policy.test.ts
│   ├── e2e/
│   │   └── full-flow.test.ts  # End-to-end: login → workspace → connector → agent → MCP call → policy → audit
│   └── fixtures/
│       └── fake-mcp-server.js
├── bruno/                   # Bruno API collection (REST + MCP examples)
├── scripts/
│   ├── setup.sh             # First-time dev bootstrap
│   ├── backup.sh            # Daily backup (pg_dump + workspace files)
│   ├── restore.sh           # Restore from backup tarball
│   └── reset-db.sh          # ⚠️ Drop & recreate dev database
├── docs/
│   └── DEPLOY.md            # Production deployment runbook (VPS + Caddy + Docker)
├── docker-compose.yml       # Local dev stack (postgres, redis, server, dashboard)
├── docker-compose.prod.yml  # Production stack (+ Caddy, resource limits, internal network)
├── docker-compose.test.yml  # Test environment
├── Dockerfile               # Server image (node:22-alpine, tsx runtime)
├── Dockerfile.frontend      # Dashboard image (builder → nginx static)
├── Caddyfile                # Reverse proxy + auto-HTTPS (reads env vars)
├── nginx.conf               # nginx config for dashboard static serve
├── Makefile                 # Common tasks (dev, build, test, docker-up, db-migrate, …)
├── vitest.config.ts         # Vitest config with path aliases
├── tsconfig.json            # Root TS config with composite project references
├── turbo.json               # Turbo pipeline (build, dev, lint, typecheck)
└── pnpm-workspace.yaml      # Workspace definition
```

---

## Build and Development Commands

All commands run from the repository root.

```bash
# Install dependencies
pnpm install

# Development — turbo runs server + dashboard concurrently
# Server: http://localhost:8899  Dashboard: http://localhost:5173
pnpm dev

# Build everything
pnpm build

# Type check everything
pnpm typecheck

# Lint everything
pnpm lint

# Run tests (Vitest)
pnpm test

# Database migrations (run against the core package)
pnpm db:generate   # Generate migration SQL from schema changes
pnpm db:migrate    # Apply pending migrations
pnpm db:studio     # Open Drizzle Studio (DB browser)
```

### Makefile shortcuts

```bash
make dev          # pnpm dev
make build        # pnpm build
make test         # pnpm test
make lint         # pnpm lint
make typecheck    # pnpm typecheck
make docker-up    # docker compose up -d
make docker-down  # docker compose down
make db-migrate   # pnpm db:migrate
make db-reset     # bash scripts/reset-db.sh
make setup        # bash scripts/setup.sh
make clean        # Remove build artifacts, node_modules, docker volumes
```

### Per-app commands

```bash
# Server only
pnpm --filter @contextgate/server dev       # tsx watch src/server.ts
pnpm --filter @contextgate/server build     # tsc --noEmit
pnpm --filter @contextgate/server typecheck # tsc --noEmit

# Dashboard only
pnpm --filter dashboard dev       # vite
pnpm --filter dashboard build     # tsc -b && vite build
pnpm --filter dashboard lint      # eslint .
```

---

## Environment Configuration

Copy `.env.example` → `.env` and fill values. **Never commit `.env` files.**

Key variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for signing dashboard JWTs (`openssl rand -base64 48`) |
| `CREDENTIAL_MASTER_KEY` | 32-byte hex key for encrypting connector credentials at rest (`openssl rand -hex 32`) |
| `API_AUTH_KEY` | Optional shared API auth key |
| `PORT` | Server port (default `8899`) |
| `VITE_API_URL` | Public API URL used by dashboard build |
| `CORS_ORIGIN` | Allowed CORS origin in production |
| `NODE_ENV` | `development` / `production` / `test` |

For production, see `.env.prod.example` (contains additional vars: `APP_DOMAIN`, `API_DOMAIN`, `ACME_EMAIL`, `DB_USER`, `DB_PASSWORD`, `REDIS_PASSWORD`, `VERSION`).

---

## Code Style Guidelines

- **Module system**: ESM everywhere (`"type": "module"`). Use `.js` extensions in TypeScript imports (Node.js native ESM requirement).
- **Path aliases**: Use `@contextgate/core` and `@contextgate/connectors` instead of relative paths when importing across packages.
- **TypeScript**: Strict mode enabled. Target ES2022, module resolution `bundler`.
- **Formatting**: Project uses ESLint. Run `pnpm lint` before committing.
- **Naming**:
  - PascalCase for React components, classes, interfaces
  - camelCase for variables, functions, file names
  - UPPER_SNAKE_CASE for env vars and constants
- **Comments**: JSDoc for exported functions and complex logic. Keep comments factual and tied to the code (not external docs).
- **Error handling**: Return structured JSON errors from Hono routes. Log unexpected errors with `console.error`. Audit log failures must not block the main request.
- **Security**: Never hard-code secrets. Use `process.env` via dotenv. Connector credentials are encrypted at rest.

---

## Testing Instructions

### Test configuration

Vitest is configured in `vitest.config.ts`:
- `globals: true`
- `environment: "node"`
- `include: ["tests/**/*.test.ts"]`
- Path aliases resolve `@contextgate/core` and `@contextgate/connectors` to `packages/*/src`

### Test categories

1. **Integration tests** (`tests/integration/`)
   - `mcp.test.ts` — ConnectorRegistry, FileSystemConnector, createMCPServer
   - `api.test.ts` — Route module exports + API integration against real DB
   - `mcp-proxy*.test.ts` — MCP proxy connector behavior

2. **End-to-end tests** (`tests/e2e/full-flow.test.ts`)
   - Runs against a live server at `http://localhost:8899`
   - Requires admin user `admin@contextgate.local` / `password123`
   - Requires `/data/test-data` volume mount writable in container
   - Covers: login → workspace → connector → file upload → agent → MCP initialize → policy deny/allow → audit logs → resources → users CRUD → prompts

### Running tests

```bash
# All tests
pnpm test

# Single file
pnpm test -- tests/integration/mcp.test.ts

# With coverage (if configured)
pnpm test -- --coverage
```

Integration tests that need a database use `skipIf` to gracefully skip when PostgreSQL is unreachable. E2E tests will fail fast with a clear message if the server is not running.

### CI pipeline

GitHub Actions (`.github/workflows/ci.yml`):
1. Checkout
2. Setup Node.js 20 + npm cache
3. `npm install`
4. `npm run typecheck`
5. `npm run lint`
6. `npm run test`
7. `npm run build`
8. Validate Docker Compose builds (`docker-compose.dev.yml`)

Docker images are built and pushed to GHCR on releases (`.github/workflows/docker.yml`).

---

## Database and Migrations

Schema is defined in `packages/core/src/db/schema.ts` using Drizzle ORM `pgTable`.

**Tables**: `workspaces`, `users`, `agents`, `connectors`, `resources`, `policies`, `audit_logs`

**Migrations workflow**:
1. Edit `schema.ts`
2. Run `pnpm db:generate` — produces SQL in `packages/core/src/db/migrations/`
3. Run `pnpm db:migrate` — applies SQL to the database
4. Commit both schema changes and generated migration files

**Reset (dev only)**:
```bash
make db-reset   # or bash scripts/reset-db.sh
```

---

## Connector Development

To add a new connector:

1. Subclass `BaseConnector` in `packages/connectors/src/<your-conn>.ts`
2. Implement `uriPrefix()`, `canHandle(uri)`, and whichever operations you support (`readByUri`, `listByUri`, `writeByUri`, `deleteByUri`, `createDirectoryByUri`)
3. Register the type in `packages/connectors/src/registry.ts`
4. Add the type to the **Connector type** dropdown in `apps/dashboard/src/components/forms/ConnectorForm.tsx`
5. Add a Vitest case under `tests/integration/`

URI convention: `<type>://<connectorId>/file/<path>` or `/directory/<path>`

---

## Deployment

### Local development (Docker)

```bash
cp .env.example .env
# Generate secrets and paste into .env
openssl rand -base64 48     # JWT_SECRET
openssl rand -hex 32        # CREDENTIAL_MASTER_KEY

docker compose up -d
pnpm db:migrate
# Dashboard: http://localhost:5899  API: http://localhost:8899
```

### Production (VPS)

See `docs/DEPLOY.md` for the complete runbook. Highlights:

- Uses `docker-compose.prod.yml` with Caddy reverse proxy
- Two A records: `app.your-domain.com` (dashboard) and `mcp.your-domain.com` (API)
- Caddy auto-requests Let's Encrypt TLS certs
- Internal Docker network for DB/Redis (no host port exposure)
- Resource limits on all containers
- Daily backups via `scripts/backup.sh` (cron at 03:00 UTC)
- Off-site backup via rclone/S3 optional

### Docker images

- **Server**: `Dockerfile` — node:22-alpine, runs with `tsx src/server.ts`
- **Dashboard**: `Dockerfile.frontend` — multi-stage build (Vite → nginx:alpine)
- Both use non-root users (`nodejs` / `nginx`)

---

## Security Considerations

- **Authentication**: Dashboard uses JWT (7-day expiry, HS256). MCP agents use API keys (SHA-256 hashed, prefixed `cg_`).
- **Authorization**: Policy engine uses glob patterns (`*`, `**`, `?`) with default-deny. Policies can be per-agent or per-workspace.
- **Credential encryption**: Connector credentials stored in `connectors.config` are encrypted at rest using `CREDENTIAL_MASTER_KEY`.
- **Audit logging**: Every tool call writes to `audit_logs` with action, URI, status (allowed/denied/error), agent ID, IP address.
- **Secrets management**: `.env` and `.env.*` are gitignored. Only `*.example` templates are tracked.
- **CORS**: Configured via `CORS_ORIGIN` env var in production.
- **Rate limiting**: Placeholder middleware exists (`rateLimitMiddleware`). Redis-based implementation is planned.
- **Policy engine TODOs**: Full enforcement on all tool call paths is marked as TODO in `docs/DEPLOY.md` hardening checklist.
- **Vulnerability disclosure**: Use GitHub Security Advisories, not public issues.

---

## Key Files for Quick Reference

| Purpose | File |
|---------|------|
| Server entry | `apps/server/src/server.ts` |
| Auth middleware | `apps/server/src/middleware/auth.ts` |
| Policy engine | `apps/server/src/lib/policy-engine.ts` |
| MCP routes (transports) | `apps/server/src/routes/mcp.ts` |
| MCP server wrapper | `packages/connectors/src/mcp-server.ts` |
| DB schema | `packages/core/src/db/schema.ts` |
| DB client | `packages/core/src/db/client.ts` |
| Connector base | `packages/connectors/src/base.ts` |
| Connector registry | `packages/connectors/src/registry.ts` |
| Dashboard entry | `apps/dashboard/src/main.tsx` |
| Dashboard router | `apps/dashboard/src/App.tsx` |
| API client (dashboard) | `apps/dashboard/src/lib/api.ts` |
| Root package scripts | `package.json` |
| Turbo pipeline | `turbo.json` |
| Vitest config | `vitest.config.ts` |
| Docker dev compose | `docker-compose.yml` |
| Docker prod compose | `docker-compose.prod.yml` |
| Deploy runbook | `docs/DEPLOY.md` |
