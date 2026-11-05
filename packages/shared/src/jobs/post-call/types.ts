import type { ExtractionField } from "@workspace/shared/api/agent-config/types"

export type ExtractCallPayload = {
  callId: string
  fields: ExtractionField[]
  timezone: string
}

export type TestExtractionPayload = ExtractCallPayload
