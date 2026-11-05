import type { BatchCallStatus } from "@workspace/shared/api/batch-calls/types"
import type {
  CallChannel,
  CallDirection,
  CallStatus,
  CallTranscript,
  CallVariableValues,
} from "@workspace/shared/api/calls/types"

export type V1Page<TItem> = {
  items: TItem[]
  total: number
  page: number
  pageSize: number
}

export type V1Call = {
  id: string
  agentId: string
  agentVersionId: string | null
  batchCallId: string | null
  channel: CallChannel
  direction: CallDirection
  status: CallStatus
  fromNumber: string | null
  toNumber: string | null
  startedAt: string
  endedAt: string | null
  durationMs: number | null
  totalCost: string | null
  variables: CallVariableValues | null
  createdAt: string
  updatedAt: string
}

export type V1CallDetail = V1Call & {
  transcript: CallTranscript | null
}

export type V1CreateCallResponse = {
  id: string
}

export type V1Agent = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export type V1BatchCall = {
  id: string
  name: string
  status: BatchCallStatus
  phoneNumberId: string
  agentId: string
  agentVersionId: string | null
  scheduledAt: string | null
  totalCount: number
  createdAt: string
  updatedAt: string
}
