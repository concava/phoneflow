import {
  type AnyRelationsFilter,
  count,
  eq,
  relationsFilterToSQL,
} from "drizzle-orm"
import { Hono } from "hono"

import { db } from "@workspace/db/client"
import { callsTable } from "@workspace/db/schema/calls"
import type { AgentConfig } from "@workspace/shared/api/agent-config/types"
import {
  callListQuerySchema,
  completeCallRequestSchema,
  startInboundCallRequestSchema,
  startOutboundCallRequestSchema,
  startWebCallRequestSchema,
  triggerOutboundCallRequestSchema,
  unansweredCallRequestSchema,
} from "@workspace/shared/api/calls/schemas"
import type {
  CallDetailResponse,
  CallDownloadResponse,
  CallListResponse,
  CallSipConnection,
  CompleteCallResponse,
  EndCallResponse,
  JoinCallResponse,
  RequestCallDownloadResponse,
  StartCallResponse,
  TriggerOutboundCallResponse,
  UnansweredCallResponse,
} from "@workspace/shared/api/calls/types"
import type { SendDownloadCallsPayload } from "@workspace/shared/jobs/emails/types"
import { auth } from "@/lib/auth/config"
import { requireOrganization } from "@/lib/auth/organization"
import { requirePermission } from "@/lib/auth/permissions"
import { requireAuthToken } from "@/lib/auth/token"
import { computeCallCosts } from "@/lib/call-cost"
import { buildCallListWhere, triggerOutboundCall } from "@/lib/calls"
import { recordContactCall, resolvePhoneContactId } from "@/lib/contacts"
import {
  deductOrganizationCredits,
  organizationHasCredits,
} from "@/lib/credits"
import { env } from "@/lib/env"
import { t } from "@/lib/i18n"
import {
  createAccessToken,
  getRecording,
  removeCallParticipants,
  startCallRecording,
  stopCallRecording,
} from "@/lib/livekit"
import { emailsQueue } from "@/lib/queues"
import { validator } from "@/lib/validator"

export const callRoutes = new Hono()

type ResolvedAgentConfig = {
  organizationId: string
  agentVersionId: string | null
  config: AgentConfig
}

async function resolveAgentConfig(
  agentId: string,
  agentVersionId: string | null
): Promise<ResolvedAgentConfig | null> {
  const agent = await db.query.agentsTable.findFirst({
    where: {
      id: agentId,
    },
    columns: {
      organizationId: true,
      config: true,
    },
  })

  if (!agent) {
    return null
  }

  if (agentVersionId) {
    const version = await db.query.agentVersionsTable.findFirst({
      where: {
        id: agentVersionId,
        agentId,
      },
      columns: {
        config: true,
      },
    })

    if (!version) {
      return null
    }

    return {
      organizationId: agent.organizationId,
      agentVersionId,
      config: version.config,
    }
  }

  return {
    organizationId: agent.organizationId,
    agentVersionId: null,
    config: agent.config,
  }
}

function sipConnection(phoneNumber: {
  number: string
  sipAddress: string | null
  sipUsername: string | null
  sipPassword: string | null
}): CallSipConnection | null {
  if (
    !phoneNumber.sipAddress ||
    !phoneNumber.sipUsername ||
    !phoneNumber.sipPassword
  ) {
    return null
  }

  return {
    number: phoneNumber.number,
    address: phoneNumber.sipAddress,
    username: phoneNumber.sipUsername,
    password: phoneNumber.sipPassword,
  }
}

