import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { serve } from "@hono/node-server";

import { authMiddleware, apiKeyMiddleware } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { workspaceRoutes } from "./routes/workspaces";
import { agentRoutes } from "./routes/agents";
import { connectorRoutes } from "./routes/connectors";
import { policyRoutes } from "./routes/policies";
import { auditLogRoutes } from "./routes/audit-logs";
import { fileRoutes } from "./routes/files";
import { resourceRoutes } from "./routes/resources";
import { userRoutes } from "./routes/users";
import { mcpRoutes } from "./routes/mcp";

const app = new Hono();

// Global middleware
app.use(logger());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(prettyJSON());

// Health check (no auth required)
app.get("/health", (c) => {
  return c.json({ status: "ok", version: "0.1.0", timestamp: new Date().toISOString() });
});

// Auth routes (no auth required)
app.route("/auth", authRoutes);

// MCP SSE endpoint — API Key auth
app.route("/mcp/v1/sse", mcpRoutes);

// REST API routes — JWT auth
app.use("/api/*", authMiddleware);
app.route("/api/workspaces", workspaceRoutes);
app.route("/api/agents", agentRoutes);
app.route("/api/connectors", connectorRoutes);
app.route("/api/policies", policyRoutes);
app.route("/api/audit-logs", auditLogRoutes);
app.route("/api/files", fileRoutes);
app.route("/api/resources", resourceRoutes);
app.route("/api/users", userRoutes);

// 404 handler
app.notFound((c) => c.json({ error: "Not Found", path: c.req.path }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: "Internal Server Error", message: err.message }, 500);
});

const port = Number(process.env.PORT) || 8899;
serve({
  fetch: app.fetch,
  port,
});

console.log(`🚀 Server running at http://localhost:${port}`);

export default app;
