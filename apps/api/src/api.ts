import { httpInstrumentationMiddleware } from "@hono/otel"
import { Hono } from "hono"
import { except } from "hono/combine"
import { cors } from "hono/cors"

import { auth } from "@/lib/auth/config"
import { env } from "@/lib/env"
import { localeMiddleware } from "@/lib/i18n"
import { agentRoutes } from "@/routes/agents"
import { apiKeyRoutes } from "@/routes/api-keys"
import { batchCallRoutes } from "@/routes/batch-calls"
import { billingRoutes } from "@/routes/billing"
import { callRoutes } from "@/routes/calls"
import { contactRoutes } from "@/routes/contacts"
import { phoneNumberRoutes } from "@/routes/phone-numbers"
import { ssoRoutes } from "@/routes/sso"
import { tokenRoutes } from "@/routes/token"
import { userRoutes } from "@/routes/user"
import { v1Routes } from "@/routes/v1"

const api = new Hono()

api.use(
  "*",
  httpInstrumentationMiddleware({
    serviceName: "api",
    getUrlFull: (c) => {
      const url = new URL(c.req.url)
      return `${url.origin}${url.pathname}`
    },
  })
)

// The public API is server-to-server: no browser origin gets access to it.
api.use(
  "*",
  except(
    "/api/v1/*",
    cors({
      origin: [env.FRONTEND_URL],
      credentials: true,
    })
  )
)

api.use("*", localeMiddleware)

api.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw)
})

api.route("/api/agents", agentRoutes)
api.route("/api/api-keys", apiKeyRoutes)
api.route("/api/batch-calls", batchCallRoutes)
api.route("/api/calls", callRoutes)
api.route("/api/contacts", contactRoutes)
api.route("/api/phone-numbers", phoneNumberRoutes)
api.route("/api/sso", ssoRoutes)
api.route("/api/token", tokenRoutes)
api.route("/api/user", userRoutes)
api.route("/api/v1", v1Routes)
if (env.IS_CLOUD) {
  api.route("/api/billing", billingRoutes)
}

export default api