callRoutes.post(
  "/start/web",
  requireAuthToken,
  validator("json", startWebCallRequestSchema),
  async (c) => {
    try {
      const payload = c.req.valid("json")

      const resolved = await resolveAgentConfig(
        payload.agentId,
        payload.agentVersionId
      )

      if (!resolved) {
        return c.json({ error: "Agent not found" }, 404)
      }

      if (
        env.IS_CLOUD &&
        !(await organizationHasCredits(resolved.organizationId))
      ) {
        return c.json({ error: "Insufficient credits" }, 402)
      }

      const [call] = await db
        .insert(callsTable)
        .values({
          id: crypto.randomUUID(),
          organizationId: resolved.organizationId,
          agentId: payload.agentId,
          agentVersionId: resolved.agentVersionId,
          channel: "web_call",
          direction: "inbound",
          status: "in_progress",
          sttModel: resolved.config.stt.model,
          llmModel: resolved.config.llm.model,
          ttsModel: resolved.config.tts.model,
          livekitRoomName: payload.livekitRoomName,
          startedAt: new Date(payload.startedAt),
        })
        .returning({ id: callsTable.id })

      await startCallRecording(payload.livekitRoomName, call.id)

      return c.json(
        {
          callId: call.id,
          config: resolved.config,
          sip: null,
        } satisfies StartCallResponse,
        201
      )
    } catch {
      return c.json({ error: "Failed to start call" }, 500)
    }
  }
)

callRoutes.post(
  "/start/inbound",
  requireAuthToken,
  validator("json", startInboundCallRequestSchema),
  async (c) => {
    try {
      const payload = c.req.valid("json")

      const phoneNumber = await db.query.phoneNumbersTable.findFirst({
        where: {
          number: payload.toNumber,
        },
        columns: {
          number: true,
          organizationId: true,
          agentId: true,
          agentVersionId: true,
          sipAddress: true,
          sipUsername: true,
          sipPassword: true,
        },
      })

      if (!phoneNumber?.agentId) {
        return c.json({ error: "Phone number not found" }, 404)
      }

      const resolved = await resolveAgentConfig(
        phoneNumber.agentId,
        phoneNumber.agentVersionId
      )

      if (!resolved) {
        return c.json({ error: "Phone number not found" }, 404)
      }

      if (
        env.IS_CLOUD &&
        !(await organizationHasCredits(phoneNumber.organizationId))
      ) {
        return c.json({ error: "Insufficient credits" }, 402)
      }

      const contactId = await resolvePhoneContactId(
        phoneNumber.organizationId,
        "inbound",
        payload.fromNumber,
        payload.toNumber
      )

      const [call] = await db
        .insert(callsTable)
        .values({
          id: crypto.randomUUID(),
          organizationId: phoneNumber.organizationId,
          agentId: phoneNumber.agentId,
          agentVersionId: resolved.agentVersionId,
          contactId,
          channel: "phone_call",
          direction: "inbound",
          status: "in_progress",
          fromNumber: payload.fromNumber,
          toNumber: payload.toNumber,
          sttModel: resolved.config.stt.model,
          llmModel: resolved.config.llm.model,
          ttsModel: resolved.config.tts.model,
          livekitRoomName: payload.livekitRoomName,
          startedAt: new Date(payload.startedAt),
        })
        .returning({ id: callsTable.id })

      await startCallRecording(payload.livekitRoomName, call.id)

      return c.json(
        {
          callId: call.id,
          config: resolved.config,
          sip: sipConnection(phoneNumber),
        } satisfies StartCallResponse,
        201
      )
    } catch {
      return c.json({ error: "Failed to start call" }, 500)
    }
  }
)

