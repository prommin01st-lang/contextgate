#!/usr/bin/env bash
# ============================================================
# ContextGate — Daily Backup Script
# ============================================================
#
# Backs up:
#   - PostgreSQL database (pg_dump)
#   - Workspace files (/srv/contextgate/workspaces)
#
# Output: /var/backups/contextgate/<timestamp>/
#   ├── db.sql.gz
#   └── workspaces.tar.gz
#
# Cron example (daily at 03:00):
#   0 3 * * *  /opt/contextgate/scripts/backup.sh >> /var/log/cg-backup.log 2>&1
#
# Optional: tail of script can sync to S3/B2 — see end.
# ============================================================

set -euo pipefail

# ─── Config (override via env) ──────────────────────────────
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/contextgate}"
WORKSPACES_DIR="${WORKSPACES_DIR:-/srv/contextgate/workspaces}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/contextgate/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-/opt/contextgate/.env}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Load env (DB_USER, DB_NAME, etc.)
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

TS=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
DEST="$BACKUP_ROOT/$TS"
mkdir -p "$DEST"

echo "[$(date -u)] Starting backup → $DEST"

# ─── 1. Database dump ───────────────────────────────────────
echo "  ▶ pg_dump ..."
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "${DB_USER:-postgres}" -d "${DB_NAME:-contextgate}" \
    --no-owner --no-privileges \
  | gzip -9 > "$DEST/db.sql.gz"

DB_SIZE=$(du -h "$DEST/db.sql.gz" | cut -f1)
echo "    ✓ db.sql.gz ($DB_SIZE)"

# ─── 2. Workspace files ─────────────────────────────────────
if [[ -d "$WORKSPACES_DIR" ]]; then
  echo "  ▶ tar workspaces ..."
  tar -czf "$DEST/workspaces.tar.gz" \
      -C "$(dirname "$WORKSPACES_DIR")" "$(basename "$WORKSPACES_DIR")"
  FILES_SIZE=$(du -h "$DEST/workspaces.tar.gz" | cut -f1)
  echo "    ✓ workspaces.tar.gz ($FILES_SIZE)"
else
  echo "  ⚠ Workspaces dir not found: $WORKSPACES_DIR (skipping)"
fi

# ─── 3. Manifest ────────────────────────────────────────────
cat > "$DEST/manifest.txt" <<EOF
ContextGate backup
Timestamp:  $TS
Hostname:   $(hostname)
DB:         ${DB_NAME:-contextgate} (user: ${DB_USER:-postgres})
Files:      $(ls -lh "$DEST" | tail -n +2 | awk '{print "  - "$9" ("$5")"}')
EOF
echo "  ✓ manifest.txt"

# ─── 4. Prune old backups ───────────────────────────────────
echo "  ▶ Pruning backups older than $RETENTION_DAYS days ..."
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" \
  -print -exec rm -rf {} +

# ─── 5. Optional: Upload to remote (S3 / B2 / rclone) ───────
# Uncomment and configure as needed.
#
# if command -v aws >/dev/null 2>&1; then
#   aws s3 sync "$BACKUP_ROOT" "s3://my-cg-backups/" --delete
#   echo "  ✓ Synced to S3"
# fi
#
# if command -v rclone >/dev/null 2>&1; then
#   rclone copy "$DEST" "remote:contextgate-backups/$TS"
#   echo "  ✓ Uploaded via rclone"
# fi

TOTAL_SIZE=$(du -sh "$DEST" | cut -f1)
echo "[$(date -u)] Backup complete: $DEST ($TOTAL_SIZE)"
