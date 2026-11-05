import type {
  WebhookDeliveryErrorCode,
  WebhookDeliveryEventType,
  WebhookDeliveryStatus,
} from "@workspace/shared/api/webhooks/types"

export const webhookEventLabels = {
  "call.started": "components.settings.webhooks.events.call_started",
  "call.completed": "components.settings.webhooks.events.call_completed",
  "call.no_answer": "components.settings.webhooks.events.call_no_answer",
  "webhook.test": "components.settings.webhooks.events.webhook_test",
} satisfies Record<WebhookDeliveryEventType, string>

export const webhookStatusLabels = {
  pending: "components.settings.webhooks.deliveries.status.pending",
  succeeded: "components.settings.webhooks.deliveries.status.succeeded",
  failed: "components.settings.webhooks.deliveries.status.failed",
} satisfies Record<WebhookDeliveryStatus, string>

export const webhookErrorLabels = {
  blocked_address:
    "components.settings.webhooks.deliveries.errors.blocked_address",
  endpoint_disabled:
    "components.settings.webhooks.deliveries.errors.endpoint_disabled",
  http_status: "components.settings.webhooks.deliveries.errors.http_status",
  https_required:
    "components.settings.webhooks.deliveries.errors.https_required",
  invalid_url: "components.settings.webhooks.deliveries.errors.invalid_url",
  network_error: "components.settings.webhooks.deliveries.errors.network_error",
  queue_unavailable:
    "components.settings.webhooks.deliveries.errors.queue_unavailable",
  redirect_not_followed:
    "components.settings.webhooks.deliveries.errors.redirect_not_followed",
  timeout: "components.settings.webhooks.deliveries.errors.timeout",
} satisfies Record<WebhookDeliveryErrorCode, string>
