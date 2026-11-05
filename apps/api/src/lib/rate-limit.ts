import { createMiddleware } from "hono/factory"

import { t } from "@/lib/i18n"
import { connection } from "@/lib/redis"

const API_KEY_REQUESTS_PER_WINDOW = 60
const API_KEY_WINDOW_MS = 60_000
const REDIS_TIMEOUT_MS = 500

function withTimeout<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout>

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Redis timed out")),
      REDIS_TIMEOUT_MS
    )
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function consumeApiKeyRequest(apiKeyId: string) {
  // The shared client sets maxRetriesPerRequest: null for BullMQ, so a command
  // sent while Redis is down would wait forever instead of failing.
  if (connection.status !== "ready") {
    throw new Error("Redis unavailable")
  }

  const now = Date.now()
  const window = Math.floor(now / API_KEY_WINDOW_MS)
  const bucket = `rate-limit:api-key:${apiKeyId}:${window}`

  const results = await withTimeout(
    connection.multi().incr(bucket).pexpire(bucket, API_KEY_WINDOW_MS).exec()
  )
  const count = results?.[0]?.[1]

  if (results?.some(([error]) => error) || typeof count !== "number") {
    throw new Error("Redis rate limit command failed")
  }

  return {
    allowed: count <= API_KEY_REQUESTS_PER_WINDOW,
    retryAfterSeconds: Math.ceil(
      ((window + 1) * API_KEY_WINDOW_MS - now) / 1000
    ),
  }
}

export const apiKeyRateLimit = createMiddleware<{
  Variables: { apiKeyId: string }
}>(async (c, next) => {
  const locale = c.get("locale")
  let result: Awaited<ReturnType<typeof consumeApiKeyRequest>>

  try {
    result = await consumeApiKeyRequest(c.get("apiKeyId"))
  } catch {
    // Reads stay available during a Redis outage. Anything else can place
    // billable calls, so it must not run without the limiter.
    if (c.req.method === "GET") {
      await next()
      return
    }

    return c.json({ error: t(locale, "rate_limit.unavailable") }, 503)
  }

  if (!result.allowed) {
    c.header("Retry-After", String(result.retryAfterSeconds))
    return c.json({ error: t(locale, "rate_limit.exceeded") }, 429)
  }

  await next()
})
