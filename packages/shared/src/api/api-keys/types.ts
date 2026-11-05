import type { z } from "zod"

import type { createApiKeyRequestSchema } from "./schemas"

export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>

export type ApiKeyListItem = {
  id: string
  name: string
  prefix: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
  creator: { name: string } | null
}

export type ApiKeyListResponse = ApiKeyListItem[]

export type CreateApiKeyResponse = {
  key: string
  apiKey: Omit<ApiKeyListItem, "creator">
}

export type RevokeApiKeyResponse = {
  ok: true
}
