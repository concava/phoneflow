import type {
  CompleteKnowledgeDocumentRequest,
  CompleteKnowledgeDocumentResponse,
  FailKnowledgeDocumentRequest,
  FailKnowledgeDocumentResponse,
  KnowledgeDocumentErrorCode,
  StartKnowledgeDocumentResponse,
} from "@workspace/shared/api/knowledge-bases/types"
import type { ProcessKnowledgeDocumentPayload } from "@workspace/shared/jobs/knowledge/types"
import {
  createEmbeddings,
  EmbeddingsError,
} from "@workspace/shared/knowledge/embeddings"
import { api } from "@/lib/api"
import { env } from "@/lib/env"
import { chunkText } from "../chunker"

const EMBEDDING_BATCH_SIZE = 64
const EMBEDDING_TIMEOUT_MS = 60_000
const EMBEDDING_MAX_ATTEMPTS = 3
const EMBEDDING_RETRY_DELAY_MS = 1000

const embeddingsConfig = {
  baseUrl: env.EMBEDDINGS_BASE_URL,
  apiKey: env.EMBEDDINGS_API_KEY,
  model: env.EMBEDDINGS_MODEL,
}

class EmptyDocumentError extends Error {}

// pgvector stores float4, so packing into float32 loses nothing. It keeps the request to
// the API about four times smaller than JSON numbers: a 2 MB document has ~3000 vectors.
function encodeEmbedding(embedding: number[]) {
  const buffer = Buffer.alloc(embedding.length * 4)
  embedding.forEach((value, index) => {
    buffer.writeFloatLE(value, index * 4)
  })
  return buffer.toString("base64")
}

async function embedBatch(batch: string[]) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await createEmbeddings(
        embeddingsConfig,
        batch,
        AbortSignal.timeout(EMBEDDING_TIMEOUT_MS)
      )
    } catch (error) {
      const retryable =
        error instanceof EmbeddingsError ? error.retryable : true
      if (!retryable || attempt === EMBEDDING_MAX_ATTEMPTS) {
        throw error
      }
      await new Promise((resolve) =>
        setTimeout(resolve, EMBEDDING_RETRY_DELAY_MS * 2 ** (attempt - 1))
      )
    }
  }
}

export async function processKnowledgeDocument(
  payload: ProcessKnowledgeDocumentPayload
) {
  const { documentId } = payload
  const { content } = await api.post<StartKnowledgeDocumentResponse, never>(
    `/knowledge-bases/documents/${documentId}/start`,
    {}
  )

  // The document was deleted after the job was queued.
  if (content === null) {
    return { documentId, chunkCount: 0 }
  }

  const texts = chunkText(content)
  if (texts.length === 0) {
    throw new EmptyDocumentError(`Document ${documentId} has no text`)
  }

  const chunks: CompleteKnowledgeDocumentRequest["chunks"] = []
  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE)
    const embeddings = await embedBatch(batch)
    batch.forEach((text, index) => {
      chunks.push({
        content: text,
        embedding: encodeEmbedding(embeddings[index]),
      })
    })
  }

  const { chunkCount } = await api.post<
    CompleteKnowledgeDocumentResponse,
    CompleteKnowledgeDocumentRequest
  >(`/knowledge-bases/documents/${documentId}/complete`, { body: { chunks } })

  return { documentId, chunkCount }
}

function errorCodeFor(error: Error): KnowledgeDocumentErrorCode {
  if (error instanceof EmbeddingsError) {
    return error.code
  }
  return error instanceof EmptyDocumentError
    ? "no_content"
    : "processing_failed"
}

export async function failKnowledgeDocument(documentId: string, error: Error) {
  console.error(`[knowledge] document ${documentId} failed:`, error)

  await api.post<FailKnowledgeDocumentResponse, FailKnowledgeDocumentRequest>(
    `/knowledge-bases/documents/${documentId}/fail`,
    { body: { error: errorCodeFor(error) } }
  )
}
