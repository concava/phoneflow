CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "knowledge_bases" (
	"id" uuid PRIMARY KEY,
	"organization_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY,
	"document_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY,
	"knowledge_base_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"mime_type" text NOT NULL,
	"content" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "knowledge_bases_organization_id_created_at_idx" ON "knowledge_bases" ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunks_document_id_chunk_index_uidx" ON "knowledge_chunks" ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_organization_id_knowledge_base_id_idx" ON "knowledge_chunks" ("organization_id","knowledge_base_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_embedding_hnsw_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "knowledge_documents_knowledge_base_id_created_at_idx" ON "knowledge_documents" ("knowledge_base_id","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_documents_organization_id_idx" ON "knowledge_documents" ("organization_id");--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_base_id_knowledge_bases_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_knowledge_base_id_knowledge_bases_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
UPDATE "organization_role" SET "permission" = ("permission"::jsonb || '{"knowledgeBase":["create","update","delete"]}'::jsonb)::text WHERE "role" = 'admin';
