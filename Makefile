.PHONY: dev build test clean docker-up docker-down lint typecheck help

# Default target
.DEFAULT_GOAL := help

# ─── Development ───
dev:
	@echo "🚀 Starting development mode..."
	@pnpm dev

# ─── Build ───
build:
	@echo "🏗️  Building all packages..."
	@pnpm build

# ─── Testing ───
test:
	@echo "🧪 Running tests..."
	@pnpm test

# ─── Linting ───
lint:
	@echo "🔍 Running linter..."
	@pnpm lint

typecheck:
	@echo "🔍 Running type check..."
	@pnpm typecheck

# ─── Docker ───
docker-up:
	@echo "🐳 Starting Docker services..."
	@docker compose up -d

docker-down:
	@echo "🛑 Stopping Docker services..."
	@docker compose down

docker-logs:
	@echo "📋 Showing Docker logs..."
	@docker compose logs -f

# ─── Database ───
db-migrate:
	@echo "🏗️  Running database migrations..."
	@pnpm db:migrate

db-reset:
	@echo "🗄️  Resetting database..."
	@bash scripts/reset-db.sh

# ─── Cleanup ───
clean:
	@echo "🧹 Cleaning build artifacts..."
	@pnpm exec turbo run clean 2>/dev/null || true
	@rm -rf apps/*/dist apps/*/build packages/*/dist packages/*/build
	@rm -rf node_modules .turbo
	@docker compose down -v 2>/dev/null || true

# ─── Setup ───
setup:
	@echo "🔧 Running setup..."
	@bash scripts/setup.sh

# ─── Help ───
help:
	@echo "ContextGate Makefile"
	@echo "===================="
	@echo ""
	@echo "Development:"
	@echo "  make dev          Start development mode (turbo)"
	@echo "  make build        Build all packages"
	@echo "  make test         Run all tests"
	@echo "  make lint         Run linter"
	@echo "  make typecheck    Run TypeScript type checking"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up    Start Docker services"
	@echo "  make docker-down  Stop Docker services"
	@echo "  make docker-logs  View Docker logs"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate   Run database migrations"
	@echo "  make db-reset     Reset database (drop, recreate, migrate)"
	@echo ""
	@echo "Utility:"
	@echo "  make setup        Run full development setup"
	@echo "  make clean        Clean build artifacts and volumes"
	@echo "  make help         Show this help message"
