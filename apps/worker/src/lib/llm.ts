import { env } from "@/lib/env"

const REQUEST_TIMEOUT_MS = 60_000

export class LlmRequestError extends Error {
  name = "LlmRequestError"
}

export class LlmInvalidResponseError extends Error {
  name = "LlmInvalidResponseError"
}

type ChatCompletionResponse = {
  choices?: {
    finish_reason?: string
    message?: { content?: string | null; refusal?: string | null }
  }[]
}

export function isLlmConfigured() {
  return Boolean(
    env.POST_CALL_LLM_BASE_URL &&
      env.POST_CALL_LLM_API_KEY &&
      env.POST_CALL_LLM_MODEL
  )
}

export async function completeJson({
  system,
  user,
  jsonSchema,
  schemaName,
}: {
  system: string
  user: string
  jsonSchema: Record<string, unknown>
  schemaName: string
}): Promise<unknown> {
  let response: Response
  let body: ChatCompletionResponse
  try {
    response = await fetch(
      `${env.POST_CALL_LLM_BASE_URL.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.POST_CALL_LLM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.POST_CALL_LLM_MODEL,
          temperature: 0,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: schemaName,
              strict: true,
              schema: jsonSchema,
            },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    )

    if (!response.ok) {
      throw new LlmRequestError(`LLM responded with status ${response.status}`)
    }

    body = (await response.json()) as ChatCompletionResponse
  } catch (error) {
    if (error instanceof LlmRequestError) {
      throw error
    }
    throw new LlmRequestError(
      `LLM request failed: ${error instanceof Error ? error.name : "unknown"}`
    )
  }

  const choice = body.choices?.[0]
  const content = choice?.message?.content
  if (!content || choice.message?.refusal) {
    throw new LlmInvalidResponseError(
      `LLM returned no content (finish_reason: ${choice?.finish_reason})`
    )
  }

  try {
    return JSON.parse(content)
  } catch {
    throw new LlmInvalidResponseError(
      `LLM content is not JSON (finish_reason: ${choice.finish_reason})`
    )
  }
}
