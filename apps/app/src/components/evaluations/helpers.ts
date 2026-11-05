import type { EvaluationRunStatus } from "@workspace/shared/api/evaluations/types"
import { formatAgentVersionLabel } from "@/components/helpers"
import type { TFunction } from "@/lib/i18n"

export const RUN_POLL_INTERVAL_MS = 3000

export function isRunActive(status?: EvaluationRunStatus) {
  return status === "pending" || status === "running"
}

export function formatPassRate(rate: number | null) {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`
}

export function formatRunVersionLabel(
  version: { number: number; name?: string | null } | null,
  t: TFunction
) {
  return version
    ? formatAgentVersionLabel(version, t)
    : t("components.evaluations.helpers.all_versions")
}

export function suitesQueryKey() {
  return ["evaluations", "suites"]
}

export function suiteQueryKey(suiteId: string) {
  return ["evaluations", "suites", suiteId]
}

export function suiteRunsQueryKey(suiteId: string) {
  return ["evaluations", "suites", suiteId, "runs"]
}

export function runQueryKey(runId: string) {
  return ["evaluations", "runs", runId]
}

export function runResultsQueryKey(runId: string) {
  return ["evaluations", "runs", runId, "results"]
}
