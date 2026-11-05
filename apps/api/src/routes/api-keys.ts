import { and, eq, isNull } from "drizzle-orm"
import { Hono } from "hono"

import { db } from "@workspace/db/client"
import { apiKeysTable } from "@workspace/db/schema/api-keys"
import {
  apiKeyIdParamsSchema,
  createApiKeyRequestSchema,
} from "@workspace/shared/api/api-keys/schemas"
import type {
  ApiKeyListResponse,
  CreateApiKeyResponse,
  RevokeApiKeyResponse,
} from "@workspace/shared/api/api-keys/types"
import { generateApiKey } from "@/lib/auth/api-key"
import { requireOrganization } from "@/lib/auth/organization"
import { requirePermission } from "@/lib/auth/permissions"
import { requireSession } from "@/lib/auth/session"
import { t } from "@/lib/i18n"
import { validator } from "@/lib/validator"

export const apiKeyRoutes = new Hono()

const apiKeyColumns = {
  id: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} as const

apiKeyRoutes.get(
  "/",
  requireOrganization,
  requirePermission({ apiKey: ["read"] }),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")

    try {
      const apiKeys = await db.query.apiKeysTable.findMany({
        where: {
          organizationId,
        },
        columns: apiKeyColumns,
        with: {
          creator: {
            columns: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return c.json(apiKeys satisfies ApiKeyListResponse)
    } catch {
      return c.json({ error: t(locale, "api_keys.list_failed") }, 500)
    }
  }
)

apiKeyRoutes.post(
  "/",
  requireSession,
  requireOrganization,
  requirePermission({ apiKey: ["create"] }),
  validator("json", createApiKeyRequestSchema),
  async (c) => {
    const locale = c.get("locale")
    const payload = c.req.valid("json")

    try {
      const { key, keyHash, prefix } = generateApiKey()

      const [apiKey] = await db
        .insert(apiKeysTable)
        .values({
          id: crypto.randomUUID(),
          organizationId: c.get("organizationId"),
          name: payload.name,
          keyHash,
          prefix,
          createdBy: c.get("userId"),
          expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
        })
        .returning({
          id: apiKeysTable.id,
          name: apiKeysTable.name,
          prefix: apiKeysTable.prefix,
          lastUsedAt: apiKeysTable.lastUsedAt,
          expiresAt: apiKeysTable.expiresAt,
          revokedAt: apiKeysTable.revokedAt,
          createdAt: apiKeysTable.createdAt,
        })

      c.header("Cache-Control", "no-store")

      return c.json({ key, apiKey } satisfies CreateApiKeyResponse, 201)
    } catch {
      return c.json({ error: t(locale, "api_keys.create_failed") }, 500)
    }
  }
)

apiKeyRoutes.delete(
  "/:id",
  requireOrganization,
  requirePermission({ apiKey: ["revoke"] }),
  validator("param", apiKeyIdParamsSchema),
  async (c) => {
    const locale = c.get("locale")
    const { id } = c.req.valid("param")

    try {
      const now = new Date()
      const [revoked] = await db
        .update(apiKeysTable)
        .set({ revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(apiKeysTable.id, id),
            eq(apiKeysTable.organizationId, c.get("organizationId")),
            isNull(apiKeysTable.revokedAt)
          )
        )
        .returning({ id: apiKeysTable.id })

      if (!revoked) {
        return c.json({ error: t(locale, "api_keys.not_found") }, 404)
      }

      return c.json({ ok: true } satisfies RevokeApiKeyResponse)
    } catch {
      return c.json({ error: t(locale, "api_keys.revoke_failed") }, 500)
    }
  }
)
