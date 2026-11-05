import { z } from "zod"

export const webhookEventTypes = [
  "call.started",
  "call.completed",
  "call.no_answer",
] as const

export const webhookEventTypeSchema = z.enum(webhookEventTypes)

const webhookUrlSchema = z
  .string()
  .trim()
  .max(2048, "schemas.webhooks.webhook_request.url.max")
  .pipe(
    z.url({
      protocol: /^https?$/,
      message: "schemas.webhooks.webhook_request.url.invalid",
    })
  )
  .refine(
    (url) => {
      if (!URL.canParse(url)) {
        return true
      }
      const { username, password } = new URL(url)
      return !username && !password
    },
    { message: "schemas.webhooks.webhook_request.url.credentials" }
  )

const webhookEventsSchema = z
  .array(webhookEventTypeSchema)
  .min(1, "schemas.webhooks.webhook_request.events.min")
  .max(webhookEventTypes.length)

export const webhookIdParamsSchema = z.object({
  id: z.uuid(),
})

export const webhookDeliveryParamsSchema = z.object({
  id: z.uuid(),
  deliveryId: z.uuid(),
})

export const webhookJobDeliveryParamsSchema = z.object({
  deliveryId: z.uuid(),
})

export const createWebhookRequestSchema = z
  .object({
    url: webhookUrlSchema,
    events: webhookEventsSchema,
    enabled: z.boolean().optional(),
  })
  .strict()

export const updateWebhookRequestSchema = z
  .object({
    url: webhookUrlSchema.optional(),
    events: webhookEventsSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()

export const webhookDeliveryListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()

export const recordWebhookAttemptRequestSchema = z
  .object({
    outcome: z.enum(["succeeded", "retrying", "failed"]),
    statusCode: z.number().int().nullable(),
    error: z.string().max(255).nullable(),
  })
  .strict()
