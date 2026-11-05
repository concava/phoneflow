import type {
  ClaimEvaluationResultRequest,
  ClaimEvaluationResultResponse,
  EvaluationCriterion,
  EvaluationTranscriptTurn,
  FinishEvaluationResultRequest,
  FinishEvaluationResultResponse,
} from "@workspace/shared/api/evaluations/types"
import type { JudgeCallPayload } from "@workspace/shared/jobs/evaluations/types"
import { buildJudgeRequest, parseVerdicts } from "@/evaluations/judge"
import { api } from "@/lib/api"
import { env } from "@/lib/env"
import { completeJson } from "@/lib/llm"

type JudgeOutcome =
  | Extract<FinishEvaluationResultRequest, { status: "completed" }>
  | Extract<FinishEvaluationResultRequest, { status: "failed" }>

async function judge(
  attempt: number,
  criteria: EvaluationCriterion[],
  transcript: EvaluationTranscriptTurn[]
): Promise<JudgeOutcome> {
  if (
    !env.POST_CALL_LLM_BASE_URL ||
    !env.POST_CALL_LLM_API_KEY ||
    !env.POST_CALL_LLM_MODEL
  ) {
    return { attempt, status: "failed", error: "llm_not_configured" }
  }

  let output: unknown

  try {
    output = await completeJson(buildJudgeRequest(criteria, transcript))
  } catch (error) {
    console.error("[evaluations] LLM request failed:", error)
    return { attempt, status: "failed", error: "llm_failed" }
  }

  const verdicts = parseVerdicts(output, criteria, transcript)

  if (!verdicts) {
    console.error("[evaluations] LLM returned invalid verdicts")
    return { attempt, status: "failed", error: "invalid_output" }
  }

  return { attempt, status: "completed", verdicts }
}

export async function judgeCall({ resultId, attempt }: JudgeCallPayload) {
  const claim = await api.post<
    ClaimEvaluationResultResponse,
    ClaimEvaluationResultRequest
  >(`/evaluations/results/${resultId}/claim`, { body: { attempt } })

  if (claim.action === "skip") {
    return { resultId, skipped: true }
  }

  const outcome = await judge(attempt, claim.criteria, claim.transcript)

  // A failure here throws so BullMQ retries; the result stays pending until then.
  await api.post<FinishEvaluationResultResponse, FinishEvaluationResultRequest>(
    `/evaluations/results/${resultId}/finish`,
    { body: outcome }
  )

  return { resultId, status: outcome.status }
}
