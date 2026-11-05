import type { z } from "zod"

import type {
  claimEvaluationResultRequestSchema,
  createEvaluationSuiteRequestSchema,
  evaluationCriterionSchema,
  evaluationResultErrorSchema,
  evaluationVerdictSchema,
  finishEvaluationResultRequestSchema,
  rejudgeEvaluationResultsRequestSchema,
  startEvaluationRunRequestSchema,
  updateEvaluationSuiteRequestSchema,
} from "./schemas"

export type EvaluationRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export type EvaluationResultStatus = "pending" | "completed" | "failed"

export type EvaluationCriterion = z.infer<typeof evaluationCriterionSchema>
export type EvaluationVerdict = z.infer<typeof evaluationVerdictSchema>
export type EvaluationResultError = z.infer<typeof evaluationResultErrorSchema>

export type CreateEvaluationSuiteRequest = z.infer<
  typeof createEvaluationSuiteRequestSchema
>
export type UpdateEvaluationSuiteRequest = z.infer<
  typeof updateEvaluationSuiteRequestSchema
>
export type StartEvaluationRunRequest = z.input<
  typeof startEvaluationRunRequestSchema
>
export type RejudgeEvaluationResultsRequest = z.infer<
  typeof rejudgeEvaluationResultsRequestSchema
>
export type ClaimEvaluationResultRequest = z.infer<
  typeof claimEvaluationResultRequestSchema
>
export type FinishEvaluationResultRequest = z.infer<
  typeof finishEvaluationResultRequestSchema
>

export type EvaluationSuite = {
  id: string
  organizationId: string
  agentId: string
  name: string
  criteria: EvaluationCriterion[]
  createdAt: Date
  updatedAt: Date
  agent: { name: string } | null
}

export type EvaluationRunSummary = {
  id: string
  organizationId: string
  suiteId: string
  agentVersionId: string | null
  callsFrom: Date | null
  callsTo: Date | null
  status: EvaluationRunStatus
  totalCount: number
  completedCount: number
  failedCount: number
  passedCount: number
  inconclusiveCount: number
  createdAt: Date
  updatedAt: Date
  agentVersion: { number: number; name: string | null } | null
}

export type EvaluationSuiteListItem = EvaluationSuite & {
  runs: Pick<
    EvaluationRunSummary,
    | "id"
    | "status"
    | "completedCount"
    | "passedCount"
    | "inconclusiveCount"
    | "createdAt"
  >[]
}

export type EvaluationSuiteListResponse = EvaluationSuiteListItem[]
export type EvaluationSuiteResponse = EvaluationSuite

export type CreateEvaluationSuiteResponse = {
  id: string
}

export type UpdateEvaluationSuiteResponse = {
  id: string
}

export type DeleteEvaluationSuiteResponse = {
  id: string
}

export type StartEvaluationRunResponse = {
  id: string
}

export type EvaluationRunListResponse = EvaluationRunSummary[]

export type EvaluationCriterionSummary = EvaluationCriterion & {
  passed: number
  failed: number
  notApplicable: number
  passRate: number | null
}

export type EvaluationRunResponse = EvaluationRunSummary & {
  criteria: EvaluationCriterion[]
  criteriaSummary: EvaluationCriterionSummary[]
  suite: {
    id: string
    name: string
    agentId: string
    agent: { name: string } | null
  } | null
}

export type EvaluationResultListItem = {
  id: string
  runId: string
  callId: string | null
  status: EvaluationResultStatus
  verdicts: EvaluationVerdict[] | null
  error: EvaluationResultError | null
  createdAt: Date
  updatedAt: Date
  call: {
    id: string
    startedAt: Date
    durationMs: number | null
    fromNumber: string | null
    toNumber: string | null
    agentVersion: { number: number; name: string | null } | null
  } | null
}

export type EvaluationResultListResponse = EvaluationResultListItem[]

export type CancelEvaluationRunResponse = {
  ok: true
}

export type RejudgeEvaluationResultsResponse = {
  count: number
}

export type EvaluationTranscriptTurn = {
  role: "user" | "assistant"
  content: string
}

export type ClaimEvaluationResultResponse =
  | { action: "skip" }
  | {
      action: "judge"
      criteria: EvaluationCriterion[]
      transcript: EvaluationTranscriptTurn[]
    }

export type FinishEvaluationResultResponse = {
  ok: true
}
