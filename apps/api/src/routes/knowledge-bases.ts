import { and, count, desc, eq, inArray } from "drizzle-orm"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"

import { db } from "@workspace/db/client"
import {
  knowledgeBasesTable,
  knowledgeChunksTable,
  knowledgeDocumentsTable,
} from "@workspace/db/schema/knowledge-bases"
import {
  completeKnowledgeDocumentRequestSchema,
  createKnowledgeBaseRequestSchema,
  failKnowledgeDocumentRequestSchema,
  internalKnowledgeDocumentParamsSchema,
  KNOWLEDGE_DOCUMENT_MAX_BYTES,
  KNOWLEDGE_DOCUMENT_MIME_TYPES,
  knowledgeBaseIdParamsSchema,
  knowledgeDocumentParamsSchema,
  searchKnowledgeBasesRequestSchema,
  testKnowledgeBaseSearchRequestSchema,
} from "@workspace/shared/api/knowledge-bases/schemas"
import type {
  CompleteKnowledgeDocumentResponse,
  DeleteKnowledgeBaseResponse,
  DeleteKnowledgeDocumentResponse,
  FailKnowledgeDocumentResponse,
  KnowledgeBaseDetailResponse,
  KnowledgeBaseListResponse,
  KnowledgeBaseResponse,
  KnowledgeDocumentResponse,
  KnowledgeSearchResponse,
  StartKnowledgeDocumentResponse,
} from "@workspace/shared/api/knowledge-bases/types"
import { EmbeddingsError } from "@workspace/shared/knowledge/embeddings"
import { requireOrganization } from "@/lib/auth/organization"
import { requirePermission } from "@/lib/auth/permissions"
import { requireAuthToken } from "@/lib/auth/token"
import { t } from "@/lib/i18n"
import {
  decodeEmbedding,
  enqueueKnowledgeDocument,
  knowledgeEmbeddingsConfigured,
  removeKnowledgeBaseFromDrafts,
  searchKnowledge,
} from "@/lib/knowledge"
import { validator } from "@/lib/validator"

const MULTIPART_OVERHEAD_BYTES = 64 * 1024
const CHUNK_INSERT_BATCH_SIZE = 500
const MAX_DOCUMENT_NAME_LENGTH = 255
// Stay inside the voice agent's 1500 ms tool budget, leaving time for the database query.
const CALL_SEARCH_EMBEDDING_TIMEOUT_MS = 1300
const TEST_SEARCH_EMBEDDING_TIMEOUT_MS = 10_000

function mimeTypeFor(fileName: string) {
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase()
  return Object.entries(KNOWLEDGE_DOCUMENT_MIME_TYPES).find(
    ([allowed]) => allowed === extension
  )?.[1]
}

function decodeDocument(bytes: ArrayBuffer) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    // Postgres text columns can't store NUL, and text documents never contain it.
    return text.includes("\0") ? null : text
  } catch {
    return null
  }
}

function documentColumns() {
  return {
    id: knowledgeDocumentsTable.id,
    knowledgeBaseId: knowledgeDocumentsTable.knowledgeBaseId,
    name: knowledgeDocumentsTable.name,
    mimeType: knowledgeDocumentsTable.mimeType,
    status: knowledgeDocumentsTable.status,
    error: knowledgeDocumentsTable.error,
    chunkCount: knowledgeDocumentsTable.chunkCount,
    createdAt: knowledgeDocumentsTable.createdAt,
    updatedAt: knowledgeDocumentsTable.updatedAt,
  }
}

export const knowledgeBaseRoutes = new Hono()

