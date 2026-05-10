# ContextGate — Production Deployment Guide

Deploy a production-ready ContextGate instance for a 10–50 person team on a single VPS with HTTPS, automatic backups, and workspace-scoped file storage.

**Stack**: Linux VPS · Docker Compose · Caddy (auto-TLS) · PostgreSQL · Redis

---

## 1 · Pick a VPS

Recommended specs: **2 vCPU / 4 GB RAM / 80 GB SSD**

| Provider     | Plan        | Price/mo  |
|--------------|-------------|-----------|
| Hetzner      | CPX21       | ~$8       |
| DigitalOcean | Premium 2vCPU | ~$24    |
| Vultr        | High Frequency 2C/4G | ~$24 |
| Linode       | Dedicated 2 | ~$24      |
| AWS Lightsail | 4GB        | ~$24      |

OS: **Ubuntu 22.04 LTS** or **Debian 12**

---

## 2 · DNS

Point two A records to your server's public IP:

| Record | Type | Value         | Purpose          |
|--------|------|---------------|------------------|
| `app`  | A    | `<server-ip>` | Dashboard UI     |
| `mcp`  | A    | `<server-ip>` | API + MCP endpoint |

Wait for propagation (a few minutes — check with `dig app.example.com`).

---

## 3 · Server initial setup

SSH in as root, then:

```bash
# Update + create non-root user
apt update && apt upgrade -y
adduser --disabled-password --gecos "" cgops
usermod -aG sudo cgops
mkdir -p /home/cgops/.ssh
cp ~/.ssh/authorized_keys /home/cgops/.ssh/
chown -R cgops:cgops /home/cgops/.ssh
chmod 700 /home/cgops/.ssh
chmod 600 /home/cgops/.ssh/authorized_keys

# Disable root SSH + password auth
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Firewall
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp        # HTTP/3
ufw --force enable

# Install Docker + Compose
curl -fsSL https://get.docker.com | sh
usermod -aG docker cgops
```

Switch to the `cgops` user from now on:

```bash
su - cgops
```

---

## 4 · Pull the project

```bash
sudo mkdir -p /opt/contextgate
sudo chown cgops:cgops /opt/contextgate
cd /opt/contextgate

git clone https://github.com/<your-org>/contextgate.git .
# or upload via rsync if private and you don't want to install gh
```

---

## 5 · Prepare data + backup directories

```bash
sudo mkdir -p /srv/contextgate/workspaces
sudo chown -R cgops:cgops /srv/contextgate

sudo mkdir -p /var/backups/contextgate
sudo chown -R cgops:cgops /var/backups/contextgate
```

Create a folder layout for each workspace + connector:

```
/srv/contextgate/workspaces/
├── eng-team/
│   ├── docs/
│   └── runbooks/
└── hr-team/
    └── policies/
```

---

## 6 · Configure environment

```bash
cd /opt/contextgate
cp .env.prod.example .env
chmod 600 .env

# Generate strong secrets
openssl rand -base64 48                 # for JWT_SECRET
openssl rand -hex 32                    # for DB_PASSWORD
openssl rand -hex 32                    # for REDIS_PASSWORD

nano .env
```

Fill in:
- `APP_DOMAIN`, `API_DOMAIN`, `ACME_EMAIL`
- `VITE_API_URL=https://<API_DOMAIN>`
- `CORS_ORIGIN=https://<APP_DOMAIN>`
- `DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`

---

## 7 · Edit Caddyfile + docker-compose.prod.yml

`Caddyfile` already reads `{$APP_DOMAIN}` and `{$API_DOMAIN}` from env — usually nothing to edit.

`docker-compose.prod.yml`:
- Confirm the volumes line points to `/srv/contextgate/workspaces:/data/workspaces:rw`

---

## 8 · First deploy

```bash
cd /opt/contextgate
docker compose -f docker-compose.prod.yml up -d --build
```

This will:
1. Build server + dashboard images
2. Start postgres, redis, server, dashboard, caddy
3. Caddy auto-requests TLS certs from Let's Encrypt
4. App should be reachable at `https://app.example.com`

Watch logs:
```bash
docker compose -f docker-compose.prod.yml logs -f
```

If TLS fails, check:
- DNS A records pointing correctly (`dig app.example.com`)
- Ports 80/443 open in firewall + cloud security groups
- `ACME_EMAIL` valid

---

## 9 · Run database migration

First run only — apply schema:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$DB_USER" -d "$DB_NAME" \
  < packages/core/src/db/migrations/0000_calm_toro.sql
```

(Source `.env` first or substitute `$DB_USER` / `$DB_NAME` literals.)

---

## 10 · Create the first admin user

Open `https://app.example.com/register`, sign up. The first user is `admin` by default (see `users.role`).

Or via curl:
```bash
curl -X POST https://mcp.example.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<strong>","name":"Admin"}'
```

---

## 11 · Configure first workspace + connector

In the dashboard:

1. **Workspaces** → New: name `Engineering`, slug `eng-team`
2. **Connectors** → New:
   - name `Engineering Docs`
   - type `FileSystem`
   - workspace `Engineering`
   - rootPath `/data/workspaces/eng-team/docs`
   - readOnly `true` (recommended for first try)
