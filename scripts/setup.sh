#!/bin/bash
set -euo pipefail

# ==========================================
# ContextGate Development Setup Script
# ==========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 ContextGate Setup"
echo "===================="

# ─── Check Node.js version ───
echo "📦 Checking Node.js..."
if ! command -v node &>/dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ and try again."
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "❌ Node.js $NODE_VERSION is too old. Please upgrade to Node.js 20+."
    exit 1
fi

echo "✅ Node.js $NODE_VERSION detected"

# ─── Install pnpm ───
echo "📦 Checking pnpm..."
if ! command -v pnpm &>/dev/null; then
    echo "📥 Installing pnpm..."
    corepack enable 2>/dev/null || npm install -g pnpm@9
fi

PNPM_VERSION=$(pnpm -v)
echo "✅ pnpm $PNPM_VERSION"

# ─── Install dependencies ───
echo "📥 Installing dependencies..."
cd "$ROOT_DIR"
pnpm install

# ─── Copy .env if missing ───
if [ ! -f "$ROOT_DIR/.env" ]; then
    echo "📝 Creating .env from .env.example..."
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    echo "⚠️  Please review .env and update secrets before production use."
fi

# ─── Docker Compose ───
echo "🐳 Starting Docker services..."
cd "$ROOT_DIR"
docker compose up -d

echo ""
echo "✅ Setup complete!"
echo ""
echo "Services:"
echo "  - API Server:    http://localhost:8899"
echo "  - Dashboard:     http://localhost:5899"
echo "  - PostgreSQL:    localhost:5432"
echo "  - Redis:         localhost:6379"
echo ""
echo "Next steps:"
echo "  1. Review .env file"
echo "  2. Run migrations: pnpm db:migrate"
echo "  3. Start dev server: pnpm dev"
