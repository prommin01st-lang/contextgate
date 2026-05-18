-- ============================================================
-- Migration: Add connector slug for MCP proxy support
--
-- 1. Add connectors.slug (nullable varchar, unique per workspace)
-- 2. Backfill existing connectors with slug derived from name
-- 3. Index for fast lookup by slug
-- ============================================================

ALTER TABLE "connectors" ADD COLUMN IF NOT EXISTS "slug" varchar(64);

-- Backfill: derive slug from name (lowercase, replace spaces with dashes)
UPDATE "connectors"
SET "slug" = LOWER(REGEXP_REPLACE(REPLACE("name", ' ', '-'), '[^a-z0-9-]', '', 'g'))
WHERE "slug" IS NULL;

-- Ensure uniqueness per workspace
DO $$
BEGIN
  -- Handle collisions by appending a counter
  WITH ranked AS (
    SELECT
      id,
      "slug" || '-' || ROW_NUMBER() OVER (PARTITION BY "workspace_id", "slug" ORDER BY "created_at")::text AS new_slug
    FROM "connectors"
    WHERE "slug" IS NOT NULL
  )
  UPDATE "connectors" c
  SET "slug" = r.new_slug
  FROM ranked r
  WHERE c.id = r.id;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Slug backfill note: %', SQLERRM;
END $$;

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connectors_workspace_slug_idx" ON "connectors" ("workspace_id", "slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connectors_slug_idx" ON "connectors" ("slug");
