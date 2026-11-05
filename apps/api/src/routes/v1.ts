import {
  type AnyRelationsFilter,
  count,
  eq,
  relationsFilterToSQL,
} from "drizzle-orm"
import { Hono } from "hono"

import { db } from "@workspace/db/client"
import { agentsTable } from "@workspace/db/schema/agents"
import { callsTable } from "@workspace/db/schema/calls"
import { createBatchCallRequestSchema } from "@workspace/shared/api/batch-calls/schemas"
import { triggerOutboundCallRequestSchema } from "@workspace/shared/api/calls/schemas"
import {
  v1AgentListQuerySchema,
  v1CallListQuerySchema,
  v1IdParamsSchema,
} from "@workspace/shared/api/v1/schemas"
import type {
  V1Agent,
  V1BatchCall,
  V1Call,
  V1CallDetail,
  V1CreateCallResponse,
  V1Page,
} from "@workspace/shared/api/v1/types"
import { requireApiKey } from "@/lib/auth/api-key"
import { createBatchCall } from "@/lib/batch-calls"
import { buildCallListWhere, triggerOutboundCall } from "@/lib/calls"
import { t } from "@/lib/i18n"
import { apiKeyRateLimit } from "@/lib/rate-limit"
import { validator } from "@/lib/validator"

export const v1Routes = new Hono<{
  Variables: { organizationId: string; apiKeyId: string }
}>()

v1Routes.use("*", requireApiKey, apiKeyRateLimit)

const callColumns = {
  id: true,
  agentId: true,
  agentVersionId: true,
  batchCallId: true,
  channel: true,
  direction: true,
  status: true,
  fromNumber: true,
  toNumber: true,
  startedAt: true,
  endedAt: true,
  durationMs: true,
  totalCost: true,
  variables: true,
  createdAt: true,
  updatedAt: true,
} as const

const batchCallColumns = {
  id: true,
  name: true,
  status: true,
  phoneNumberId: true,
  agentId: true,
  agentVersionId: true,
  scheduledAt: true,
  totalCount: true,
  createdAt: true,
  updatedAt: true,
} as const

function toV1Call(
  call: Pick<typeof callsTable.$inferSelect, keyof typeof callColumns>
): V1Call {
  return {
    id: call.id,
    agentId: call.agentId,
    agentVersionId: call.agentVersionId,
    batchCallId: call.batchCallId,
    channel: call.channel,
    direction: call.direction,
    status: call.status,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    startedAt: call.startedAt.toISOString(),
    endedAt: call.endedAt?.toISOString() ?? null,
    durationMs: call.durationMs,
    totalCost: call.totalCost,
    variables: call.variables,
    createdAt: call.createdAt.toISOString(),
    updatedAt: call.updatedAt.toISOString(),
  }
}

function findBatchCall(organizationId: string, id: string) {
  return db.query.batchCallsTable.findFirst({
    where: {
      id,
      organizationId,
    },
    columns: batchCallColumns,
  })
}

function toV1BatchCall(
  batchCall: NonNullable<Awaited<ReturnType<typeof findBatchCall>>>
): V1BatchCall {
  return {
    id: batchCall.id,
    name: batchCall.name,
    status: batchCall.status,
    phoneNumberId: batchCall.phoneNumberId,
    agentId: batchCall.agentId,
    agentVersionId: batchCall.agentVersionId,
    scheduledAt: batchCall.scheduledAt?.toISOString() ?? null,
    totalCount: batchCall.totalCount,
    createdAt: batchCall.createdAt.toISOString(),
    updatedAt: batchCall.updatedAt.toISOString(),
  }
}

v1Routes.post(
  "/calls",
  validator("json", triggerOutboundCallRequestSchema),
  async (c) => {
    const locale = c.get("locale")

    try {
      const result = await triggerOutboundCall(
        c.get("organizationId"),
        c.req.valid("json")
      )

      if (!result.ok) {
        return c.json({ error: t(locale, result.error) }, result.status)
      }

      return c.json({ id: result.callId } satisfies V1CreateCallResponse, 202)
    } catch {
      return c.json({ error: t(locale, "calls.start_outbound_failed") }, 500)
    }
  }
)

