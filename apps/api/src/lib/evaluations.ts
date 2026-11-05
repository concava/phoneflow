import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "@workspace/db/client"
import { callsTable } from "@workspace/db/schema/calls"
import {
  evaluationResultsTable,
  evaluationRunsTable,
} from "@workspace/db/schema/evaluations"
import { summarizeRunResults } from "@workspace/shared/api/evaluations/summary"
import type {
  EvaluationResultError,
  EvaluationRunStatus,
  EvaluationVerdict,
} from "@workspace/shared/api/evaluations/types"
import type { JudgeCallPayload } from "@workspace/shared/jobs/evaluations/types"
import { env } from "@/lib/env"
import { evaluationsQueue } from "@/lib/queues"

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type LockedRun = { id: string; status: EvaluationRunStatus }
type QueuedResult = { id: string; attempt: number }

export function isEvaluationLlmConfigured() {
  return Boolean(
    env.POST_CALL_LLM_BASE_URL &&
      env.POST_CALL_LLM_API_KEY &&
      env.POST_CALL_LLM_MODEL
  )
}

// json_array_length raises on a non-array value such as a stored JSON null, and
// AND does not guarantee evaluation order, so the guard has to be a CASE.
export const hasNonEmptyTranscript = sql`case when json_typeof(${callsTable.transcript}) = 'array' then json_array_length(${callsTable.transcript}) > 0 else false end`

export function enqueueResults(results: QueuedResult[]) {
  return evaluationsQueue.addBulk(
    results.map((result) => ({
      name: "judge-call",
      data: {
        resultId: result.id,
        attempt: result.attempt,
      } satisfies JudgeCallPayload,
    }))
  )
}

// Every writer of a run's results holds this row lock. Counts are read in a
// statement issued after the lock is acquired, so that read sees every result
// committed by previous holders. A single UPDATE with a subquery would not be
// safe: when it waits on the row lock, the subquery still uses its old snapshot
// and it can overwrite newer counts.
export async function withLockedRun<T>(
  runId: string,
  callback: (tx: Transaction, run: LockedRun) => Promise<T>
) {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select({
        id: evaluationRunsTable.id,
        status: evaluationRunsTable.status,
      })
      .from(evaluationRunsTable)
      .where(eq(evaluationRunsTable.id, runId))
      .for("update")

    return run ? callback(tx, run) : null
  })
}

export async function refreshRunSummary(
  tx: Transaction,
  runId: string,
  currentStatus: EvaluationRunStatus
) {
  const results = await tx
    .select({
      status: evaluationResultsTable.status,
      verdicts: evaluationResultsTable.verdicts,
      error: evaluationResultsTable.error,
    })
    .from(evaluationResultsTable)
    .where(eq(evaluationResultsTable.runId, runId))

  const { pendingCount, ...counts } = summarizeRunResults(results)
  const isActive = currentStatus === "pending" || currentStatus === "running"
  const finalStatus = counts.completedCount > 0 ? "completed" : "failed"

  await tx
    .update(evaluationRunsTable)
    .set({
      ...counts,
      totalCount: results.length,
      status: isActive && pendingCount === 0 ? finalStatus : currentStatus,
      updatedAt: new Date(),
    })
    .where(eq(evaluationRunsTable.id, runId))
}

export async function finishResult(
  resultId: string,
  attempt: number,
  outcome:
    | { status: "completed"; verdicts: EvaluationVerdict[] }
    | { status: "failed"; error: EvaluationResultError }
) {
  const result = await db.query.evaluationResultsTable.findFirst({
    where: { id: resultId },
    columns: { runId: true },
  })

  if (!result) return

  await withLockedRun(result.runId, async (tx, run) => {
    const [updated] = await tx
      .update(evaluationResultsTable)
      .set({
        status: outcome.status,
        verdicts: outcome.status === "completed" ? outcome.verdicts : null,
        error: outcome.status === "failed" ? outcome.error : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(evaluationResultsTable.id, resultId),
          eq(evaluationResultsTable.status, "pending"),
          eq(evaluationResultsTable.attempt, attempt)
        )
      )
      .returning({ id: evaluationResultsTable.id })

    if (updated) {
      await refreshRunSummary(tx, run.id, run.status)
    }
  })
}

export async function failPendingResults(
  runId: string,
  resultIds: string[],
  error: EvaluationResultError
) {
  await withLockedRun(runId, async (tx, run) => {
    await tx
      .update(evaluationResultsTable)
      .set({ status: "failed", error, updatedAt: new Date() })
      .where(
        and(
          inArray(evaluationResultsTable.id, resultIds),
          eq(evaluationResultsTable.status, "pending")
        )
      )

    await refreshRunSummary(tx, run.id, run.status)
  })
}
