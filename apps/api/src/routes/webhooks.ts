import { and, count, eq, sql } from "drizzle-orm"
import { Hono } from "hono"

import { db } from "@workspace/db/client"
import {
  webhookDeliveriesTable,
  webhookEndpointsTable,
} from "@workspace/db/schema/webhooks"
import {
  createWebhookRequestSchema,
  recordWebhookAttemptRequestSchema,
  updateWebhookRequestSchema,
  webhookDeliveryListQuerySchema,
  webhookDeliveryParamsSchema,
  webhookIdParamsSchema,
  webhookJobDeliveryParamsSchema,
} from "@workspace/shared/api/webhooks/schemas"
import type {
  DeleteWebhookResponse,
  RecordWebhookAttemptResponse,
  RetryWebhookDeliveryResponse,
  SendWebhookTestResponse,
  WebhookDeliveryListResponse,
  WebhookEndpointListResponse,
  WebhookEndpointResponse,
  WebhookJobDeliveryResponse,
} from "@workspace/shared/api/webhooks/types"
import { requireOrganization } from "@/lib/auth/organization"
import { requirePermission } from "@/lib/auth/permissions"
import { requireAuthToken } from "@/lib/auth/token"
import { env } from "@/lib/env"
import { t } from "@/lib/i18n"
import { validator } from "@/lib/validator"
import {
  createWebhookDeliveries,
  enqueueWebhookDeliveries,
  generateWebhookSecret,
  maskWebhookSecret,
} from "@/lib/webhooks"

export const webhookRoutes = new Hono()

function isAllowedUrl(url: string) {
  return !env.IS_CLOUD || new URL(url).protocol === "https:"
}

function toEndpointResponse(
  endpoint: typeof webhookEndpointsTable.$inferSelect,
  secret: string
): WebhookEndpointResponse {
  return {
    id: endpoint.id,
    url: endpoint.url,
    secret,
    events: endpoint.events,
    enabled: endpoint.enabled,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  }
}

webhookRoutes.get(
  "/internal/deliveries/:deliveryId",
  requireAuthToken,
  validator("param", webhookJobDeliveryParamsSchema),
  async (c) => {
    const { deliveryId } = c.req.valid("param")

    try {
      const delivery = await db.query.webhookDeliveriesTable.findFirst({
        where: { id: deliveryId },
        columns: {
          id: true,
          eventType: true,
          status: true,
          payload: true,
        },
        with: {
          endpoint: {
            columns: {
              url: true,
              secret: true,
              enabled: true,
            },
          },
        },
      })

      if (!delivery?.endpoint) {
        return c.json({ delivery: null } satisfies WebhookJobDeliveryResponse)
      }

      return c.json({
        delivery: {
          id: delivery.id,
          eventType: delivery.eventType,
          status: delivery.status,
          payload: delivery.payload,
          url: delivery.endpoint.url,
          secret: delivery.endpoint.secret,
          endpointEnabled: delivery.endpoint.enabled,
          restrictNetwork: env.IS_CLOUD,
        },
      } satisfies WebhookJobDeliveryResponse)
    } catch {
      return c.json({ error: "Failed to load webhook delivery" }, 500)
    }
  }
)

webhookRoutes.post(
  "/internal/deliveries/:deliveryId/attempts",
  requireAuthToken,
  validator("param", webhookJobDeliveryParamsSchema),
  validator("json", recordWebhookAttemptRequestSchema),
  async (c) => {
    const { deliveryId } = c.req.valid("param")
    const payload = c.req.valid("json")

    try {
      const now = new Date()

      await db
        .update(webhookDeliveriesTable)
        .set({
          status: payload.outcome === "retrying" ? "pending" : payload.outcome,
          attempts: sql`${webhookDeliveriesTable.attempts} + 1`,
          lastStatusCode: payload.statusCode,
          lastError: payload.error,
          deliveredAt: payload.outcome === "succeeded" ? now : null,
          updatedAt: now,
        })
        .where(eq(webhookDeliveriesTable.id, deliveryId))

      return c.json({ ok: true } satisfies RecordWebhookAttemptResponse)
    } catch {
      return c.json({ error: "Failed to record webhook attempt" }, 500)
    }
  }
)

