import { z } from "zod"

export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536
export const KNOWLEDGE_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024
export const KNOWLEDGE_DOCUMENT_MIME_TYPES = {
  ".txt": "text/plain",
  ".md": "text/markdown",
} as const

export const KNOWLEDGE_SEARCH_DEFAULT_LIMIT = 5
const KNOWLEDGE_SEARCH_MAX_LIMIT = 10
const KNOWLEDGE_SEARCH_MAX_QUERY_LENGTH = 1000

// 1536 float32 values are 6144 bytes, which is exactly 8192 base64 characters.
const ENCODED_EMBEDDING_LENGTH = (KNOWLEDGE_EMBEDDING_DIMENSIONS * 4 * 4) / 3

const queryText = z
  .string()
  .trim()
  .min(1, "schemas.knowledge_bases.query.required")
  .max(KNOWLEDGE_SEARCH_MAX_QUERY_LENGTH, "schemas.knowledge_bases.query.max")

const searchLimit = z
  .number()
  .int()
  .min(1)
  .max(KNOWLEDGE_SEARCH_MAX_LIMIT)
  .default(KNOWLEDGE_SEARCH_DEFAULT_LIMIT)

export const knowledgeBaseIdParamsSchema = z.object({
  id: z.uuid(),
})

export const knowledgeDocumentParamsSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
})

export const internalKnowledgeDocumentParamsSchema = z.object({
  documentId: z.uuid(),
})

export const createKnowledgeBaseRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "schemas.knowledge_bases.name.required")
      .max(255, "schemas.knowledge_bases.name.max"),
  })
  .strict()

export const testKnowledgeBaseSearchRequestSchema = z
  .object({
    query: queryText,
    limit: searchLimit,
  })
  .strict()

export const searchKnowledgeBasesRequestSchema = z
  .object({
    callId: z.uuid(),
    knowledgeBaseIds: z.array(z.uuid()).min(1),
    query: queryText,
    limit: searchLimit,
  })
  .strict()

export const completeKnowledgeDocumentRequestSchema = z
  .object({
    chunks: z
      .array(
        z
          .object({
            content: z.string().min(1),
            embedding: z.string().length(ENCODED_EMBEDDING_LENGTH),
          })
          .strict()
      )
      .min(1),
  })
  .strict()

export const failKnowledgeDocumentRequestSchema = z
  .object({
    error: z.enum([
      "embeddings_not_configured",
      "embeddings_dimension_mismatch",
      "embeddings_request_failed",
      "no_content",
      "processing_failed",
    ]),
  })
  .strict()
