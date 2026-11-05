CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY,
	"organization_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_hash" text NOT NULL UNIQUE,
	"prefix" text NOT NULL,
	"created_by" text,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "api_keys_organization_id_created_at_idx" ON "api_keys" ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
-- Dynamic roles are stored per organization, so existing admin roles need the new resource. Roles that cannot place calls are skipped: an API key can.
UPDATE "organization_role"
SET "permission" = ("permission"::jsonb || '{"apiKey":["read","create","revoke"]}'::jsonb)::text
WHERE "role" = 'admin'
  AND "permission"::jsonb -> 'calls' ? 'create'
  AND NOT "permission"::jsonb ? 'apiKey';
