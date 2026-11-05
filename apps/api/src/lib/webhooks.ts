import { randomBytes } from "node:crypto"
import { inArray } from "drizzle-orm"

import { db } from "@workspace/db/client"
import type { callsTable } from "@workspace/db/schema/calls"
import { webhookDeliveriesTable } from "@workspace/db/schema/webhooks"
import type {
  WebhookCallData,
  WebhookDeliveryErrorCode,
  WebhookDeliveryEventType,
  WebhookEventType,
  WebhookPayload,
} from "@workspace/shared/api/webhooks/types"
import type { DeliverWebhookPayload } from "@workspace/shared/jobs/webhooks/types"
import { webhooksQueue } from "@/lib/queues"

type Call = typeof callsTable.$inferSelect

const retryingJobOptions = {
  attempts: 6,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
}

const singleAttemptJobOptions = {
  attempts: 1,
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
}

export function generateWebhookSecret() {
  return `whsec_${randomBytes(32).toString("base64url")}`
}

export function maskWebhookSecret(secret: string) {
  return `whsec_••••${secret.slice(-4)}`
}

export function jobOptionsForEvent(eventType: WebhookDeliveryEventType) {
  return eventType === "webhook.test"
    ? singleAttemptJobOptions
    : retryingJobOptions
}

export async function enqueueWebhookDeliveries(
  deliveryIds: string[],
  eventType: WebhookDeliveryEventType
) {
  try {
    await webhooksQueue.addBulk(
      deliveryIds.map((deliveryId) => ({
        name: "deliver-webhook",
        data: { deliveryId } satisfies DeliverWebhookPayload,
        opts: jobOptionsForEvent(eventType),
      }))
    )
  } catch (error) {
    await db
      .update(webhookDeliveriesTable)
      .set({
        status: "failed",
        lastError: "queue_unavailable" satisfies WebhookDeliveryErrorCode,
        updatedAt: new Date(),
      })
      .where(inArray(webhookDeliveriesTable.id, deliveryIds))
    throw error
  }
}

export async function createWebhookDeliveries(
  organizationId: string,
  endpointIds: string[],
  eventType: WebhookDeliveryEventType,
  data: WebhookPayload["data"]
) {
  const payload: WebhookPayload = {
    id: crypto.randomUUID(),
    type: eventType,
    createdAt: new Date().toISOString(),
    organizationId,
    data,
  }

  const deliveries = endpointIds.map((endpointId) => ({
    id: crypto.randomUUID(),
    endpointId,
    organizationId,
    eventType,
    payload,
  }))

  await db.insert(webhookDeliveriesTable).values(deliveries)

  return deliveries.map((delivery) => delivery.id)
}

async function buildCallData(
  type: WebhookEventType,
  call: Call
): Promise<WebhookPayload["data"]> {
  const agentVersion = call.agentVersionId
    ? await db.query.agentVersionsTable.findFirst({
        where: { id: call.agentVersionId },
        columns: { number: true },
      })
    : null

  const data: WebhookCallData = {
    callId: call.id,
    agentId: call.agentId,
    agentVersionId: call.agentVersionId,
    agentVersion: agentVersion?.number ?? null,
    batchCallId: call.batchCallId,
    direction: call.direction,
    channel: call.channel,
    status: call.status,
    from: call.fromNumber,
    to: call.toNumber,
    startedAt: call.startedAt.toISOString(),
    endedAt: call.endedAt?.toISOString() ?? null,
    durationMs: call.durationMs,
    totalCost: call.totalCost,
  }

  return type === "call.completed"
    ? { ...data, transcript: call.transcript, variables: call.variables }
    : data
}

async function dispatchCallEvent(type: WebhookEventType, call: Call) {
  const endpoints = await db.query.webhookEndpointsTable.findMany({
    where: {
      organizationId: call.organizationId,
      enabled: true,
    },
    columns: {
      id: true,
      events: true,
    },
  })

  const endpointIds = endpoints
    .filter((endpoint) => endpoint.events.includes(type))
    .map((endpoint) => endpoint.id)

  if (endpointIds.length === 0) {
    return
  }

  const deliveryIds = await createWebhookDeliveries(
    call.organizationId,
    endpointIds,
    type,
    await buildCallData(type, call)
  )

  await enqueueWebhookDeliveries(deliveryIds, type)
}

// DrizzleQueryError messages embed the query params, which here hold the
// transcript, so only the driver's own message is safe to log.
function describeEmitError(error: unknown) {
  if (error instanceof Error) {
    return error.cause instanceof Error ? error.cause.message : error.message
  }
  return "Unknown error"
}

// Not awaited on purpose: the Redis connection has no retry limit, so a Redis
// outage would otherwise hang the call route indefinitely.
export function emitCallEvent(type: WebhookEventType, call: Call) {
  void dispatchCallEvent(type, call).catch((error) => {
    console.error(
      `[webhooks] Failed to emit ${type} for call ${call.id}: ${describeEmitError(error)}`
    )
  })
}
