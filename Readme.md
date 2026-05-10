# ContextGate

> **An open-source MCP (Model Context Protocol) gateway for organizations.**
> Connect every AI agent in your team to one governed, audited, policy-enforced
> data plane — files, databases, and SaaS docs — through a single endpoint.

[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](#)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![MCP](https://img.shields.io/badge/MCP-2025--03--26-blueviolet)](https://modelcontextprotocol.io)

---

## Why ContextGate?

When a team starts using AI agents (Claude, Cursor, Cline, Kimi, Continue, …)
each agent gets its own ad-hoc set of integrations: a Notion token here, a
database password there, a filesystem mount somewhere else. The result:

- ❌ Credentials scattered across machines and configs
- ❌ No single source of truth — agents see different data
- ❌ Zero audit trail when something goes wrong
- ❌ No way to say "this agent can read finance docs but not write to prod"

**ContextGate fixes that.** It sits between your agents and your data with:

- 🔌 **Pluggable connectors** — Filesystem · Postgres · Notion (more on the way)
- 🔐 **Glob-pattern policies** — workspace-wide or per-agent allow rules, default-deny
- 📜 **Full audit log** — every `read_file` / `write_file` / `list_directory` call
- 🪪 **Per-agent API keys** — revoke a leaked agent without touching anyone else
- 🌐 **MCP-native** — Streamable HTTP **and** legacy SSE, no shim required
- 🧠 **Built-in skills (prompts)** — onboarding, citation-check, safe-edit, audit-recent…
- 🖥️ **Admin dashboard** — manage workspaces, connectors, agents, policies, files, users

---

## Architecture

```
┌──────────────┐        ┌──────────────────────────────────┐        ┌──────────────┐
│ AI agent     │  MCP   │ ContextGate Server               │        │ Filesystem   │
│ (Claude /    │◀──────▶│  ┌────────────────────────────┐  │ ◀────▶│ Postgres     │
│  Cursor /    │ HTTPS  │  │ Auth · Policies · Audit    │  │        │ Notion       │
│  Cline / …)  │        │  │ Per-agent connector cache  │  │        │ + your conn. │
└──────────────┘        │  └────────────────────────────┘  │        └──────────────┘
                        │           ▲                       │
┌──────────────┐  REST  │           │                       │        ┌──────────────┐
│ Dashboard    │◀──────▶│ Hono router · JWT · CRUD          │ ◀────▶ │ PostgreSQL   │
│ (React/Vite) │        └──────────────────────────────────┘        │ (Drizzle)    │
└──────────────┘                                                    └──────────────┘
```

**Stack** — TypeScript end-to-end · pnpm workspaces · Turbo
- **Server** — Hono (Node.js), Drizzle ORM, jose JWT, bcryptjs, zod
- **Dashboard** — React 19 + Vite, TanStack Query, Zustand, Tailwind, Radix UI
- **Connectors** — abstract `BaseConnector` with URI-based dispatch
  (`canHandle(uri)` polymorphism)
- **Storage** — PostgreSQL 16 · Redis 7
- **Edge** — nginx in container · Caddy (auto-TLS) in production

---

## Quick start (local, Docker)

> Requires **Docker Desktop** and **pnpm**.

```bash
# 1. Clone
git clone https://github.com/<your-org>/contextgate.git
cd contextgate

# 2. Copy the env template — DO NOT commit your filled-in .env
cp .env.example .env

# 3. Generate secrets and paste into .env
#    Generate them yourself, never reuse the placeholders in .env.example.
openssl rand -base64 48     # → JWT_SECRET
openssl rand -hex 32        # → CREDENTIAL_MASTER_KEY (32-byte hex = 64 chars)

# 4. Boot everything
docker compose up -d

# 5. Apply DB migrations
pnpm db:migrate

# 6. Open the dashboard
open http://localhost:5899
```

The first time you visit, you'll be asked to create the admin user.

| Service     | URL                            | Purpose                |
| ----------- | ------------------------------ | ---------------------- |
| Dashboard   | http://localhost:5899          | Admin UI               |
| MCP & API   | http://localhost:8899          | Agents talk here       |
| Postgres    | localhost:5432                 | Data store             |
| Redis       | localhost:6379                 | Cache / future use     |

### Local development (without Docker)

```bash
pnpm install
pnpm --filter @contextgate/core db:migrate
pnpm dev          # turbo runs server + dashboard concurrently
```

Vite dev server: http://localhost:5173 · Server: http://localhost:8899

---

## Connect your first agent

1. Sign in to the dashboard, create a **workspace**.
2. Add a **connector** (e.g. a filesystem rooted at `/srv/team-docs`).
3. Create an **agent** — copy the API key it generates **once** (`cg_…`).
4. Default policies are auto-created: `read` and `list` for every active connector.
   Edit them on the **Policies** page if you need broader/narrower access.
5. Configure your MCP client. Example (Claude Desktop / Streamable HTTP):

   ```json
   {
     "mcpServers": {
       "contextgate": {
         "transport": {
           "type": "http",
           "url": "https://mcp.example.com/mcp/v1/sse",
           "headers": { "Authorization": "Bearer <agent-api-key>" }
         }
       }
     }
   }
   ```

   Or pass the key as a query param if your client doesn't support custom headers:
   `https://mcp.example.com/mcp/v1/sse?api_key=<agent-api-key>`

6. The agent now sees `read_file`, `list_directory`, `write_file`, `append_file`,
   `delete_file`, `create_directory` — each takes a single `uri` argument like
   `filesystem://<connector-id>/file/path/to/file.md`.

---

## Project layout

```
.
├── apps/
│   ├── server/          Hono backend (REST + MCP)
│   └── dashboard/       React + Vite admin UI
├── packages/
│   ├── core/            Drizzle schema, migrations, db client
│   └── connectors/      BaseConnector + filesystem / postgres / notion
├── tests/
│   ├── integration/     Vitest unit & contract tests
│   └── e2e/             Full-flow tests (boots a real server)
├── docs/                Deploy guide, ADRs
├── bruno/               Bruno API collection (REST examples)
├── scripts/             setup / backup / restore / reset-db
├── docker-compose.yml         Local dev
├── docker-compose.prod.yml    VPS production with Caddy
└── Caddyfile                  Reverse proxy + auto-TLS
```

---

## Features at a glance

| Area              | What you get                                                         |
| ----------------- | -------------------------------------------------------------------- |
| **Connectors**    | filesystem · postgres (read-only) · notion (whitelist)               |
| **Tools (MCP)**   | `read_file`, `list_directory`, `write_file`, `append_file`, `delete_file`, `create_directory` — all URI-based |
| **Resources**     | `resources/list`, `resources/read`, `resources/templates/list`       |
| **Prompts**       | `onboard`, `explore-context`, `summarize-workspace`, `find-files`, `citation-check`, `compare-files`, `audit-recent`, `safe-edit` |
| **Policies**      | Glob patterns (`**`/`*`), workspace-wide **or** per-agent, default-deny |
| **Audit log**     | Every tool call: action · resource URI · status (allowed/denied/error) · agent · timestamp |
| **Auth**          | JWT for the dashboard · API keys (SHA-256 hashed) for agents · header / Bearer / query-param |
| **File manager**  | Upload, edit (in-browser textarea), rename, drag-drop, folder CRUD per filesystem connector |
| **Pagination**    | Server-side for audit logs · client-side for everything else (incl. file browser) |
| **Roles**         | `admin` (full CRUD) · `member` (self-service)                        |

---

## Production deployment

A complete runbook for deploying to a single VPS for a 10–50 person team is in
[`docs/DEPLOY.md`](docs/DEPLOY.md). Highlights:

- Caddy reverse proxy with automatic Let's Encrypt TLS
- Two A records: `app.your-domain.com` (dashboard) and `mcp.your-domain.com` (API)
- Daily Postgres + connector data backups via `scripts/backup.sh`
- `docker-compose.prod.yml` pinned to a published image tag
- `.env.prod.example` template with `openssl rand` instructions for every secret

> ⚠️ **Never commit a real `.env`.** The `.gitignore` is set up to keep both
> `.env` and `.env.<anything>` out of git. Only the `*.example` templates are
> tracked.

---

## Configuration (env vars)

All configuration is in `.env`. **Never hard-code secrets in code or images.**
The shape of the file is identical to [`.env.example`](.env.example):

| Variable                | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `DATABASE_URL`          | Postgres connection string                               |
| `REDIS_URL`             | Redis connection string                                  |
| `JWT_SECRET`            | Used to sign dashboard JWTs — generate with `openssl rand -base64 48` |
| `CREDENTIAL_MASTER_KEY` | 32-byte key encrypting connector credentials at rest     |
| `API_AUTH_KEY`          | Optional shared API auth key                             |
| `PORT`                  | Server port (default `8899`)                             |
| `VITE_API_URL`          | Public URL the dashboard build will call                 |
| `CORS_ORIGIN`           | Allowed origin for CORS in production                    |

For production also see [`.env.prod.example`](.env.prod.example).

---

## Testing

```bash
pnpm test                                # vitest run (unit + contract)
pnpm test -- tests/integration/mcp.test  # run a single suite
pnpm --filter dashboard build            # type-check + bundle the UI
pnpm --filter server build               # type-check the server
```

---

## Scripts

| Command                                | What it does                                  |
| -------------------------------------- | --------------------------------------------- |
| `pnpm dev`                             | Turbo: server + dashboard in parallel         |
| `pnpm build`                           | Build everything                              |
| `pnpm db:migrate`                      | Apply Drizzle migrations                      |
| `pnpm db:studio`                       | Open Drizzle Studio (DB browser)              |
| `scripts/setup.sh`                     | First-time bootstrap of a VPS                 |
| `scripts/backup.sh`                    | Dump Postgres + tar connector files           |
| `scripts/restore.sh`                   | Restore from a backup tarball                 |
| `scripts/reset-db.sh`                  | ⚠️ Drop & recreate the dev database           |

---

## Contributing

Issues and PRs are welcome. A good first contribution: add a connector.

1. Subclass `BaseConnector` in `packages/connectors/src/<your-conn>.ts`
2. Implement `uriPrefix()`, `canHandle(uri)`, plus whichever of
   `readByUri` / `listByUri` / `writeByUri` / `deleteByUri` you support.
3. Register the type in `packages/connectors/src/registry.ts`.
4. Add a row to the **Connector type** dropdown in
   `apps/dashboard/src/components/forms/ConnectorForm.tsx`.
5. Add a Vitest case under `tests/integration/`.

---

## Security & responsible disclosure

- Every tool call is JWT- or API-key-authenticated, policy-checked, and
  audit-logged.
- Connector credentials are encrypted at rest with `CREDENTIAL_MASTER_KEY`.
- Found a vulnerability? Please open a GitHub Security Advisory rather than a
  public issue.

---

## License

MIT — see [`LICENSE`](LICENSE).

---

## Acknowledgements

- [Model Context Protocol](https://modelcontextprotocol.io) for the spec
- [Hono](https://hono.dev), [Drizzle ORM](https://orm.drizzle.team),
  [TanStack Query](https://tanstack.com/query), [Radix UI](https://www.radix-ui.com),
  and the broader open-source ecosystem this project stands on.
