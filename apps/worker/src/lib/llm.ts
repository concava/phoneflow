import { env } from "@/lib/env"

const REQUEST_TIMEOUT_MS = 60_000

type CompleteJsonOptions = {
  system: string
  user: string
  jsonSchema: Record<string, unknown>
  schemaName: string
}

type ChatCompletionResponse = {
  choices?: { message?: { content?: string | null } }[]
}

export async function completeJson({
  system,
  user,
  jsonSchema,
  schemaName,
}: CompleteJsonOptions): Promise<unknown> {
  const baseUrl = env.POST_CALL_LLM_BASE_URL.replace(/\/+$/, "")

  if (!baseUrl || !env.POST_CALL_LLM_API_KEY || !env.POST_CALL_LLM_MODEL) {
    throw new Error("Post-call LLM is not configured")
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
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
        json_schema: { name: schemaName, strict: true, schema: jsonSchema },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`Post-call LLM responded with status ${response.status}`)
  }

  const body = (await response.json()) as ChatCompletionResponse
  const content = body.choices?.[0]?.message?.content

  if (typeof content !== "string") {
    throw new Error("Post-call LLM returned no content")
  }

  return JSON.parse(content)
}
