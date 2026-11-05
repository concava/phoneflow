import { db } from "@workspace/db/client"
import type {
  CallListQuery,
  TriggerOutboundCallRequest,
} from "@workspace/shared/api/calls/types"
import { organizationHasCredits } from "@/lib/credits"
import { env } from "@/lib/env"
import { placeOutboundCall } from "@/lib/livekit"

export type OutboundFailure = {
  ok: false
  status: 400 | 402 | 404
  error: string
}

type OutboundTarget = {
  phoneNumberId: string
  agentId: string
  agentVersionId?: string | null
}

export async function resolveOutboundTarget(
  organizationId: string,
  target: OutboundTarget,
  errorScope: "calls" | "batch_calls"
) {
  const failure = (
    status: OutboundFailure["status"],
    error: string
  ): OutboundFailure => ({ ok: false, status, error: `${errorScope}.${error}` })

  const phoneNumber = await db.query.phoneNumbersTable.findFirst({
    where: {
      id: target.phoneNumberId,
      organizationId,
    },
    columns: {
      number: true,
      sipAddress: true,
      sipUsername: true,
      sipPassword: true,
    },
  })

  if (!phoneNumber) {
    return failure(404, "phone_number_not_found")
  }

  const { number, sipAddress, sipUsername, sipPassword } = phoneNumber

  if (!sipAddress || !sipUsername || !sipPassword) {
    return failure(400, "phone_number_without_sip")
  }

  const agent = await db.query.agentsTable.findFirst({
    where: {
      id: target.agentId,
      organizationId,
    },
    columns: {
      id: true,
    },
  })

  if (!agent) {
    return failure(404, "agent_not_found")
  }

  if (env.IS_CLOUD && !(await organizationHasCredits(organizationId))) {
    return failure(402, "insufficient_credits")
  }

  if (target.agentVersionId) {
    const version = await db.query.agentVersionsTable.findFirst({
      where: {
        id: target.agentVersionId,
        agentId: target.agentId,
      },
      columns: {
        id: true,
      },
    })

    if (!version) {
      return failure(404, "agent_version_not_found")
    }
  }

  return { ok: true as const, number, sipAddress, sipUsername, sipPassword }
}

export async function triggerOutboundCall(
  organizationId: string,
  payload: TriggerOutboundCallRequest
) {
  const target = await resolveOutboundTarget(organizationId, payload, "calls")

  if (!target.ok) {
    return target
  }

  const { callId } = await placeOutboundCall({
    agentId: payload.agentId,
    agentVersionId: payload.agentVersionId ?? null,
    toNumber: payload.toNumber,
    fromNumber: target.number,
    sipAddress: target.sipAddress,
    sipUsername: target.sipUsername,
    sipPassword: target.sipPassword,
    variables: payload.variables ?? {},
    batchCallId: null,
  })

  return { ok: true as const, callId }
}

type CallWhere = NonNullable<
  Parameters<typeof db.query.callsTable.findMany>[0]
>["where"]

type CallListFilters = Partial<
  Omit<CallListQuery, "page" | "pageSize" | "sortBy" | "sortDir">
>

export function buildCallListWhere(
  organizationId: string,
  query: CallListFilters
) {
  const where: NonNullable<CallWhere> = {
    organizationId,
  }

  if (query.channel) {
    where.channel = query.channel
  }

  if (query.direction) {
    where.direction = query.direction
  }

  if (query.status) {
    where.status = query.status
  }

  if (query.startedAtFrom) {
    where.startedAt = {
      ...where.startedAt,
      gte: new Date(query.startedAtFrom),
    }
  }

  if (query.startedAtTo) {
    where.startedAt = {
      ...where.startedAt,
      lte: new Date(query.startedAtTo),
    }
  }

  if (query.agentIds) {
    const agentIds = Array.isArray(query.agentIds)
      ? query.agentIds
      : query.agentIds.split(",")
    where.agentId = { in: agentIds }
  }

  if (query.fromNumbers) {
    const fromNumbers = Array.isArray(query.fromNumbers)
      ? query.fromNumbers
      : query.fromNumbers.split(",")
    where.fromNumber = { in: fromNumbers }
  }

  if (query.toNumbers) {
    const toNumbers = Array.isArray(query.toNumbers)
      ? query.toNumbers
      : query.toNumbers.split(",")
    where.toNumber = { in: toNumbers }
  }

  if (query.batchId) {
    where.batchCallId = query.batchId
  }

  if (query.cost !== undefined) {
    const cost = query.cost.toFixed(6)

    if (query.costOp === "between" && query.costMax !== undefined) {
      where.totalCost = {
        gte: Math.min(query.cost, query.costMax).toFixed(6),
        lte: Math.max(query.cost, query.costMax).toFixed(6),
      }
    } else if (query.costOp === "lte") {
      where.totalCost = { lte: cost }
    } else if (query.costOp === "eq") {
      where.totalCost = { eq: cost }
    } else {
      where.totalCost = { gte: cost }
    }
  }

  if (query.duration !== undefined) {
    const durationMs = Math.round(query.duration * 1000)

    if (query.durationOp === "between" && query.durationMax !== undefined) {
      const maxDurationMs = Math.round(query.durationMax * 1000)
      where.durationMs = {
        gte: Math.min(durationMs, maxDurationMs),
        lte: Math.max(durationMs, maxDurationMs),
      }
    } else if (query.durationOp === "lte") {
      where.durationMs = { lte: durationMs }
    } else if (query.durationOp === "eq") {
      where.durationMs = { eq: durationMs }
    } else {
      where.durationMs = { gte: durationMs }
    }
  }

  return where
}