callRoutes.post(
  "/start/outbound",
  requireAuthToken,
  validator("json", startOutboundCallRequestSchema),
  async (c) => {
    try {
      const payload = c.req.valid("json")

      const resolved = await resolveAgentConfig(
        payload.agentId,
        payload.agentVersionId
      )

      if (!resolved) {
        return c.json({ error: "Agent not found" }, 404)
      }

      const phoneNumber = await db.query.phoneNumbersTable.findFirst({
        where: {
          number: payload.fromNumber,
          organizationId: resolved.organizationId,
        },
        columns: {
          number: true,
          sipAddress: true,
          sipUsername: true,
          sipPassword: true,
        },
      })

      if (
        env.IS_CLOUD &&
        !(await organizationHasCredits(resolved.organizationId))
      ) {
        return c.json({ error: "Insufficient credits" }, 402)
      }

      const contactId = await resolvePhoneContactId(
        resolved.organizationId,
        "outbound",
        payload.fromNumber,
        payload.toNumber
      )

      const [call] = await db
        .insert(callsTable)
        .values({
          id: payload.callId ?? crypto.randomUUID(),
          organizationId: resolved.organizationId,
          agentId: payload.agentId,
          agentVersionId: resolved.agentVersionId,
          contactId,
          channel: "phone_call",
          direction: "outbound",
          status: "in_progress",
          fromNumber: payload.fromNumber,
          toNumber: payload.toNumber,
          sttModel: resolved.config.stt.model,
          llmModel: resolved.config.llm.model,
          ttsModel: resolved.config.tts.model,
          livekitRoomName: payload.livekitRoomName,
          startedAt: new Date(payload.startedAt),
          batchCallId: payload.batchCallId,
        })
        .returning({ id: callsTable.id })

      await startCallRecording(payload.livekitRoomName, call.id)

      return c.json(
        {
          callId: call.id,
          config: resolved.config,
          sip: phoneNumber ? sipConnection(phoneNumber) : null,
        } satisfies StartCallResponse,
        201
      )
    } catch {
      return c.json({ error: "Failed to start call" }, 500)
    }
  }
)

callRoutes.post(
  "/unanswered",
  requireAuthToken,
  validator("json", unansweredCallRequestSchema),
  async (c) => {
    try {
      const payload = c.req.valid("json")

      const resolved = await resolveAgentConfig(
        payload.agentId,
        payload.agentVersionId
      )

      if (!resolved) {
        return c.json({ error: "Agent not found" }, 404)
      }

      const contactId = await resolvePhoneContactId(
        resolved.organizationId,
        "outbound",
        payload.fromNumber,
        payload.toNumber
      )
      const startedAt = new Date(payload.startedAt)

      const [call] = await db
        .insert(callsTable)
        .values({
          id: payload.callId ?? crypto.randomUUID(),
          organizationId: resolved.organizationId,
          agentId: payload.agentId,
          agentVersionId: resolved.agentVersionId,
          contactId,
          channel: "phone_call",
          direction: "outbound",
          status: "no_answer",
          fromNumber: payload.fromNumber,
          toNumber: payload.toNumber,
          sttModel: resolved.config.stt.model,
          llmModel: resolved.config.llm.model,
          ttsModel: resolved.config.tts.model,
          livekitRoomName: payload.livekitRoomName,
          startedAt,
          endedAt: new Date(payload.endedAt),
          durationMs: 0,
          ...(env.IS_CLOUD
            ? {
                sttCost: "0",
                llmCost: "0",
                ttsCost: "0",
                telephonyCost: "0",
                platformCost: "0",
                totalCost: "0",
              }
            : {}),
          batchCallId: payload.batchCallId,
        })
        .returning({ id: callsTable.id })

      if (contactId) {
        await recordContactCall(contactId, startedAt, 0)
      }

      return c.json({ callId: call.id } satisfies UnansweredCallResponse, 201)
    } catch {
      return c.json({ error: "Failed to record unanswered call" }, 500)
    }
  }
)

