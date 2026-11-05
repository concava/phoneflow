import type { z } from "zod"

import type {
  CallChannel,
  CallDirection,
  CallStatus,
  CallTranscript,
  CallVariableValues,
} from "@workspace/shared/api/calls/types"
import type {
  createWebhookRequestSchema,
  recordWebhookAttemptRequestSchema,
  updateWebhookRequestSchema,
  webhookEventTypeSchema,
} from "./schemas"

export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>

export type WebhookDeliveryEventType = WebhookEventType | "webhook.test"

export type WebhookDeliveryStatus = "pending" | "succeeded" | "failed"

export type WebhookDeliveryErrorCode =
  | "blocked_address"
  | "endpoint_disabled"
  | "http_status"
  | "https_required"
  | "invalid_url"
  | "network_error"
  | "queue_unavailable"
  | "redirect_not_followed"
  | "timeout"

export type WebhookCallData = {
  callId: string
  agentId: string
  agentVersionId: string | null
  agentVersion: number | null
  batchCallId: string | null
  direction: CallDirection
  channel: CallChannel
  status: CallStatus
  from: string | null
  to: string | null
  startedAt: string
  endedAt: string | null
  durationMs: number | null
  totalCost: string | null
}

export type WebhookCallCompletedData = WebhookCallData & {
  transcript: CallTranscript | null
  variables: CallVariableValues | null
}

export type WebhookTestData = {
  endpointId: string
}

export type WebhookPayload = {
  id: string
  type: WebhookDeliveryEventType
  createdAt: string
  organizationId: string
  data: WebhookCallData | WebhookCallCompletedData | WebhookTestData
}

export type CreateWebhookRequest = z.infer<typeof createWebhookRequestSchema>

export type UpdateWebhookRequest = z.infer<typeof updateWebhookRequestSchema>

export type RecordWebhookAttemptRequest = z.infer<
  typeof recordWebhookAttemptRequestSchema
>

export type WebhookEndpointResponse = {
  id: string
  url: string
  secret: string
  events: WebhookEventType[]
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

export type WebhookEndpointListResponse = WebhookEndpointResponse[]

export type DeleteWebhookResponse = {
  ok: true
}

export type SendWebhookTestResponse = {
  deliveryId: string
}

export type RetryWebhookDeliveryResponse = {
  ok: true
}

export type WebhookDeliveryListItem = {
  id: string
  endpointId: string
  eventType: WebhookDeliveryEventType
  status: WebhookDeliveryStatus
  attempts: number
  lastStatusCode: number | null
  lastError: string | null
  deliveredAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type WebhookDeliveryListResponse = {
  items: WebhookDeliveryListItem[]
  total: number
  page: number
  pageSize: number
}

export type WebhookJobDelivery = {
  id: string
  eventType: WebhookDeliveryEventType
  status: WebhookDeliveryStatus
  payload: WebhookPayload
  url: string
  secret: string
  endpointEnabled: boolean
  restrictNetwork: boolean
}

export type WebhookJobDeliveryResponse = {
  delivery: WebhookJobDelivery | null
}

export type RecordWebhookAttemptResponse = {
  ok: true
}
