import { log } from "@livekit/agents"

import type {
  DynamicVariable,
  PreCallWebhook,
} from "@workspace/shared/api/agent-config/types"
import { assertHttpsUrl } from "@/flow/tools/webhook"
import { SYSTEM_VARIABLE_KEYS, type Variables } from "@/flow/variables"
import { isBlockedAddressError, webhookFetch } from "@/lib/webhook-fetch"

const BODY_LIMIT_BYTES = 64 * 1024
const VALUE_LIMIT = 2000

type PreCallPayload = {
  callId: string
  agentId: string
  agentVersionId: string | null
  fromNumber: string
  toNumber: string
  direction: "inbound"
}

type ApplyPreCallWebhookInput = {
  webhook: PreCallWebhook
  dynamicVariables: DynamicVariable[]
  variables: Variables
  payload: PreCallPayload
}

class PreCallError extends Error {
  constructor(
    readonly reason: string,
    readonly status?: number
  ) {
    super(reason)
    this.name = "PreCallError"
  }
}

function parseAllowedUrl(value: string) {
  try {
    const url = new URL(value)
    assertHttpsUrl(url)
    return url
  } catch {
    throw new PreCallError("url_not_allowed")
  }
}

async function readBody(response: { body: AsyncIterable<Uint8Array> | null }) {
  const chunks: Uint8Array[] = []
  let size = 0

  if (response.body) {
    for await (const chunk of response.body) {
      size += chunk.byteLength
      if (size > BODY_LIMIT_BYTES) {
        throw new PreCallError("body_too_large")
      }
      chunks.push(chunk)
    }
  }

  return Buffer.concat(chunks).toString("utf8")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function requestVariables(
  webhook: PreCallWebhook,
  payload: PreCallPayload
) {
  const url = parseAllowedUrl(webhook.url)

  const headers = new Headers()
  for (const header of webhook.headers) {
    headers.set(header.key, header.value)
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json")
  }

  const response = await webhookFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(webhook.timeoutMs),
  })

  if (!response.ok) {
    await response.body?.cancel()
    throw new PreCallError("bad_status", response.status)
  }

  const body = await readBody(response)

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new PreCallError("invalid_json")
  }

  if (!isRecord(parsed) || !isRecord(parsed.variables)) {
    throw new PreCallError("invalid_shape")
  }

  return parsed.variables
}

function failureDetails(error: unknown) {
  if (error instanceof PreCallError) {
    return { reason: error.reason, status: error.status }
  }
  if (isBlockedAddressError(error)) {
    return { reason: "url_not_allowed" }
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return { reason: "timeout" }
  }
  return { reason: "request_failed" }
}

export async function applyPreCallWebhook({
  webhook,
  dynamicVariables,
  variables,
  payload,
}: ApplyPreCallWebhookInput) {
  try {
    const received = await requestVariables(webhook, payload)

    for (const { key } of dynamicVariables) {
      const value = received[key]
      if (typeof value === "string" && !SYSTEM_VARIABLE_KEYS.has(key)) {
        variables.set(key, value.slice(0, VALUE_LIMIT))
      }
    }
  } catch (error) {
    // Error messages can echo header values, so only fixed reasons are logged.
    log().warn(
      { callId: payload.callId, ...failureDetails(error) },
      "pre-call webhook failed, continuing with defaults"
    )
  }
}