3. **Agents** → New: name `Claude Desktop` → save the API key shown
4. **Policies** → New: agent + pattern `filesystem://*/file/**.md` → action `read`

---

## 12 · Connect AI client

Give your team this template:

```
URL:  https://mcp.example.com/mcp/v1/sse?api_key=<their-api-key>
Transport: http
```

Each user gets their own API key (one Agent per person/AI client) and their own audit trail.

---

## 13 · Schedule daily backups

```bash
chmod +x /opt/contextgate/scripts/backup.sh /opt/contextgate/scripts/restore.sh

# Cron at 03:00 UTC daily
crontab -e
```

Add:
```
0 3 * * * /opt/contextgate/scripts/backup.sh >> /var/log/cg-backup.log 2>&1
```

Test once manually:
```bash
/opt/contextgate/scripts/backup.sh
ls -lh /var/backups/contextgate/
```

### Off-site backups (highly recommended)

Edit `scripts/backup.sh` and uncomment the rclone or `aws s3 sync` block, configure once with `rclone config` (Backblaze B2 is cheapest at ~$0.005/GB/mo).

---

## 14 · Restore drill (do this once before you need it)

On a staging box:

```bash
./scripts/restore.sh /var/backups/contextgate/<latest-timestamp>
```

Confirms backups actually work. Schedule a quarterly drill.

---

## 15 · Routine operations

| Task                      | Command                                                              |
|---------------------------|----------------------------------------------------------------------|
| View logs                 | `docker compose -f docker-compose.prod.yml logs -f --tail 200 server` |
| Restart server only       | `docker compose -f docker-compose.prod.yml restart server`            |
| Pull new code + redeploy  | `git pull && docker compose -f docker-compose.prod.yml up -d --build` |
| Stop everything           | `docker compose -f docker-compose.prod.yml down`                      |
| Postgres shell            | `docker compose -f docker-compose.prod.yml exec postgres psql -U $DB_USER $DB_NAME` |
| Manual backup             | `./scripts/backup.sh`                                                 |
| Disk usage                | `du -sh /srv/contextgate /var/backups/contextgate`                    |
| Renew certs (auto by Caddy) | `docker compose -f docker-compose.prod.yml restart caddy`           |

---

## 16 · Monitoring (light weight)

For 10–50 person teams, free options are enough:

- **Uptime**: UptimeRobot (5-min checks free) → ping `https://mcp.example.com/health`
- **Errors**: tail `docker logs` or pipe to a Discord/Slack webhook on `error` lines
- **Metrics**: optional Prometheus + Grafana via `cadvisor` (later upgrade)

---

## 17 · Hardening checklist before going live

- [x] Domain + TLS working (visit `https://app.example.com`)
- [x] DB / Redis not exposed on host ports (verify with `ss -tlnp`)
- [x] `.env` is `chmod 600`
- [x] Strong `JWT_SECRET`, `DB_PASSWORD`, `REDIS_PASSWORD`
- [x] API keys stored as SHA-256 hashes (default after this version)
- [x] CORS_ORIGIN locked to your dashboard domain
- [x] Firewall: only 22, 80, 443 open
- [x] SSH: key-only, no root login
- [x] Daily backups scheduled
- [x] Backup off-site (S3/B2/rclone)
- [x] Restore drill done at least once
- [x] Connector `readOnly` on by default for new sources
- [ ] Rate limiting (TODO — Redis-based, planned)
- [ ] PolicyEngine enforcement on tool calls (TODO)

---

## 18 · Updating

When new code lands:

```bash
cd /opt/contextgate
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

If a migration is needed:
```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$DB_USER" -d "$DB_NAME" \
  < packages/core/src/db/migrations/<new-migration>.sql
```

Bump `VERSION` in `.env` so images are tagged with the new release.

---

## Cost summary (Hetzner CPX21 example)

| Item                     | $ / month |
|--------------------------|-----------|
| VPS (2 vCPU / 4 GB / 80 GB) | 8.21   |
| Backup storage (B2 ~10 GB) | 0.05    |
| Domain (.com via Cloudflare) | ~0.85 |
| **Total**                | **≈ $9 / mo** |

DigitalOcean / Vultr equivalent ≈ **$25–30 / mo**.

---

## Troubleshooting

**Caddy can't get cert**
- DNS not pointing yet → wait, check `dig`
- Port 80 blocked → cloud firewall + ufw
- Wrong `ACME_EMAIL` → fix in `.env`, `docker compose restart caddy`

**Server crashes on startup**
- Check `docker compose logs server`
- Most common: missing env vars or DB not migrated yet

**SSE / MCP timeouts**
- Caddyfile already sets `flush_interval -1` and 10-min read timeout — should be fine
- Check Cloudflare proxy if used (orange cloud) — disable for the API subdomain or set "no caching"

**Out of disk space**
- `/srv/contextgate/workspaces` grew → add a larger volume / clean old files
- Old backups → adjust `RETENTION_DAYS` in `backup.sh`
- Docker images → `docker system prune -af`
