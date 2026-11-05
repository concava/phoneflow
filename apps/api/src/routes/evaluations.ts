import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm"
import { Hono } from "hono"

import { db } from "@workspace/db/client"
import { callsTable } from "@workspace/db/schema/calls"
import {
  evaluationResultsTable,
  evaluationRunsTable,
  evaluationSuitesTable,
} from "@workspace/db/schema/evaluations"
import {
  claimEvaluationResultRequestSchema,
  createEvaluationSuiteRequestSchema,
  evaluationIdParamsSchema,
  finishEvaluationResultRequestSchema,
  rejudgeEvaluationResultsRequestSchema,
  startEvaluationRunRequestSchema,
  updateEvaluationSuiteRequestSchema,
} from "@workspace/shared/api/evaluations/schemas"
import { summarizeCriteria } from "@workspace/shared/api/evaluations/summary"
import type {
  CancelEvaluationRunResponse,
  ClaimEvaluationResultResponse,
  CreateEvaluationSuiteResponse,
  DeleteEvaluationSuiteResponse,
  EvaluationResultListResponse,
  EvaluationRunListResponse,
  EvaluationRunResponse,
  EvaluationSuiteListResponse,
  EvaluationSuiteResponse,
  FinishEvaluationResultResponse,
  RejudgeEvaluationResultsResponse,
  StartEvaluationRunResponse,
  UpdateEvaluationSuiteResponse,
} from "@workspace/shared/api/evaluations/types"
import { auth } from "@/lib/auth/config"
import { requireOrganization } from "@/lib/auth/organization"
import { requirePermission } from "@/lib/auth/permissions"
import { requireAuthToken } from "@/lib/auth/token"
import {
  enqueueResults,
  failPendingResults,
  finishResult,
  hasNonEmptyTranscript,
  isEvaluationLlmConfigured,
  refreshRunSummary,
  withLockedRun,
} from "@/lib/evaluations"
import { t } from "@/lib/i18n"
import { validator } from "@/lib/validator"

export const evaluationRoutes = new Hono()

const agentVersionColumns = { number: true, name: true } as const

evaluationRoutes.get("/suites", requireOrganization, async (c) => {
  const organizationId = c.get("organizationId")
  const locale = c.get("locale")

  try {
    const suites = await db.query.evaluationSuitesTable.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      with: {
        agent: { columns: { name: true } },
        runs: {
          columns: {
            id: true,
            status: true,
            completedCount: true,
            passedCount: true,
            inconclusiveCount: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          limit: 1,
        },
      },
    })

    return c.json(suites satisfies EvaluationSuiteListResponse)
  } catch {
    return c.json({ error: t(locale, "evaluations.list_failed") }, 500)
  }
})

evaluationRoutes.post(
  "/suites",
  requireOrganization,
  requirePermission({ evaluation: ["create"] }),
  validator("json", createEvaluationSuiteRequestSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const payload = c.req.valid("json")

    try {
      const agent = await db.query.agentsTable.findFirst({
        where: { id: payload.agentId, organizationId },
        columns: { id: true },
      })

      if (!agent) {
        return c.json({ error: t(locale, "evaluations.agent_not_found") }, 404)
      }

      const id = crypto.randomUUID()

      await db.insert(evaluationSuitesTable).values({
        id,
        organizationId,
        agentId: payload.agentId,
        name: payload.name,
        criteria: payload.criteria,
      })

      return c.json({ id } satisfies CreateEvaluationSuiteResponse)
    } catch {
      return c.json({ error: t(locale, "evaluations.create_failed") }, 500)
    }
  }
)

evaluationRoutes.get(
  "/suites/:id",
  requireOrganization,
  validator("param", evaluationIdParamsSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const { id } = c.req.valid("param")

    try {
      const suite = await db.query.evaluationSuitesTable.findFirst({
        where: { id, organizationId },
        with: { agent: { columns: { name: true } } },
      })

      if (!suite) {
        return c.json({ error: t(locale, "evaluations.suite_not_found") }, 404)
      }

      return c.json(suite satisfies EvaluationSuiteResponse)
    } catch {
      return c.json({ error: t(locale, "evaluations.load_failed") }, 500)
    }
  }
)