webhookRoutes.get(
  "/",
  requireOrganization,
  requirePermission({ webhook: ["read"] }),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")

    try {
      const endpoints = await db.query.webhookEndpointsTable.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      })

      return c.json(
        endpoints.map((endpoint) =>
          toEndpointResponse(endpoint, maskWebhookSecret(endpoint.secret))
        ) satisfies WebhookEndpointListResponse
      )
    } catch {
      return c.json({ error: t(locale, "webhooks.list_failed") }, 500)
    }
  }
)

webhookRoutes.post(
  "/",
  requireOrganization,
  requirePermission({ webhook: ["create"] }),
  validator("json", createWebhookRequestSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const payload = c.req.valid("json")

    if (!isAllowedUrl(payload.url)) {
      return c.json({ error: t(locale, "webhooks.https_required") }, 400)
    }

    try {
      const secret = generateWebhookSecret()
      const [endpoint] = await db
        .insert(webhookEndpointsTable)
        .values({
          id: crypto.randomUUID(),
          organizationId,
          url: payload.url,
          secret,
          events: payload.events,
          enabled: payload.enabled ?? true,
        })
        .returning()

      return c.json(
        toEndpointResponse(endpoint, secret) satisfies WebhookEndpointResponse,
        201
      )
    } catch {
      return c.json({ error: t(locale, "webhooks.create_failed") }, 500)
    }
  }
)

webhookRoutes.get(
  "/:id",
  requireOrganization,
  requirePermission({ webhook: ["read"] }),
  validator("param", webhookIdParamsSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id } = c.req.valid("param")

    try {
      const endpoint = await db.query.webhookEndpointsTable.findFirst({
        where: { id, organizationId },
      })

      if (!endpoint) {
        return c.json({ error: t(locale, "webhooks.not_found") }, 404)
      }

      return c.json(
        toEndpointResponse(
          endpoint,
          maskWebhookSecret(endpoint.secret)
        ) satisfies WebhookEndpointResponse
      )
    } catch {
      return c.json({ error: t(locale, "webhooks.load_failed") }, 500)
    }
  }
)

webhookRoutes.patch(
  "/:id",
  requireOrganization,
  requirePermission({ webhook: ["update"] }),
  validator("param", webhookIdParamsSchema),
  validator("json", updateWebhookRequestSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id } = c.req.valid("param")
    const payload = c.req.valid("json")

    if (payload.url && !isAllowedUrl(payload.url)) {
      return c.json({ error: t(locale, "webhooks.https_required") }, 400)
    }

    try {
      const [endpoint] = await db
        .update(webhookEndpointsTable)
        .set({
          ...(payload.url !== undefined ? { url: payload.url } : {}),
          ...(payload.events !== undefined ? { events: payload.events } : {}),
          ...(payload.enabled !== undefined
            ? { enabled: payload.enabled }
            : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(webhookEndpointsTable.id, id),
            eq(webhookEndpointsTable.organizationId, organizationId)
          )
        )
        .returning()

      if (!endpoint) {
        return c.json({ error: t(locale, "webhooks.not_found") }, 404)
      }

      return c.json(
        toEndpointResponse(
          endpoint,
          maskWebhookSecret(endpoint.secret)
        ) satisfies WebhookEndpointResponse
      )
    } catch {
      return c.json({ error: t(locale, "webhooks.update_failed") }, 500)
    }
  }
)

webhookRoutes.delete(
  "/:id",
  requireOrganization,
  requirePermission({ webhook: ["delete"] }),
  validator("param", webhookIdParamsSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id } = c.req.valid("param")

    try {
      const [endpoint] = await db
        .delete(webhookEndpointsTable)
        .where(
          and(
            eq(webhookEndpointsTable.id, id),
            eq(webhookEndpointsTable.organizationId, organizationId)
          )
        )
        .returning({ id: webhookEndpointsTable.id })

      if (!endpoint) {
        return c.json({ error: t(locale, "webhooks.not_found") }, 404)
      }

      return c.json({ ok: true } satisfies DeleteWebhookResponse)
    } catch {
      return c.json({ error: t(locale, "webhooks.delete_failed") }, 500)
    }
  }
)

