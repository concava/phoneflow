import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from "@workspace/shared/api/knowledge-bases/schemas"

export type EmbeddingsConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

export type EmbeddingsErrorCode =
  | "embeddings_not_configured"
  | "embeddings_dimension_mismatch"
  | "embeddings_request_failed"

export class EmbeddingsError extends Error {
  constructor(
    readonly code: EmbeddingsErrorCode,
    message: string,
    readonly retryable = false
  ) {
    super(message)
    this.name = "EmbeddingsError"
  }
}

// The API key stays optional because local OpenAI-compatible servers run without one.
export function embeddingsConfigured(config: EmbeddingsConfig) {
  return Boolean(config.baseUrl && config.model)
}

export async function createEmbeddings(
  config: EmbeddingsConfig,
  input: string[],
  signal?: AbortSignal
) {
  if (!embeddingsConfigured(config)) {
    throw new EmbeddingsError(
      "embeddings_not_configured",
      "EMBEDDINGS_BASE_URL and EMBEDDINGS_MODEL are required"
    )
  }

  const response = await fetch(
    `${config.baseUrl.replace(/\/+$/, "")}/embeddings`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
      },
      body: JSON.stringify({ model: config.model, input }),
      signal,
    }
  )

  if (!response.ok) {
    throw new EmbeddingsError(
      "embeddings_request_failed",
      `Embeddings request failed with status ${response.status}`,
      response.status === 429 || response.status >= 500
    )
  }

  const body = (await response.json()) as {
    data?: { index?: number; embedding?: unknown }[]
  }
  const data = body.data ?? []

  if (data.length !== input.length) {
    throw new EmbeddingsError(
      "embeddings_request_failed",
      `Embeddings response has ${data.length} vectors for ${input.length} inputs`
    )
  }

  return [...data]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(({ embedding }) => {
      const length = Array.isArray(embedding) ? embedding.length : 0
      if (length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
        throw new EmbeddingsError(
          "embeddings_dimension_mismatch",
          `Embeddings model returned ${length} dimensions, expected ${KNOWLEDGE_EMBEDDING_DIMENSIONS}`
        )
      }
      return embedding as number[]
    })
}