evaluationRoutes.patch(
  "/suites/:id",
  requireOrganization,
  requirePermission({ evaluation: ["update"] }),
  validator("param", evaluationIdParamsSchema),
  validator("json", updateEvaluationSuiteRequestSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const { id } = c.req.valid("param")
    const payload = c.req.valid("json")

    try {
      const [updated] = await db
        .update(evaluationSuitesTable)
        .set({
          name: payload.name,
          criteria: payload.criteria,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(evaluationSuitesTable.id, id),
            eq(evaluationSuitesTable.organizationId, organizationId)
          )
        )
        .returning({ id: evaluationSuitesTable.id })

      if (!updated) {
        return c.json({ error: t(locale, "evaluations.suite_not_found") }, 404)
      }

      return c.json(updated satisfies UpdateEvaluationSuiteResponse)
    } catch {
      return c.json({ error: t(locale, "evaluations.update_failed") }, 500)
    }
  }
)

evaluationRoutes.delete(
  "/suites/:id",
  requireOrganization,
  requirePermission({ evaluation: ["delete"] }),
  validator("param", evaluationIdParamsSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const { id } = c.req.valid("param")

    try {
      const [deleted] = await db
        .delete(evaluationSuitesTable)
        .where(
          and(
            eq(evaluationSuitesTable.id, id),
            eq(evaluationSuitesTable.organizationId, organizationId)
          )
        )
        .returning({ id: evaluationSuitesTable.id })

      if (!deleted) {
        return c.json({ error: t(locale, "evaluations.suite_not_found") }, 404)
      }

      return c.json(deleted satisfies DeleteEvaluationSuiteResponse)
    } catch {
      return c.json({ error: t(locale, "evaluations.delete_failed") }, 500)
    }
  }
)

evaluationRoutes.post(
  "/suites/:id/runs",
  requireOrganization,
  requirePermission({ evaluation: ["run"] }),
  validator("param", evaluationIdParamsSchema),
  validator("json", startEvaluationRunRequestSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const { id: suiteId } = c.req.valid("param")
    const payload = c.req.valid("json")

    try {
      if (!isEvaluationLlmConfigured()) {
        return c.json(
          { error: t(locale, "evaluations.llm_not_configured") },
          503
        )
      }

      const suite = await db.query.evaluationSuitesTable.findFirst({
        where: { id: suiteId, organizationId },
        columns: { agentId: true, criteria: true },
      })

      if (!suite) {
        return c.json({ error: t(locale, "evaluations.suite_not_found") }, 404)
      }

      const agent = await db.query.agentsTable.findFirst({
        where: { id: suite.agentId, organizationId },
        columns: { id: true },
      })

      if (!agent) {
        return c.json({ error: t(locale, "evaluations.agent_not_found") }, 404)
      }

      if (payload.agentVersionId) {
        const version = await db.query.agentVersionsTable.findFirst({
          where: { id: payload.agentVersionId, agentId: suite.agentId },
          columns: { id: true },
        })

        if (!version) {
          return c.json(
            { error: t(locale, "evaluations.agent_version_not_found") },
            404
          )
        }
      }

      const callsFrom = payload.from ? new Date(payload.from) : null
      const callsTo = payload.to ? new Date(payload.to) : null

      const calls = await db
        .select({ id: callsTable.id })
        .from(callsTable)
        .where(
          and(
            eq(callsTable.organizationId, organizationId),
            eq(callsTable.agentId, suite.agentId),
            eq(callsTable.status, "completed"),
            hasNonEmptyTranscript,
            payload.agentVersionId
              ? eq(callsTable.agentVersionId, payload.agentVersionId)
              : undefined,
            callsFrom ? gte(callsTable.startedAt, callsFrom) : undefined,
            callsTo ? lte(callsTable.startedAt, callsTo) : undefined
          )
        )
        .orderBy(desc(callsTable.startedAt))
        .limit(payload.limit)

      if (calls.length === 0) {
        return c.json(
          { error: t(locale, "evaluations.no_matching_calls") },
          400
        )
      }

      const session = await auth.api.getSession({ headers: c.req.raw.headers })
      const runId = crypto.randomUUID()
      const results = calls.map((call) => ({
        id: crypto.randomUUID(),
        runId,
        callId: call.id,
        status: "pending" as const,
        attempt: 0,
      }))

      await db.transaction(async (tx) => {
        await tx.insert(evaluationRunsTable).values({
          id: runId,
          organizationId,
          suiteId,
          agentVersionId: payload.agentVersionId ?? null,
          callsFrom,
          callsTo,
          status: "pending",
          totalCount: results.length,
          criteria: suite.criteria,
          createdBy: session?.user.id ?? null,
        })

        await tx.insert(evaluationResultsTable).values(results)
      })

      try {
        await enqueueResults(results)
      } catch {
        await failPendingResults(
          runId,
          results.map((result) => result.id),
          "enqueue_failed"
        )
        return c.json({ error: t(locale, "evaluations.start_run_failed") }, 500)
      }

      // Jobs may already have finished the run, so only a pending run moves here.
      await db
        .update(evaluationRunsTable)
        .set({ status: "running", updatedAt: new Date() })
        .where(
          and(
            eq(evaluationRunsTable.id, runId),
            eq(evaluationRunsTable.status, "pending")
          )
        )

      return c.json({ id: runId } satisfies StartEvaluationRunResponse)
    } catch {
      return c.json({ error: t(locale, "evaluations.start_run_failed") }, 500)
    }
  }
)

