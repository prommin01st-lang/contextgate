#!/usr/bin/env bash
# ============================================================
# ContextGate — Restore from Backup
# ============================================================
#
# Usage:
#   ./scripts/restore.sh /var/backups/contextgate/2026-05-09T03-00-00Z
#
# Restores:
#   - PostgreSQL database (drops + recreates)
#   - Workspace files (extracts to original path)
#
# ⚠ WARNING: This is DESTRUCTIVE. The database will be dropped
#   and recreated from the dump. Workspace files will be replaced.
#   Always test on staging first.
# ============================================================

set -euo pipefail

# ─── Args ────────────────────────────────────────────────────
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup-dir>"
  echo ""
  echo "Available backups:"
  ls -1 "${BACKUP_ROOT:-/var/backups/contextgate}/" 2>/dev/null || echo "  (none)"
  exit 1
fi

BACKUP_DIR="$1"
WORKSPACES_DIR="${WORKSPACES_DIR:-/srv/contextgate/workspaces}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/contextgate/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-/opt/contextgate/.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "✗ Backup not found: $BACKUP_DIR"
  exit 1
fi

# ─── Confirmation ────────────────────────────────────────────
echo "⚠ This will DESTROY current data and restore from:"
echo "  $BACKUP_DIR"
echo ""
echo "Files in backup:"
ls -lh "$BACKUP_DIR"
echo ""
read -r -p "Type 'restore' to confirm: " CONFIRM
[[ "$CONFIRM" == "restore" ]] || { echo "Aborted."; exit 1; }

# ─── 1. Restore DB ──────────────────────────────────────────
if [[ -f "$BACKUP_DIR/db.sql.gz" ]]; then
  echo "▶ Restoring database ..."
  # Drop + recreate
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "${DB_USER:-postgres}" -d postgres -c \
    "DROP DATABASE IF EXISTS \"${DB_NAME:-contextgate}\"; CREATE DATABASE \"${DB_NAME:-contextgate}\";"

  gunzip -c "$BACKUP_DIR/db.sql.gz" \
    | docker compose -f "$COMPOSE_FILE" exec -T postgres \
        psql -U "${DB_USER:-postgres}" -d "${DB_NAME:-contextgate}"
  echo "  ✓ Database restored"
else
  echo "  ⚠ db.sql.gz not in backup, skipping DB restore"
fi

# ─── 2. Restore files ───────────────────────────────────────
if [[ -f "$BACKUP_DIR/workspaces.tar.gz" ]]; then
  echo "▶ Restoring workspace files ..."
  PARENT="$(dirname "$WORKSPACES_DIR")"
  # Backup current state before extracting
  if [[ -d "$WORKSPACES_DIR" ]]; then
    SAFE_BACKUP="$WORKSPACES_DIR.before-restore-$(date -u +%s)"
    mv "$WORKSPACES_DIR" "$SAFE_BACKUP"
    echo "  ↳ Existing files moved to: $SAFE_BACKUP"
  fi
  mkdir -p "$PARENT"
  tar -xzf "$BACKUP_DIR/workspaces.tar.gz" -C "$PARENT"
  echo "  ✓ Files restored to $WORKSPACES_DIR"
else
  echo "  ⚠ workspaces.tar.gz not in backup, skipping file restore"
fi

# ─── 3. Restart server to flush caches ──────────────────────
echo "▶ Restarting server ..."
docker compose -f "$COMPOSE_FILE" restart server
echo ""
echo "✓ Restore complete."
