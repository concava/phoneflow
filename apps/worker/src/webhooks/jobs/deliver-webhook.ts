import { type Job, UnrecoverableError } from "bullmq"

import type {
  RecordWebhookAttemptRequest,
  RecordWebhookAttemptResponse,
  WebhookDeliveryErrorCode,
  WebhookJobDeliveryResponse,
} from "@workspace/shared/api/webhooks/types"
import type { DeliverWebhookPayload } from "@workspace/shared/jobs/webhooks/types"
import { api } from "@/lib/api"
import { sendWebhook } from "../send"

function recordAttempt(deliveryId: string, body: RecordWebhookAttemptRequest) {
  return api.post<RecordWebhookAttemptResponse, RecordWebhookAttemptRequest>(
    `/webhooks/internal/deliveries/${deliveryId}/attempts`,
    { body }
  )
}

export async function deliverWebhook(job: Job<DeliverWebhookPayload>) {
  const { deliveryId } = job.data
  const { delivery } = await api.get<WebhookJobDeliveryResponse>(
    `/webhooks/internal/deliveries/${deliveryId}`
  )

  if (delivery?.status !== "pending") {
    return { deliveryId, skipped: true }
  }

  if (!delivery.endpointEnabled && delivery.eventType !== "webhook.test") {
    await recordAttempt(deliveryId, {
      outcome: "failed",
      statusCode: null,
      error: "endpoint_disabled" satisfies WebhookDeliveryErrorCode,
    })
    return { deliveryId, skipped: true }
  }

  const result = await sendWebhook({
    deliveryId,
    eventType: delivery.eventType,
    url: delivery.url,
    secret: delivery.secret,
    payload: delivery.payload,
    restrictNetwork: delivery.restrictNetwork,
  })

  if (result.ok) {
    await recordAttempt(deliveryId, {
      outcome: "succeeded",
      statusCode: result.statusCode,
      error: null,
    })
    return { deliveryId, statusCode: result.statusCode }
  }

  const attemptsLeft = job.attemptsMade + 1 < (job.opts.attempts ?? 1)
  const willRetry = result.retryable && attemptsLeft

  await recordAttempt(deliveryId, {
    outcome: willRetry ? "retrying" : "failed",
    statusCode: result.statusCode,
    error: result.error,
  })

  if (!result.retryable) {
    throw new UnrecoverableError(result.error ?? "Webhook delivery failed")
  }

  throw new Error(result.error ?? "Webhook delivery failed")
}
