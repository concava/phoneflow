import type { z } from "zod"

import type {
  completeKnowledgeDocumentRequestSchema,
  createKnowledgeBaseRequestSchema,
  failKnowledgeDocumentRequestSchema,
  searchKnowledgeBasesRequestSchema,
  testKnowledgeBaseSearchRequestSchema,
} from "./schemas"

export type KnowledgeDocumentStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"

export type KnowledgeDocumentErrorCode = z.infer<
  typeof failKnowledgeDocumentRequestSchema
>["error"]

export type CreateKnowledgeBaseRequest = z.infer<
  typeof createKnowledgeBaseRequestSchema
>

export type TestKnowledgeBaseSearchRequest = z.input<
  typeof testKnowledgeBaseSearchRequestSchema
>

export type SearchKnowledgeBasesRequest = z.input<
  typeof searchKnowledgeBasesRequestSchema
>

export type CompleteKnowledgeDocumentRequest = z.infer<
  typeof completeKnowledgeDocumentRequestSchema
>

export type FailKnowledgeDocumentRequest = z.infer<
  typeof failKnowledgeDocumentRequestSchema
>

export type KnowledgeBaseResponse = {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export type KnowledgeBaseListItem = KnowledgeBaseResponse & {
  documentCount: number
}

export type KnowledgeBaseListResponse = KnowledgeBaseListItem[]

export type KnowledgeDocumentResponse = {
  id: string
  knowledgeBaseId: string
  name: string
  mimeType: string
  status: KnowledgeDocumentStatus
  error: KnowledgeDocumentErrorCode | null
  chunkCount: number
  createdAt: Date
  updatedAt: Date
}

export type KnowledgeBaseDetailResponse = KnowledgeBaseResponse & {
  documents: KnowledgeDocumentResponse[]
}

export type DeleteKnowledgeBaseResponse = {
  id: string
}

export type DeleteKnowledgeDocumentResponse = {
  id: string
}

export type KnowledgeSearchResult = {
  content: string
  score: number
  documentName: string
  knowledgeBaseId: string
}

export type KnowledgeSearchResponse = {
  results: KnowledgeSearchResult[]
}

export type StartKnowledgeDocumentResponse = {
  content: string | null
}

export type CompleteKnowledgeDocumentResponse = {
  chunkCount: number
}

export type FailKnowledgeDocumentResponse = {
  ok: true
}