knowledgeBaseRoutes.post(
  "/search",
  requireAuthToken,
  validator("json", searchKnowledgeBasesRequestSchema),
  async (c) => {
    const { callId, knowledgeBaseIds, query, limit } = c.req.valid("json")

    try {
      const call = await db.query.callsTable.findFirst({
        where: { id: callId },
        columns: { organizationId: true },
      })

      if (!call) {
        return c.json({ error: "Call not found" }, 404)
      }

      const results = await searchKnowledge({
        organizationId: call.organizationId,
        knowledgeBaseIds,
        query,
        limit,
        timeoutMs: CALL_SEARCH_EMBEDDING_TIMEOUT_MS,
      })

      return c.json({ results } satisfies KnowledgeSearchResponse)
    } catch (error) {
      console.error("Knowledge base search failed", error)
      return c.json({ error: "Knowledge base search failed" }, 500)
    }
  }
)

knowledgeBaseRoutes.post(
  "/documents/:documentId/start",
  requireAuthToken,
  validator("param", internalKnowledgeDocumentParamsSchema),
  async (c) => {
    const { documentId } = c.req.valid("param")

    try {
      const [document] = await db
        .update(knowledgeDocumentsTable)
        .set({ status: "processing", error: null, updatedAt: new Date() })
        .where(
          and(
            eq(knowledgeDocumentsTable.id, documentId),
            inArray(knowledgeDocumentsTable.status, ["pending", "processing"])
          )
        )
        .returning({ content: knowledgeDocumentsTable.content })

      return c.json({
        content: document?.content ?? null,
      } satisfies StartKnowledgeDocumentResponse)
    } catch {
      return c.json({ error: "Failed to start document processing" }, 500)
    }
  }
)

knowledgeBaseRoutes.post(
  "/documents/:documentId/complete",
  requireAuthToken,
  validator("param", internalKnowledgeDocumentParamsSchema),
  validator("json", completeKnowledgeDocumentRequestSchema),
  async (c) => {
    const { documentId } = c.req.valid("param")
    const { chunks } = c.req.valid("json")

    try {
      const replaced = await db.transaction(async (tx) => {
        const [document] = await tx
          .select({
            knowledgeBaseId: knowledgeDocumentsTable.knowledgeBaseId,
            organizationId: knowledgeDocumentsTable.organizationId,
            status: knowledgeDocumentsTable.status,
          })
          .from(knowledgeDocumentsTable)
          .where(eq(knowledgeDocumentsTable.id, documentId))
          .for("update")

        if (document?.status !== "processing") {
          return false
        }

        await tx
          .delete(knowledgeChunksTable)
          .where(eq(knowledgeChunksTable.documentId, documentId))

        const rows = chunks.map((chunk, chunkIndex) => ({
          id: crypto.randomUUID(),
          documentId,
          knowledgeBaseId: document.knowledgeBaseId,
          organizationId: document.organizationId,
          chunkIndex,
          content: chunk.content,
          embedding: decodeEmbedding(chunk.embedding),
        }))

        for (
          let start = 0;
          start < rows.length;
          start += CHUNK_INSERT_BATCH_SIZE
        ) {
          await tx
            .insert(knowledgeChunksTable)
            .values(rows.slice(start, start + CHUNK_INSERT_BATCH_SIZE))
        }

        await tx
          .update(knowledgeDocumentsTable)
          .set({
            status: "ready",
            error: null,
            chunkCount: rows.length,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeDocumentsTable.id, documentId))

        return true
      })

      if (!replaced) {
        return c.json({ error: "Document is not being processed" }, 409)
      }

      return c.json({
        chunkCount: chunks.length,
      } satisfies CompleteKnowledgeDocumentResponse)
    } catch (error) {
      console.error("Failed to store knowledge document chunks", error)
      return c.json({ error: "Failed to store document chunks" }, 500)
    }
  }
)

