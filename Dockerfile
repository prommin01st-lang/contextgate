# ==========================================
# ContextGate Server Dockerfile
# Node.js 22 with --experimental-strip-types
# ==========================================

# ─── Stage 1: Dependencies ───
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Copy workspace definition and root package files
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/core/package.json ./packages/core/
COPY packages/connectors/package.json ./packages/connectors/

# Install dependencies (including devDeps for tsx runtime)
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Runner ───
FROM node:22-alpine AS runner

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy production node_modules
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy TypeScript source code (needed for strip-types runtime)
COPY --chown=nodejs:nodejs apps/server/src ./apps/server/src
COPY --chown=nodejs:nodejs packages/core/src ./packages/core/src
COPY --chown=nodejs:nodejs packages/connectors/src ./packages/connectors/src

# Copy package manifests (for module resolution)
COPY --chown=nodejs:nodejs package.json pnpm-workspace.yaml ./
COPY --chown=nodejs:nodejs apps/server/package.json ./apps/server/package.json
COPY --chown=nodejs:nodejs packages/core/package.json ./packages/core/package.json
COPY --chown=nodejs:nodejs packages/connectors/package.json ./packages/connectors/package.json

# Switch to non-root user
USER nodejs

# Expose server port
EXPOSE 8899

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8899/health || exit 1

WORKDIR /app/apps/server
CMD ["npx", "tsx", "src/server.ts"]
