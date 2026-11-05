import { createHash, randomBytes } from "node:crypto"
import { and, eq, isNull, lt, or } from "drizzle-orm"
import { createMiddleware } from "hono/factory"

import { db } from "@workspace/db/client"
import { apiKeysTable } from "@workspace/db/schema/api-keys"
import { t } from "@/lib/i18n"

const LAST_USED_RESOLUTION_MS = 60_000
const BEARER_API_KEY = /^Bearer (pf_[A-Za-z0-9_-]{43})$/

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex")
}

export function generateApiKey() {
  const key = `pf_${randomBytes(32).toString("base64url")}`

  return {
    key,
    keyHash: hashApiKey(key),
    prefix: key.slice(0, 11),
  }
}

async function touchLastUsed(id: string, lastUsedAt: Date | null) {
  const now = Date.now()

  if (lastUsedAt && now - lastUsedAt.getTime() < LAST_USED_RESOLUTION_MS) {
    return
  }

  try {
    await db
      .update(apiKeysTable)
      .set({ lastUsedAt: new Date(now) })
      .where(
        and(
          eq(apiKeysTable.id, id),
          or(
            isNull(apiKeysTable.lastUsedAt),
            lt(apiKeysTable.lastUsedAt, new Date(now - LAST_USED_RESOLUTION_MS))
          )
        )
      )
  } catch {
    // Usage metadata must not turn a valid request into a failure
  }
}

function findApiKey(key: string) {
  return db.query.apiKeysTable.findFirst({
    where: {
      keyHash: hashApiKey(key),
    },
    columns: {
      id: true,
      organizationId: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  })
}

export const requireApiKey = createMiddleware<{
  Variables: { organizationId: string; apiKeyId: string }
}>(async (c, next) => {
  const locale = c.get("locale")
  const key = c.req.header("Authorization")?.match(BEARER_API_KEY)?.[1]

  if (!key) {
    return c.json({ error: t(locale, "auth.unauthorized") }, 401)
  }

  let apiKey: Awaited<ReturnType<typeof findApiKey>>

  try {
    apiKey = await findApiKey(key)
  } catch {
    return c.json({ error: t(locale, "api_keys.verify_failed") }, 500)
  }

  if (
    !apiKey ||
    apiKey.revokedAt ||
    (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now())
  ) {
    return c.json({ error: t(locale, "auth.unauthorized") }, 401)
  }

  await touchLastUsed(apiKey.id, apiKey.lastUsedAt)

  c.set("organizationId", apiKey.organizationId)
  c.set("apiKeyId", apiKey.id)

  await next()
})