knowledgeBaseRoutes.post(
  "/documents/:documentId/fail",
  requireAuthToken,
  validator("param", internalKnowledgeDocumentParamsSchema),
  validator("json", failKnowledgeDocumentRequestSchema),
  async (c) => {
    const { documentId } = c.req.valid("param")
    const { error } = c.req.valid("json")

    try {
      await db
        .update(knowledgeDocumentsTable)
        .set({ status: "failed", error, updatedAt: new Date() })
        .where(
          and(
            eq(knowledgeDocumentsTable.id, documentId),
            inArray(knowledgeDocumentsTable.status, ["pending", "processing"])
          )
        )

      return c.json({ ok: true } satisfies FailKnowledgeDocumentResponse)
    } catch {
      return c.json({ error: "Failed to update document" }, 500)
    }
  }
)

knowledgeBaseRoutes.get("/", requireOrganization, async (c) => {
  const organizationId = c.get("organizationId")
  const locale = c.get("locale")

  try {
    const knowledgeBases = await db
      .select({
        id: knowledgeBasesTable.id,
        name: knowledgeBasesTable.name,
        createdAt: knowledgeBasesTable.createdAt,
        updatedAt: knowledgeBasesTable.updatedAt,
        documentCount: count(knowledgeDocumentsTable.id),
      })
      .from(knowledgeBasesTable)
      .leftJoin(
        knowledgeDocumentsTable,
        eq(knowledgeDocumentsTable.knowledgeBaseId, knowledgeBasesTable.id)
      )
      .where(eq(knowledgeBasesTable.organizationId, organizationId))
      .groupBy(knowledgeBasesTable.id)
      .orderBy(desc(knowledgeBasesTable.createdAt))

    return c.json(knowledgeBases satisfies KnowledgeBaseListResponse)
  } catch {
    return c.json({ error: t(locale, "knowledge_bases.list_failed") }, 500)
  }
})

knowledgeBaseRoutes.post(
  "/",
  requireOrganization,
  requirePermission({ knowledgeBase: ["create"] }),
  validator("json", createKnowledgeBaseRequestSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { name } = c.req.valid("json")

    try {
      const [knowledgeBase] = await db
        .insert(knowledgeBasesTable)
        .values({ id: crypto.randomUUID(), organizationId, name })
        .returning({
          id: knowledgeBasesTable.id,
          name: knowledgeBasesTable.name,
          createdAt: knowledgeBasesTable.createdAt,
          updatedAt: knowledgeBasesTable.updatedAt,
        })

      return c.json(knowledgeBase satisfies KnowledgeBaseResponse, 201)
    } catch {
      return c.json({ error: t(locale, "knowledge_bases.create_failed") }, 500)
    }
  }
)

