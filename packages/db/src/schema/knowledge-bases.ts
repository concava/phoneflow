import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core"

import { organization } from "@workspace/db/schema/auth"
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from "@workspace/shared/api/knowledge-bases/schemas"
import type {
  KnowledgeDocumentErrorCode,
  KnowledgeDocumentStatus,
} from "@workspace/shared/api/knowledge-bases/types"

export const knowledgeBasesTable = pgTable(
  "knowledge_bases",
  {
    id: uuid().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: varchar({ length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("knowledge_bases_organization_id_created_at_idx").on(
      table.organizationId,
      table.createdAt
    ),
  ]
)

export const knowledgeDocumentsTable = pgTable(
  "knowledge_documents",
  {
    id: uuid().primaryKey(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBasesTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: varchar({ length: 255 }).notNull(),
    mimeType: text("mime_type").notNull(),
    content: text().notNull(),
    status: text().notNull().$type<KnowledgeDocumentStatus>(),
    error: text().$type<KnowledgeDocumentErrorCode>(),
    chunkCount: integer("chunk_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("knowledge_documents_knowledge_base_id_created_at_idx").on(
      table.knowledgeBaseId,
      table.createdAt
    ),
    index("knowledge_documents_organization_id_idx").on(table.organizationId),
  ]
)

export const knowledgeChunksTable = pgTable(
  "knowledge_chunks",
  {
    id: uuid().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocumentsTable.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBasesTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text().notNull(),
    embedding: vector({
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    }).notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_chunks_document_id_chunk_index_uidx").on(
      table.documentId,
      table.chunkIndex
    ),
    index("knowledge_chunks_organization_id_knowledge_base_id_idx").on(
      table.organizationId,
      table.knowledgeBaseId
    ),
    index("knowledge_chunks_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
)
