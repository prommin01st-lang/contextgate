#!/bin/bash
set -euo pipefail

# ==========================================
# ContextGate Database Reset Script
# Drops, recreates, migrates, and seeds DB
# ==========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🗄️  ContextGate Database Reset"
echo "==============================="

# Load .env if exists
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
fi

# Default values
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:-postgres}"
DB_NAME="${DB_NAME:-contextgate}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

echo "📡 Connecting to PostgreSQL at $DB_HOST:$DB_PORT"

# ─── Drop and recreate database ───
echo "🧹 Dropping database '$DB_NAME'..."
PGPASSWORD="$DB_PASS" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d postgres \
    -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" \
    2>/dev/null || true

echo "🆕 Creating database '$DB_NAME'..."
PGPASSWORD="$DB_PASS" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d postgres \
    -c "CREATE DATABASE \"$DB_NAME\";" \
    2>/dev/null || true

# ─── Run migrations ───
echo "🏗️  Running migrations..."
cd "$ROOT_DIR"
pnpm db:migrate

# ─── Seed sample data ───
echo "🌱 Seeding sample data..."
# TODO: Add seed script when available
# pnpm --filter @contextgate/core db:seed

echo ""
echo "✅ Database reset complete!"
echo ""