knowledgeBaseRoutes.get(
  "/:id",
  requireOrganization,
  validator("param", knowledgeBaseIdParamsSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id } = c.req.valid("param")

    try {
      const knowledgeBase = await db.query.knowledgeBasesTable.findFirst({
        where: { id, organizationId },
        columns: {
          organizationId: false,
        },
        with: {
          documents: {
            columns: {
              organizationId: false,
              content: false,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      })

      if (!knowledgeBase) {
        return c.json({ error: t(locale, "knowledge_bases.not_found") }, 404)
      }

      return c.json(knowledgeBase satisfies KnowledgeBaseDetailResponse)
    } catch {
      return c.json({ error: t(locale, "knowledge_bases.load_failed") }, 500)
    }
  }
)

knowledgeBaseRoutes.delete(
  "/:id",
  requireOrganization,
  requirePermission({ knowledgeBase: ["delete"] }),
  validator("param", knowledgeBaseIdParamsSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id } = c.req.valid("param")

    try {
      const deleted = await db.transaction(async (tx) => {
        const [knowledgeBase] = await tx
          .delete(knowledgeBasesTable)
          .where(
            and(
              eq(knowledgeBasesTable.id, id),
              eq(knowledgeBasesTable.organizationId, organizationId)
            )
          )
          .returning({ id: knowledgeBasesTable.id })

        if (knowledgeBase) {
          await removeKnowledgeBaseFromDrafts(tx, id, organizationId)
        }

        return knowledgeBase
      })

      if (!deleted) {
        return c.json({ error: t(locale, "knowledge_bases.not_found") }, 404)
      }

      return c.json(deleted satisfies DeleteKnowledgeBaseResponse)
    } catch {
      return c.json({ error: t(locale, "knowledge_bases.delete_failed") }, 500)
    }
  }
)

knowledgeBaseRoutes.post(
  "/:id/documents",
  requireOrganization,
  requirePermission({ knowledgeBase: ["update"] }),
  validator("param", knowledgeBaseIdParamsSchema),
  bodyLimit({
    maxSize: KNOWLEDGE_DOCUMENT_MAX_BYTES + MULTIPART_OVERHEAD_BYTES,
    onError: (c) =>
      c.json(
        { error: t(c.get("locale"), "knowledge_bases.document_too_large") },
        413
      ),
  }),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id: knowledgeBaseId } = c.req.valid("param")

    if (!knowledgeEmbeddingsConfigured()) {
      return c.json(
        { error: t(locale, "knowledge_bases.embeddings_not_configured") },
        503
      )
    }

    const body = await c.req.parseBody()
    const file = body.file

    if (!(file instanceof File)) {
      return c.json(
        { error: t(locale, "knowledge_bases.document_required") },
        400
      )
    }

    const mimeType = mimeTypeFor(file.name)
    if (!mimeType) {
      return c.json(
        { error: t(locale, "knowledge_bases.document_type_invalid") },
        400
      )
    }

    if (file.size > KNOWLEDGE_DOCUMENT_MAX_BYTES) {
      return c.json(
        { error: t(locale, "knowledge_bases.document_too_large") },
        413
      )
    }

    const content = decodeDocument(await file.arrayBuffer())
    if (content === null) {
      return c.json(
        { error: t(locale, "knowledge_bases.document_encoding_invalid") },
        400
      )
    }

    if (!content.trim()) {
      return c.json({ error: t(locale, "knowledge_bases.document_empty") }, 400)
    }

    try {
      const knowledgeBase = await db.query.knowledgeBasesTable.findFirst({
        where: { id: knowledgeBaseId, organizationId },
        columns: { id: true },
      })

      if (!knowledgeBase) {
        return c.json({ error: t(locale, "knowledge_bases.not_found") }, 404)
      }

      const [document] = await db
        .insert(knowledgeDocumentsTable)
        .values({
          id: crypto.randomUUID(),
          knowledgeBaseId,
          organizationId,
          name: Array.from(file.name.replaceAll("\0", ""))
            .slice(0, MAX_DOCUMENT_NAME_LENGTH)
            .join(""),
          mimeType,
          content,
          status: "pending",
        })
        .returning(documentColumns())

      try {
        await enqueueKnowledgeDocument(document.id)
      } catch {
        await db
          .update(knowledgeDocumentsTable)
          .set({
            status: "failed",
            error: "processing_failed",
            updatedAt: new Date(),
          })
          .where(eq(knowledgeDocumentsTable.id, document.id))
        return c.json(
          { error: t(locale, "knowledge_bases.upload_failed") },
          500
        )
      }

      return c.json(document satisfies KnowledgeDocumentResponse, 201)
    } catch {
      return c.json({ error: t(locale, "knowledge_bases.upload_failed") }, 500)
    }
  }
)

knowledgeBaseRoutes.delete(
  "/:id/documents/:documentId",
  requireOrganization,
  requirePermission({ knowledgeBase: ["update"] }),
  validator("param", knowledgeDocumentParamsSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id: knowledgeBaseId, documentId } = c.req.valid("param")

    try {
      const [document] = await db
        .delete(knowledgeDocumentsTable)
        .where(
          and(
            eq(knowledgeDocumentsTable.id, documentId),
            eq(knowledgeDocumentsTable.knowledgeBaseId, knowledgeBaseId),
            eq(knowledgeDocumentsTable.organizationId, organizationId)
          )
        )
        .returning({ id: knowledgeDocumentsTable.id })

      if (!document) {
        return c.json(
          { error: t(locale, "knowledge_bases.document_not_found") },
          404
        )
      }

      return c.json(document satisfies DeleteKnowledgeDocumentResponse)
    } catch {
      return c.json(
        { error: t(locale, "knowledge_bases.delete_document_failed") },
        500
      )
    }
  }
)