v1Routes.get("/calls/:id", validator("param", v1IdParamsSchema), async (c) => {
  const locale = c.get("locale")
  const { id } = c.req.valid("param")

  try {
    const call = await db.query.callsTable.findFirst({
      where: {
        id,
        organizationId: c.get("organizationId"),
      },
      columns: {
        ...callColumns,
        transcript: true,
      },
    })

    if (!call) {
      return c.json({ error: t(locale, "calls.not_found") }, 404)
    }

    return c.json({
      ...toV1Call(call),
      transcript: call.transcript,
    } satisfies V1CallDetail)
  } catch {
    return c.json({ error: t(locale, "calls.load_failed") }, 500)
  }
})

v1Routes.get("/calls", validator("query", v1CallListQuerySchema), async (c) => {
  const locale = c.get("locale")
  const query = c.req.valid("query")

  try {
    const where = buildCallListWhere(c.get("organizationId"), {
      status: query.status,
      agentIds: query.agentId ? [query.agentId] : undefined,
      batchId: query.batchCallId,
    })

    const [{ total }] = await db
      .select({ total: count() })
      .from(callsTable)
      .where(relationsFilterToSQL(callsTable, where as AnyRelationsFilter))

    const calls = await db.query.callsTable.findMany({
      where,
      columns: callColumns,
      orderBy: {
        startedAt: "desc",
        id: "desc",
      },
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    })

    return c.json({
      items: calls.map(toV1Call),
      total,
      page: query.page,
      pageSize: query.pageSize,
    } satisfies V1Page<V1Call>)
  } catch {
    return c.json({ error: t(locale, "calls.list_failed") }, 500)
  }
})

v1Routes.get(
  "/agents",
  validator("query", v1AgentListQuerySchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const query = c.req.valid("query")

    try {
      const [{ total }] = await db
        .select({ total: count() })
        .from(agentsTable)
        .where(eq(agentsTable.organizationId, organizationId))

      const agents = await db.query.agentsTable.findMany({
        where: {
          organizationId,
        },
        columns: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: "desc",
          id: "desc",
        },
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      })

      return c.json({
        items: agents.map(
          (agent): V1Agent => ({
            id: agent.id,
            name: agent.name,
            createdAt: agent.createdAt.toISOString(),
            updatedAt: agent.updatedAt.toISOString(),
          })
        ),
        total,
        page: query.page,
        pageSize: query.pageSize,
      } satisfies V1Page<V1Agent>)
    } catch {
      return c.json({ error: t(locale, "agents.list_failed") }, 500)
    }
  }
)

v1Routes.post(
  "/batch-calls",
  validator("json", createBatchCallRequestSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")

    try {
      const result = await createBatchCall(organizationId, c.req.valid("json"))

      if (!result.ok) {
        return c.json({ error: t(locale, result.error) }, result.status)
      }

      const batchCall = await findBatchCall(organizationId, result.batchCallId)

      if (!batchCall) {
        return c.json({ error: t(locale, "batch_calls.create_failed") }, 500)
      }

      return c.json(toV1BatchCall(batchCall) satisfies V1BatchCall, 201)
    } catch {
      return c.json({ error: t(locale, "batch_calls.create_failed") }, 500)
    }
  }
)

v1Routes.get(
  "/batch-calls/:id",
  validator("param", v1IdParamsSchema),
  async (c) => {
    const locale = c.get("locale")
    const { id } = c.req.valid("param")

    try {
      const batchCall = await findBatchCall(c.get("organizationId"), id)

      if (!batchCall) {
        return c.json({ error: t(locale, "batch_calls.not_found") }, 404)
      }

      return c.json(toV1BatchCall(batchCall) satisfies V1BatchCall)
    } catch {
      return c.json({ error: t(locale, "batch_calls.load_failed") }, 500)
    }
  }
)
