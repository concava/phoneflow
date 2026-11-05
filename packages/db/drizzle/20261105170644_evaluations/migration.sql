CREATE TABLE "evaluation_results" (
	"id" uuid PRIMARY KEY,
	"run_id" uuid NOT NULL,
	"call_id" uuid,
	"status" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"verdicts" json,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" uuid PRIMARY KEY,
	"organization_id" text NOT NULL,
	"suite_id" uuid NOT NULL,
	"agent_version_id" uuid,
	"calls_from" timestamp with time zone,
	"calls_to" timestamp with time zone,
	"status" text NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"passed_count" integer DEFAULT 0 NOT NULL,
	"inconclusive_count" integer DEFAULT 0 NOT NULL,
	"criteria" json NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_suites" (
	"id" uuid PRIMARY KEY,
	"organization_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"criteria" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "evaluation_results_run_id_idx" ON "evaluation_results" ("run_id");--> statement-breakpoint
CREATE INDEX "evaluation_results_call_id_idx" ON "evaluation_results" ("call_id");--> statement-breakpoint
CREATE INDEX "evaluation_runs_organization_id_created_at_idx" ON "evaluation_runs" ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "evaluation_runs_suite_id_created_at_idx" ON "evaluation_runs" ("suite_id","created_at");--> statement-breakpoint
CREATE INDEX "evaluation_suites_organization_id_created_at_idx" ON "evaluation_suites" ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_run_id_evaluation_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "evaluation_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_suite_id_evaluation_suites_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "evaluation_suites"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_agent_version_id_agent_versions_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "evaluation_suites" ADD CONSTRAINT "evaluation_suites_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
UPDATE "organization_role" SET "permission" = ("permission"::jsonb || '{"evaluation":["create","update","delete","run"]}'::jsonb)::text WHERE "role" = 'admin';