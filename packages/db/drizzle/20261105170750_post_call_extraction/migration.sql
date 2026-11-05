ALTER TABLE "calls" ADD COLUMN "extraction" json;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "extraction_status" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "extraction_error" text;