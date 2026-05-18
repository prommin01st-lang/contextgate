import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ───────────────────────────────────────────────────────────────
// Workspaces
// ───────────────────────────────────────────────────────────────
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    settings: jsonb("settings").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index("workspaces_slug_idx").on(table.slug),
    createdAtIdx: index("workspaces_created_at_idx").on(table.createdAt),
  })
);

// ───────────────────────────────────────────────────────────────
// Users
// ───────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 255 }),
    role: varchar("role", { length: 50 }).default("admin").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
    createdAtIdx: index("users_created_at_idx").on(table.createdAt),
  })
);

// ───────────────────────────────────────────────────────────────
// Agents
// ───────────────────────────────────────────────────────────────
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    apiKeyHash: text("api_key_hash").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("agents_workspace_id_idx").on(table.workspaceId),
    createdAtIdx: index("agents_created_at_idx").on(table.createdAt),
  })
);

// ───────────────────────────────────────────────────────────────
// Connectors
// ───────────────────────────────────────────────────────────────
export const connectors = pgTable(
  "connectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 64 }),
    config: jsonb("config").default({}).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    readOnly: boolean("read_only").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("connectors_workspace_id_idx").on(table.workspaceId),
    slugIdx: index("connectors_slug_idx").on(table.slug),
    typeIdx: index("connectors_type_idx").on(table.type),
    createdAtIdx: index("connectors_created_at_idx").on(table.createdAt),
  })
);

// ───────────────────────────────────────────────────────────────
// Resources
// ───────────────────────────────────────────────────────────────
export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => connectors.id, { onDelete: "cascade" }),
    uri: text("uri").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    connectorIdIdx: index("resources_connector_id_idx").on(table.connectorId),
    uriIdx: index("resources_uri_idx").on(table.uri),
    createdAtIdx: index("resources_created_at_idx").on(table.createdAt),
  })
);

// ───────────────────────────────────────────────────────────────
// Policies
//
// Either `agentId` is set (per-agent policy) OR `workspaceId` is set
// (workspace-level policy that applies to all agents in the workspace).
// ───────────────────────────────────────────────────────────────
export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: "cascade",
    }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    resourcePattern: text("resource_pattern").notNull(),
    actions: text("actions").array().notNull().default(["read"]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    agentIdIdx: index("policies_agent_id_idx").on(table.agentId),
    workspaceIdIdx: index("policies_workspace_id_idx").on(table.workspaceId),
    createdAtIdx: index("policies_created_at_idx").on(table.createdAt),
  })
);

// ───────────────────────────────────────────────────────────────
// Audit Logs
// ───────────────────────────────────────────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    resourceUri: text("resource_uri"),
    status: varchar("status", { length: 50 }).notNull(),
    details: jsonb("details").default({}),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("audit_logs_workspace_id_idx").on(table.workspaceId),
    agentIdIdx: index("audit_logs_agent_id_idx").on(table.agentId),
    actionIdx: index("audit_logs_action_idx").on(table.action),
    createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  })
);