callRoutes.post(
  "/complete",
  requireAuthToken,
  validator("json", completeCallRequestSchema),
  async (c) => {
    try {
      const payload = c.req.valid("json")

      const call = await db.query.callsTable.findFirst({
        where: {
          id: payload.callId,
        },
      })

      if (!call) {
        return c.json({ error: "Call not found" }, 404)
      }

      if (call.endedAt) {
        return c.json({ error: "Call already ended" }, 409)
      }

      const endedAt = new Date(payload.endedAt)

      if (endedAt.getTime() < call.startedAt.getTime()) {
        return c.json({ error: "endedAt must be after startedAt" }, 400)
      }

      const durationMs = endedAt.getTime() - call.startedAt.getTime()
      const costs = env.IS_CLOUD
        ? computeCallCosts({
            durationMs,
            channel: call.channel,
            sttModel: call.sttModel,
            llmModel: call.llmModel,
            ttsModel: call.ttsModel,
          })
        : null

      const recordingStartedAt = await stopCallRecording(call.livekitRoomName)

      const [updated] = await db
        .update(callsTable)
        .set({
          status: payload.status,
          endedAt,
          durationMs,
          recordingStartedAt,
          ...(costs
            ? {
                sttCost: costs.stt.toFixed(6),
                llmCost: costs.llm.toFixed(6),
                ttsCost: costs.tts.toFixed(6),
                telephonyCost: costs.telephony.toFixed(6),
                platformCost: costs.platform.toFixed(6),
                totalCost: costs.total.toFixed(6),
              }
            : {}),
          transcript: payload.transcript,
          variables: payload.variables ?? null,
          updatedAt: new Date(),
        })
        .where(eq(callsTable.id, payload.callId))
        .returning()

      if (call.contactId) {
        await recordContactCall(call.contactId, call.startedAt, durationMs)
      }

      if (costs) {
        await deductOrganizationCredits(call.organizationId, costs.total)
      }

      return c.json({
        id: updated.id,
        durationMs,
      } satisfies CompleteCallResponse)
    } catch {
      return c.json({ error: "Failed to complete call" }, 500)
    }
  }
)

callRoutes.post("/download", requireOrganization, async (c) => {
  const locale = c.get("locale")
  const organizationId = c.get("organizationId")

  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })

    if (!session?.user.email) {
      return c.json({ error: t(locale, "calls.user_email_not_found") }, 400)
    }

    const organization = await db.query.organization.findFirst({
      where: {
        id: organizationId,
      },
      columns: {
        name: true,
      },
    })

    if (!organization) {
      return c.json({ error: t(locale, "calls.organization_not_found") }, 404)
    }

    await emailsQueue.add("send-download-calls", {
      to: session.user.email,
      organizationId,
      organizationName: organization.name,
      locale: locale,
    } satisfies SendDownloadCallsPayload)

    return c.json({ ok: true } satisfies RequestCallDownloadResponse)
  } catch {
    return c.json({ error: t(locale, "calls.request_download_failed") }, 500)
  }
})