webhookRoutes.post(
  "/:id/rotate-secret",
  requireOrganization,
  requirePermission({ webhook: ["update"] }),
  validator("param", webhookIdParamsSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id } = c.req.valid("param")

    try {
      const secret = generateWebhookSecret()
      const [endpoint] = await db
        .update(webhookEndpointsTable)
        .set({ secret, updatedAt: new Date() })
        .where(
          and(
            eq(webhookEndpointsTable.id, id),
            eq(webhookEndpointsTable.organizationId, organizationId)
          )
        )
        .returning()

      if (!endpoint) {
        return c.json({ error: t(locale, "webhooks.not_found") }, 404)
      }

      return c.json(
        toEndpointResponse(endpoint, secret) satisfies WebhookEndpointResponse
      )
    } catch {
      return c.json({ error: t(locale, "webhooks.rotate_failed") }, 500)
    }
  }
)

webhookRoutes.post(
  "/:id/test",
  requireOrganization,
  requirePermission({ webhook: ["update"] }),
  validator("param", webhookIdParamsSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id } = c.req.valid("param")

    try {
      const endpoint = await db.query.webhookEndpointsTable.findFirst({
        where: { id, organizationId },
        columns: { id: true },
      })

      if (!endpoint) {
        return c.json({ error: t(locale, "webhooks.not_found") }, 404)
      }

      const [deliveryId] = await createWebhookDeliveries(
        organizationId,
        [endpoint.id],
        "webhook.test",
        { endpointId: endpoint.id }
      )

      await enqueueWebhookDeliveries([deliveryId], "webhook.test")

      return c.json({ deliveryId } satisfies SendWebhookTestResponse, 201)
    } catch {
      return c.json({ error: t(locale, "webhooks.test_failed") }, 500)
    }
  }
)

webhookRoutes.get(
  "/:id/deliveries",
  requireOrganization,
  requirePermission({ webhook: ["read"] }),
  validator("param", webhookIdParamsSchema),
  validator("query", webhookDeliveryListQuerySchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id } = c.req.valid("param")
    const query = c.req.valid("query")

    try {
      const endpoint = await db.query.webhookEndpointsTable.findFirst({
        where: { id, organizationId },
        columns: { id: true },
      })

      if (!endpoint) {
        return c.json({ error: t(locale, "webhooks.not_found") }, 404)
      }

      const [{ total }] = await db
        .select({ total: count() })
        .from(webhookDeliveriesTable)
        .where(
          and(
            eq(webhookDeliveriesTable.endpointId, id),
            eq(webhookDeliveriesTable.organizationId, organizationId)
          )
        )

      const items = await db.query.webhookDeliveriesTable.findMany({
        where: { endpointId: id, organizationId },
        columns: {
          id: true,
          endpointId: true,
          eventType: true,
          status: true,
          attempts: true,
          lastStatusCode: true,
          lastError: true,
          deliveredAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      })

      return c.json({
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
      } satisfies WebhookDeliveryListResponse)
    } catch {
      return c.json({ error: t(locale, "webhooks.deliveries_failed") }, 500)
    }
  }
)

webhookRoutes.post(
  "/:id/deliveries/:deliveryId/retry",
  requireOrganization,
  requirePermission({ webhook: ["update"] }),
  validator("param", webhookDeliveryParamsSchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const { id, deliveryId } = c.req.valid("param")

    try {
      const delivery = await db.query.webhookDeliveriesTable.findFirst({
        where: { id: deliveryId, endpointId: id, organizationId },
        columns: { eventType: true },
      })

      if (!delivery) {
        return c.json({ error: t(locale, "webhooks.delivery_not_found") }, 404)
      }

      const [claimed] = await db
        .update(webhookDeliveriesTable)
        .set({
          status: "pending",
          lastStatusCode: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(webhookDeliveriesTable.id, deliveryId),
            eq(webhookDeliveriesTable.organizationId, organizationId),
            eq(webhookDeliveriesTable.status, "failed")
          )
        )
        .returning({ id: webhookDeliveriesTable.id })

      if (!claimed) {
        return c.json({ error: t(locale, "webhooks.delivery_not_failed") }, 409)
      }

      await enqueueWebhookDeliveries([deliveryId], delivery.eventType)

      return c.json({ ok: true } satisfies RetryWebhookDeliveryResponse)
    } catch {
      return c.json({ error: t(locale, "webhooks.retry_failed") }, 500)
    }
  }
)