evaluationRoutes.get(
  "/suites/:id/runs",
  requireOrganization,
  validator("param", evaluationIdParamsSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const { id: suiteId } = c.req.valid("param")

    try {
      const runs = await db.query.evaluationRunsTable.findMany({
        where: { suiteId, organizationId },
        columns: { criteria: false },
        orderBy: { createdAt: "desc" },
        with: { agentVersion: { columns: agentVersionColumns } },
      })

      return c.json(runs satisfies EvaluationRunListResponse)
    } catch {
      return c.json({ error: t(locale, "evaluations.list_runs_failed") }, 500)
    }
  }
)

evaluationRoutes.get(
  "/runs/:id",
  requireOrganization,
  validator("param", evaluationIdParamsSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const { id } = c.req.valid("param")

    try {
      const run = await db.query.evaluationRunsTable.findFirst({
        where: { id, organizationId },
        with: {
          agentVersion: { columns: agentVersionColumns },
          suite: {
            columns: { id: true, name: true, agentId: true },
            with: { agent: { columns: { name: true } } },
          },
        },
      })

      if (!run) {
        return c.json({ error: t(locale, "evaluations.run_not_found") }, 404)
      }

      const results = await db
        .select({
          status: evaluationResultsTable.status,
          verdicts: evaluationResultsTable.verdicts,
        })
        .from(evaluationResultsTable)
        .where(eq(evaluationResultsTable.runId, id))

      return c.json({
        ...run,
        criteriaSummary: summarizeCriteria(run.criteria, results),
      } satisfies EvaluationRunResponse)
    } catch {
      return c.json({ error: t(locale, "evaluations.load_run_failed") }, 500)
    }
  }
)

evaluationRoutes.get(
  "/runs/:id/results",
  requireOrganization,
  validator("param", evaluationIdParamsSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const { id: runId } = c.req.valid("param")

    try {
      const run = await db.query.evaluationRunsTable.findFirst({
        where: { id: runId, organizationId },
        columns: { id: true },
      })

      if (!run) {
        return c.json({ error: t(locale, "evaluations.run_not_found") }, 404)
      }

      const results = await db.query.evaluationResultsTable.findMany({
        where: { runId },
        columns: { attempt: false },
        with: {
          call: {
            columns: {
              id: true,
              startedAt: true,
              durationMs: true,
              fromNumber: true,
              toNumber: true,
            },
            with: { agentVersion: { columns: agentVersionColumns } },
          },
        },
      })

      results.sort(
        (a, b) =>
          (b.call?.startedAt.getTime() ?? 0) -
          (a.call?.startedAt.getTime() ?? 0)
      )

      return c.json(results satisfies EvaluationResultListResponse)
    } catch {
      return c.json(
        { error: t(locale, "evaluations.list_results_failed") },
        500
      )
    }
  }
)

evaluationRoutes.post(
  "/runs/:id/cancel",
  requireOrganization,
  requirePermission({ evaluation: ["run"] }),
  validator("param", evaluationIdParamsSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const { id: runId } = c.req.valid("param")

    try {
      const run = await db.query.evaluationRunsTable.findFirst({
        where: { id: runId, organizationId },
        columns: { id: true },
      })

      if (!run) {
        return c.json({ error: t(locale, "evaluations.run_not_found") }, 404)
      }

      const cancelled = await withLockedRun(runId, async (tx, lockedRun) => {
        if (lockedRun.status !== "pending" && lockedRun.status !== "running") {
          return false
        }

        await tx
          .update(evaluationResultsTable)
          .set({ status: "failed", error: "cancelled", updatedAt: new Date() })
          .where(
            and(
              eq(evaluationResultsTable.runId, runId),
              eq(evaluationResultsTable.status, "pending")
            )
          )

        await refreshRunSummary(tx, runId, "cancelled")

        return true
      })

      if (!cancelled) {
        return c.json({ error: t(locale, "evaluations.run_not_active") }, 409)
      }

      return c.json({ ok: true } satisfies CancelEvaluationRunResponse)
    } catch {
      return c.json({ error: t(locale, "evaluations.cancel_failed") }, 500)
    }
  }
)

