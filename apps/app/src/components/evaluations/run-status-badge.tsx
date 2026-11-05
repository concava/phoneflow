import type { EvaluationRunStatus } from "@workspace/shared/api/evaluations/types"
import { Badge } from "@workspace/ui/components/badge"
import { useTranslation } from "@/lib/i18n"

const variants = {
  pending: "outline",
  running: "outline",
  completed: "secondary",
  failed: "destructive",
  cancelled: "outline",
} as const

export function RunStatusBadge({ status }: { status: EvaluationRunStatus }) {
  const { t } = useTranslation()

  const labels: Record<EvaluationRunStatus, string> = {
    pending: t("components.evaluations.run_status.pending"),
    running: t("components.evaluations.run_status.running"),
    completed: t("components.evaluations.run_status.completed"),
    failed: t("components.evaluations.run_status.failed"),
    cancelled: t("components.evaluations.run_status.cancelled"),
  }

  return <Badge variant={variants[status]}>{labels[status]}</Badge>
}