knowledgeBaseRoutes.post(
  "/:id/documents/:documentId/reprocess",
  requireOrganization,
  requirePermission({ knowledgeBase: ["update"] }),
  validator("param", knowledgeDocumentParamsSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id: knowledgeBaseId, documentId } = c.req.valid("param")

    if (!knowledgeEmbeddingsConfigured()) {
      return c.json(
        { error: t(locale, "knowledge_bases.embeddings_not_configured") },
        503
      )
    }

    const ownedDocument = and(
      eq(knowledgeDocumentsTable.id, documentId),
      eq(knowledgeDocumentsTable.knowledgeBaseId, knowledgeBaseId),
      eq(knowledgeDocumentsTable.organizationId, organizationId)
    )

    try {
      const [document] = await db
        .update(knowledgeDocumentsTable)
        .set({ status: "pending", error: null, updatedAt: new Date() })
        .where(
          and(
            ownedDocument,
            inArray(knowledgeDocumentsTable.status, ["ready", "failed"])
          )
        )
        .returning(documentColumns())

      if (!document) {
        const [existing] = await db
          .select({ id: knowledgeDocumentsTable.id })
          .from(knowledgeDocumentsTable)
          .where(ownedDocument)

        return existing
          ? c.json(
              { error: t(locale, "knowledge_bases.document_in_progress") },
              409
            )
          : c.json(
              { error: t(locale, "knowledge_bases.document_not_found") },
              404
            )
      }

      try {
        await enqueueKnowledgeDocument(document.id)
      } catch {
        await db
          .update(knowledgeDocumentsTable)
          .set({
            status: "failed",
            error: "processing_failed",
            updatedAt: new Date(),
          })
          .where(eq(knowledgeDocumentsTable.id, document.id))
        return c.json(
          { error: t(locale, "knowledge_bases.reprocess_failed") },
          500
        )
      }

      return c.json(document satisfies KnowledgeDocumentResponse)
    } catch {
      return c.json(
        { error: t(locale, "knowledge_bases.reprocess_failed") },
        500
      )
    }
  }
)

knowledgeBaseRoutes.post(
  "/:id/search",
  requireOrganization,
  validator("param", knowledgeBaseIdParamsSchema),
  validator("json", testKnowledgeBaseSearchRequestSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id } = c.req.valid("param")
    const { query, limit } = c.req.valid("json")

    if (!knowledgeEmbeddingsConfigured()) {
      return c.json(
        { error: t(locale, "knowledge_bases.embeddings_not_configured") },
        503
      )
    }

    try {
      const knowledgeBase = await db.query.knowledgeBasesTable.findFirst({
        where: { id, organizationId },
        columns: { id: true },
      })

      if (!knowledgeBase) {
        return c.json({ error: t(locale, "knowledge_bases.not_found") }, 404)
      }

      const results = await searchKnowledge({
        organizationId,
        knowledgeBaseIds: [id],
        query,
        limit,
        timeoutMs: TEST_SEARCH_EMBEDDING_TIMEOUT_MS,
      })

      return c.json({ results } satisfies KnowledgeSearchResponse)
    } catch (error) {
      console.error("Knowledge base test search failed", error)
      return c.json(
        {
          error: t(
            locale,
            error instanceof EmbeddingsError &&
              error.code === "embeddings_dimension_mismatch"
              ? "knowledge_bases.embeddings_dimension_mismatch"
              : "knowledge_bases.search_failed"
          ),
        },
        500
      )
    }
  }
)