evaluationRoutes.post(
  "/runs/:id/rejudge",
  requireOrganization,
  requirePermission({ evaluation: ["run"] }),
  validator("param", evaluationIdParamsSchema),
  validator("json", rejudgeEvaluationResultsRequestSchema),
  async (c) => {
    const locale = c.get("locale")
    const organizationId = c.get("organizationId")
    const { id: runId } = c.req.valid("param")
    const { resultIds } = c.req.valid("json")

    try {
      if (!isEvaluationLlmConfigured()) {
        return c.json(
          { error: t(locale, "evaluations.llm_not_configured") },
          503
        )
      }

      const run = await db.query.evaluationRunsTable.findFirst({
        where: { id: runId, organizationId },
        columns: { id: true },
      })

      if (!run) {
        return c.json({ error: t(locale, "evaluations.run_not_found") }, 404)
      }

      const queued = await withLockedRun(runId, async (tx) => {
        const requeued = await tx
          .update(evaluationResultsTable)
          .set({
            status: "pending",
            attempt: sql`${evaluationResultsTable.attempt} + 1`,
            verdicts: null,
            error: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(evaluationResultsTable.runId, runId),
              isNotNull(evaluationResultsTable.callId),
              resultIds
                ? and(
                    inArray(evaluationResultsTable.id, resultIds),
                    inArray(evaluationResultsTable.status, [
                      "completed",
                      "failed",
                    ])
                  )
                : eq(evaluationResultsTable.status, "failed")
            )
          )
          .returning({
            id: evaluationResultsTable.id,
            attempt: evaluationResultsTable.attempt,
          })

        if (requeued.length > 0) {
          await refreshRunSummary(tx, runId, "running")
        }

        return requeued
      })

      if (!queued?.length) {
        return c.json(
          { error: t(locale, "evaluations.nothing_to_rejudge") },
          400
        )
      }

      try {
        await enqueueResults(queued)
      } catch {
        await failPendingResults(
          runId,
          queued.map((result) => result.id),
          "enqueue_failed"
        )
        return c.json({ error: t(locale, "evaluations.rejudge_failed") }, 500)
      }

      return c.json({
        count: queued.length,
      } satisfies RejudgeEvaluationResultsResponse)
    } catch {
      return c.json({ error: t(locale, "evaluations.rejudge_failed") }, 500)
    }
  }
)

evaluationRoutes.post(
  "/results/:id/claim",
  requireAuthToken,
  validator("param", evaluationIdParamsSchema),
  validator("json", claimEvaluationResultRequestSchema),
  async (c) => {
    const { id } = c.req.valid("param")
    const { attempt } = c.req.valid("json")

    try {
      const result = await db.query.evaluationResultsTable.findFirst({
        where: { id },
        columns: { status: true, attempt: true, callId: true },
        with: {
          run: {
            columns: {
              id: true,
              organizationId: true,
              status: true,
              criteria: true,
            },
          },
        },
      })

      if (
        !result?.run ||
        result.status !== "pending" ||
        result.attempt !== attempt ||
        result.run.status === "cancelled"
      ) {
        return c.json({
          action: "skip",
        } satisfies ClaimEvaluationResultResponse)
      }

      const call = result.callId
        ? await db.query.callsTable.findFirst({
            where: {
              id: result.callId,
              organizationId: result.run.organizationId,
            },
            columns: { transcript: true },
          })
        : null

      if (!call?.transcript?.length) {
        await finishResult(id, attempt, {
          status: "failed",
          error: "call_unavailable",
        })
        return c.json({
          action: "skip",
        } satisfies ClaimEvaluationResultResponse)
      }

      await db
        .update(evaluationRunsTable)
        .set({ status: "running", updatedAt: new Date() })
        .where(
          and(
            eq(evaluationRunsTable.id, result.run.id),
            eq(evaluationRunsTable.status, "pending")
          )
        )

      return c.json({
        action: "judge",
        criteria: result.run.criteria,
        transcript: call.transcript.map(({ role, content }) => ({
          role,
          content,
        })),
      } satisfies ClaimEvaluationResultResponse)
    } catch {
      return c.json({ error: "Failed to claim evaluation result" }, 500)
    }
  }
)

evaluationRoutes.post(
  "/results/:id/finish",
  requireAuthToken,
  validator("param", evaluationIdParamsSchema),
  validator("json", finishEvaluationResultRequestSchema),
  async (c) => {
    const { id } = c.req.valid("param")
    const { attempt, ...outcome } = c.req.valid("json")

    try {
      await finishResult(id, attempt, outcome)

      return c.json({ ok: true } satisfies FinishEvaluationResultResponse)
    } catch {
      return c.json({ error: "Failed to finish evaluation result" }, 500)
    }
  }
)