callRoutes.get("/export/:organizationId", requireAuthToken, async (c) => {
  const organizationId = c.req.param("organizationId")

  try {
    const calls = await db.query.callsTable.findMany({
      where: {
        organizationId,
      },
      with: {
        agent: {
          columns: {
            name: true,
          },
        },
        agentVersion: {
          columns: {
            number: true,
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
    })

    return c.json(calls satisfies CallDownloadResponse)
  } catch {
    return c.json({ error: "Failed to export calls" }, 500)
  }
})

callRoutes.get("/:callId/recording", requireOrganization, async (c) => {
  const locale = c.get("locale")
  const organizationId = c.get("organizationId")
  const callId = c.req.param("callId")

  try {
    const call = await db.query.callsTable.findFirst({
      where: {
        id: callId,
        organizationId,
      },
      columns: {
        id: true,
      },
    })

    if (!call) {
      return c.json({ error: t(locale, "calls.not_found") }, 404)
    }

    const recording = await getRecording(call.id)

    c.header("Content-Type", "audio/mp4")
    c.header("Cache-Control", "private, max-age=604800, immutable")
    if (recording.ContentLength != null) {
      c.header("Content-Length", String(recording.ContentLength))
    }
    return c.body(recording.Body.transformToWebStream())
  } catch {
    return c.json({ error: t(locale, "calls.load_recording_failed") }, 500)
  }
})

callRoutes.post("/:callId/join", requireOrganization, async (c) => {
  const locale = c.get("locale")
  const organizationId = c.get("organizationId")
  const callId = c.req.param("callId")

  try {
    const call = await db.query.callsTable.findFirst({
      where: {
        id: callId,
        organizationId,
      },
      columns: {
        status: true,
        livekitRoomName: true,
      },
    })

    if (!call) {
      return c.json({ error: t(locale, "calls.not_found") }, 404)
    }

    if (call.status !== "in_progress") {
      return c.json({ error: t(locale, "calls.not_in_progress") }, 400)
    }

    const token = await createAccessToken({
      identity: `monitor-${crypto.randomUUID()}`,
      name: "Monitor",
      grant: {
        room: call.livekitRoomName,
        roomJoin: true,
        canSubscribe: true,
        canPublish: false,
        canPublishData: false,
      },
    })

    return c.json(token satisfies JoinCallResponse, 201)
  } catch {
    return c.json({ error: t(locale, "calls.join_failed") }, 500)
  }
})

callRoutes.post("/:callId/end", requireOrganization, async (c) => {
  const locale = c.get("locale")
  const organizationId = c.get("organizationId")
  const callId = c.req.param("callId")

  try {
    const call = await db.query.callsTable.findFirst({
      where: {
        id: callId,
        organizationId,
      },
      columns: {
        status: true,
        livekitRoomName: true,
      },
    })

    if (!call) {
      return c.json({ error: t(locale, "calls.not_found") }, 404)
    }

    if (call.status !== "in_progress") {
      return c.json({ error: t(locale, "calls.not_in_progress") }, 400)
    }

    await removeCallParticipants(call.livekitRoomName)

    return c.json({ ok: true } satisfies EndCallResponse)
  } catch {
    return c.json({ error: t(locale, "calls.end_failed") }, 500)
  }
})

callRoutes.get("/:callId", requireOrganization, async (c) => {
  const locale = c.get("locale")
  const organizationId = c.get("organizationId")
  const callId = c.req.param("callId")

  try {
    const call = await db.query.callsTable.findFirst({
      where: {
        id: callId,
        organizationId,
      },
      with: {
        agent: {
          columns: {
            name: true,
          },
        },
        agentVersion: {
          columns: {
            number: true,
          },
        },
      },
    })

    if (!call) {
      return c.json({ error: t(locale, "calls.not_found") }, 404)
    }

    return c.json(call satisfies CallDetailResponse)
  } catch {
    return c.json({ error: t(locale, "calls.load_failed") }, 500)
  }
})

callRoutes.get(
  "/",
  requireOrganization,
  validator("query", callListQuerySchema),
  async (c) => {
    const organizationId = c.get("organizationId")
    const locale = c.get("locale")
    const query = c.req.valid("query")

    try {
      const where = buildCallListWhere(organizationId, query)

      const [{ total }] = await db
        .select({ total: count() })
        .from(callsTable)
        .where(relationsFilterToSQL(callsTable, where as AnyRelationsFilter))

      const items = await db.query.callsTable.findMany({
        where,
        columns: {
          transcript: false,
        },
        with: {
          agent: {
            columns: {
              name: true,
            },
          },
          agentVersion: {
            columns: {
              number: true,
            },
          },
        },
        orderBy:
          query.sortBy === "duration"
            ? { durationMs: query.sortDir }
            : query.sortBy === "cost"
              ? { totalCost: query.sortDir }
              : { startedAt: query.sortDir },
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      })

      return c.json({
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
      } satisfies CallListResponse)
    } catch {
      return c.json({ error: t(locale, "calls.list_failed") }, 500)
    }
  }
)

callRoutes.post(
  "/outbound",
  requireOrganization,
  requirePermission({ calls: ["create"] }),
  validator("json", triggerOutboundCallRequestSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const payload = c.req.valid("json")

    try {
      const result = await triggerOutboundCall(organizationId, payload)

      if (!result.ok) {
        return c.json({ error: t(locale, result.error) }, result.status)
      }

      return c.json({ ok: true } satisfies TriggerOutboundCallResponse)
    } catch {
      return c.json({ error: t(locale, "calls.start_outbound_failed") }, 500)
    }
  }
)
