import { createHmac } from "node:crypto"
import { request } from "undici"

import type {
  WebhookDeliveryErrorCode,
  WebhookDeliveryEventType,
} from "@workspace/shared/api/webhooks/types"
import { BlockedAddressError, guardWebhookUrl } from "./ssrf"

const REQUEST_TIMEOUT_MS = 10_000

type SendWebhookInput = {
  deliveryId: string
  eventType: WebhookDeliveryEventType
  url: string
  secret: string
  payload: unknown
  restrictNetwork: boolean
}

export type SendWebhookResult = {
  ok: boolean
  retryable: boolean
  statusCode: number | null
  error: string | null
}

function failure(
  error: WebhookDeliveryErrorCode,
  options: { retryable: boolean; statusCode?: number; detail?: string }
): SendWebhookResult {
  return {
    ok: false,
    retryable: options.retryable,
    statusCode: options.statusCode ?? null,
    error: options.detail ? `${error}:${options.detail}` : error,
  }
}

function networkErrorCode(error: unknown) {
  if (error instanceof Error) {
    const cause = error.cause as { code?: unknown } | undefined
    const code = cause?.code ?? (error as { code?: unknown }).code
    if (typeof code === "string") {
      return code
    }
  }
  return undefined
}

export function signWebhookBody(
  secret: string,
  timestamp: number,
  body: string
) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex")

  return `t=${timestamp},v1=${signature}`
}

export async function sendWebhook(
  input: SendWebhookInput
): Promise<SendWebhookResult> {
  let url: URL
  try {
    url = new URL(input.url)
  } catch {
    return failure("invalid_url", { retryable: false })
  }

  if (input.restrictNetwork && url.protocol !== "https:") {
    return failure("https_required", { retryable: false })
  }

  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  try {
    const dispatcher = guardWebhookUrl(url, input.restrictNetwork)
    const body = JSON.stringify(input.payload)
    const timestamp = Math.floor(Date.now() / 1000)

    const response = await request(url, {
      method: "POST",
      dispatcher,
      signal,
      body,
      headers: {
        "content-type": "application/json",
        "user-agent": "Phoneflow-Webhooks/1.0",
        "x-phoneflow-event": input.eventType,
        "x-phoneflow-delivery": input.deliveryId,
        "x-phoneflow-signature": signWebhookBody(input.secret, timestamp, body),
      },
    })

    await response.body.dump().catch(() => {})

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return {
        ok: true,
        retryable: false,
        statusCode: response.statusCode,
        error: null,
      }
    }

    return failure(
      response.statusCode >= 300 && response.statusCode < 400
        ? "redirect_not_followed"
        : "http_status",
      { retryable: true, statusCode: response.statusCode }
    )
  } catch (error) {
    if (error instanceof BlockedAddressError) {
      return failure("blocked_address", { retryable: false })
    }

    if (signal.aborted) {
      return failure("timeout", { retryable: true })
    }

    return failure("network_error", {
      retryable: true,
      detail: networkErrorCode(error),
    })
  }
}
