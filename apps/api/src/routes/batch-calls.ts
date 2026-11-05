import { eq } from "drizzle-orm"
import { Hono } from "hono"

import { db } from "@workspace/db/client"
import { batchCallsTable } from "@workspace/db/schema/batch-calls"
import {
  batchCallIdParamsSchema,
  createBatchCallRequestSchema,
} from "@workspace/shared/api/batch-calls/schemas"
import type {
  BatchCallListResponse,
  CreateBatchCallResponse,
  TriggerBatchCallResponse,
} from "@workspace/shared/api/batch-calls/types"
import { requireOrganization } from "@/lib/auth/organization"
import { requirePermission } from "@/lib/auth/permissions"
import { requireAuthToken } from "@/lib/auth/token"
import { createBatchCall } from "@/lib/batch-calls"
import { organizationHasCredits } from "@/lib/credits"
import { env } from "@/lib/env"
import { t } from "@/lib/i18n"
import { placeOutboundCall } from "@/lib/livekit"
import { validator } from "@/lib/validator"

export const batchCallRoutes = new Hono()

batchCallRoutes.get("/", requireOrganization, async (c) => {
  const organizationId = c.get("organizationId")
  const locale = c.get("locale")

  try {
    const batchCalls = await db.query.batchCallsTable.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
      with: {
        phoneNumber: {
          columns: {
            number: true,
          },
        },
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

    return c.json(batchCalls satisfies BatchCallListResponse)
  } catch {
    return c.json({ error: t(locale, "batch_calls.list_failed") }, 500)
  }
})

batchCallRoutes.post(
  "/",
  requireOrganization,
  requirePermission({ calls: ["create"] }),
  validator("json", createBatchCallRequestSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const payload = c.req.valid("json")

    try {
      const result = await createBatchCall(organizationId, payload)

      if (!result.ok) {
        return c.json({ error: t(locale, result.error) }, result.status)
      }

      return c.json({
        id: result.batchCallId,
      } satisfies CreateBatchCallResponse)
    } catch {
      return c.json({ error: t(locale, "batch_calls.create_failed") }, 500)
    }
  }
)

batchCallRoutes.post(
  "/:id/trigger",
  requireAuthToken,
  validator("param", batchCallIdParamsSchema),
  async (c) => {
    const { id } = c.req.valid("param")

    try {
      const batchCall = await db.query.batchCallsTable.findFirst({
        where: { id },
        columns: {
          id: true,
          organizationId: true,
          agentId: true,
          agentVersionId: true,
        },
        with: {
          phoneNumber: {
            columns: {
              number: true,
              sipAddress: true,
              sipUsername: true,
              sipPassword: true,
            },
          },
          recipients: {
            columns: {
              toNumber: true,
              variables: true,
            },
          },
        },
      })

      if (!batchCall) {
        return c.json({ error: "Batch call not found" }, 404)
      }

      if (
        env.IS_CLOUD &&
        !(await organizationHasCredits(batchCall.organizationId))
      ) {
        return c.json({ error: "Insufficient credits" }, 402)
      }

      const phoneNumber = batchCall.phoneNumber
      if (!phoneNumber) {
        return c.json({ error: "Phone number not found" }, 404)
      }

      if (
        !phoneNumber.sipAddress ||
        !phoneNumber.sipUsername ||
        !phoneNumber.sipPassword
      ) {
        return c.json({ error: "Phone number has no SIP connection" }, 400)
      }

      for (const recipient of batchCall.recipients) {
        try {
          await placeOutboundCall({
            agentId: batchCall.agentId,
            agentVersionId: batchCall.agentVersionId,
            toNumber: recipient.toNumber,
            fromNumber: phoneNumber.number,
            sipAddress: phoneNumber.sipAddress,
            sipUsername: phoneNumber.sipUsername,
            sipPassword: phoneNumber.sipPassword,
            variables: recipient.variables ?? {},
            batchCallId: id,
          })
        } catch {
          // Continue if one recipient fails
        }
      }

      await db
        .update(batchCallsTable)
        .set({
          status: "triggered",
          updatedAt: new Date(),
        })
        .where(eq(batchCallsTable.id, id))

      return c.json({ ok: true } satisfies TriggerBatchCallResponse)
    } catch {
      return c.json({ error: "Failed to trigger batch call" }, 500)
    }
  }
)
