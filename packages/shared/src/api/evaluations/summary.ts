import type {
  EvaluationCriterion,
  EvaluationCriterionSummary,
  EvaluationResultError,
  EvaluationResultStatus,
  EvaluationVerdict,
} from "./types"

type ResultForSummary = {
  status: EvaluationResultStatus
  verdicts: EvaluationVerdict[] | null
  error?: EvaluationResultError | null
}

export function computePassRate(passed: number, failed: number) {
  const applicable = passed + failed
  return applicable === 0 ? null : passed / applicable
}

export function summarizeRunResults(results: ResultForSummary[]) {
  const summary = {
    pendingCount: 0,
    completedCount: 0,
    failedCount: 0,
    passedCount: 0,
    inconclusiveCount: 0,
  }

  for (const result of results) {
    if (result.status === "pending") {
      summary.pendingCount += 1
    } else if (result.status === "failed") {
      // A cancelled call was never judged, so it is not a judging failure.
      if (result.error !== "cancelled") summary.failedCount += 1
    } else {
      summary.completedCount += 1
      const outcome = getCallOutcome(result.verdicts ?? [])
      if (outcome === "passed") summary.passedCount += 1
      if (outcome === "inconclusive") summary.inconclusiveCount += 1
    }
  }

  return summary
}

export function getCallOutcome(verdicts: EvaluationVerdict[]) {
  if (verdicts.some((verdict) => verdict.passed === false)) return "failed"
  return verdicts.some((verdict) => verdict.passed === true)
    ? "passed"
    : "inconclusive"
}

export function getRunPassRate(run: {
  completedCount: number
  passedCount: number
  inconclusiveCount: number
}) {
  const failed = run.completedCount - run.passedCount - run.inconclusiveCount
  return computePassRate(run.passedCount, failed)
}

export function summarizeCriteria(
  criteria: EvaluationCriterion[],
  results: ResultForSummary[]
): EvaluationCriterionSummary[] {
  return criteria.map((criterion) => {
    let passed = 0
    let failed = 0
    let notApplicable = 0

    for (const result of results) {
      if (result.status !== "completed") continue
      const verdict = result.verdicts?.find(
        (item) => item.criterionId === criterion.id
      )
      if (!verdict) continue
      if (verdict.passed === true) passed += 1
      else if (verdict.passed === false) failed += 1
      else notApplicable += 1
    }

    return {
      ...criterion,
      passed,
      failed,
      notApplicable,
      passRate: computePassRate(passed, failed),
    }
  })
}
