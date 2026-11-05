import { db } from "@workspace/db/client"
import {
  batchCallRecipientsTable,
  batchCallsTable,
} from "@workspace/db/schema/batch-calls"
import type { CreateBatchCallRequest } from "@workspace/shared/api/batch-calls/types"
import type { ProcessBatchCallPayload } from "@workspace/shared/jobs/batch-calls/types"
import { type OutboundFailure, resolveOutboundTarget } from "@/lib/calls"
import { batchCallsQueue } from "@/lib/queues"

export async function createBatchCall(
  organizationId: string,
  payload: CreateBatchCallRequest
): Promise<OutboundFailure | { ok: true; batchCallId: string }> {
  const target = await resolveOutboundTarget(
    organizationId,
    payload,
    "batch_calls"
  )

  if (!target.ok) {
    return target
  }

  const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null

  if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
    return {
      ok: false,
      status: 400,
      error: "batch_calls.scheduled_at_in_past",
    }
  }

  const batchCallId = crypto.randomUUID()

  await db.transaction(async (tx) => {
    await tx.insert(batchCallsTable).values({
      id: batchCallId,
      organizationId,
      name: payload.name,
      phoneNumberId: payload.phoneNumberId,
      agentId: payload.agentId,
      agentVersionId: payload.agentVersionId ?? null,
      status: scheduledAt ? "scheduled" : "triggered",
      scheduledAt,
      totalCount: payload.recipients.length,
    })

    await tx.insert(batchCallRecipientsTable).values(
      payload.recipients.map((recipient) => ({
        id: crypto.randomUUID(),
        batchCallId,
        toNumber: recipient.toNumber,
        variables: recipient.variables ?? {},
      }))
    )
  })

  await batchCallsQueue.add(
    "process-batch-call",
    { batchCallId } satisfies ProcessBatchCallPayload,
    scheduledAt ? { delay: scheduledAt.getTime() - Date.now() } : undefined
  )

  return { ok: true, batchCallId }
}
