-- ============================================================
-- Migration: workspace-scoped policies
--
-- 1. Make policies.agent_id nullable (for workspace-only policies)
-- 2. Add policies.workspace_id (nullable, for workspace-scope)
-- 3. Index workspace_id for fast lookup in PolicyEngine
-- ============================================================

ALTER TABLE "policies" ALTER COLUMN "agent_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policies" ADD CONSTRAINT "policies_workspace_id_workspaces_id_fk"
   FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
   ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_workspace_id_idx" ON "policies" ("workspace_id");
