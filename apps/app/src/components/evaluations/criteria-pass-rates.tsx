import { cn } from "cn"

import type {
  EvaluationCriterionSummary,
  EvaluationRunResponse,
} from "@workspace/shared/api/evaluations/types"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { formatPassRate } from "@/components/evaluations/helpers"
import { useTranslation } from "@/lib/i18n"

function PassRateBar({ rate }: { rate: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${(rate ?? 0) * 100}%` }}
        />
      </div>
      <span className="tabular-nums">{formatPassRate(rate)}</span>
    </div>
  )
}

function PassRateDelta({
  current,
  baseline,
}: {
  current: number | null
  baseline: number | null
}) {
  if (current === null || baseline === null) {
    return <span className="text-muted-foreground">—</span>
  }

  const delta = Math.round(current * 100) - Math.round(baseline * 100)

  return (
    <span
      className={cn(
        "tabular-nums",
        delta > 0 && "text-emerald-600 dark:text-emerald-400",
        delta < 0 && "text-destructive"
      )}
    >
      {delta > 0 ? "+" : ""}
      {delta}
    </span>
  )
}

export function CriteriaPassRates({
  run,
  baseline,
}: {
  run: EvaluationRunResponse
  baseline?: EvaluationRunResponse
}) {
  const { t } = useTranslation()

  const baselineById = new Map<string, EvaluationCriterionSummary>(
    baseline?.criteriaSummary.map((criterion) => [criterion.id, criterion])
  )
  const currentIds = new Set(run.criteriaSummary.map(({ id }) => id))
  const baselineOnly =
    baseline?.criteriaSummary.filter(({ id }) => !currentIds.has(id)) ?? []

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              {t(
                "components.evaluations.criteria_pass_rates.columns.criterion"
              )}
            </TableHead>
            <TableHead>
              {t(
                "components.evaluations.criteria_pass_rates.columns.pass_rate"
              )}
            </TableHead>
            {baseline ? (
              <>
                <TableHead>
                  {t(
                    "components.evaluations.criteria_pass_rates.columns.baseline"
                  )}
                </TableHead>
                <TableHead>
                  {t(
                    "components.evaluations.criteria_pass_rates.columns.delta"
                  )}
                </TableHead>
              </>
            ) : null}
            <TableHead>
              {t("components.evaluations.criteria_pass_rates.columns.passed")}
            </TableHead>
            <TableHead>
              {t("components.evaluations.criteria_pass_rates.columns.failed")}
            </TableHead>
            <TableHead>
              {t(
                "components.evaluations.criteria_pass_rates.columns.not_applicable"
              )}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {run.criteriaSummary.map((criterion) => {
            const previous = baselineById.get(criterion.id)

            return (
              <TableRow key={criterion.id}>
                <TableCell className="max-w-md whitespace-normal">
                  <div className="font-medium">{criterion.name}</div>
                  <div className="text-muted-foreground">
                    {criterion.description}
                  </div>
                </TableCell>
                <TableCell>
                  <PassRateBar rate={criterion.passRate} />
                </TableCell>
                {baseline ? (
                  <>
                    <TableCell>
                      <PassRateBar rate={previous?.passRate ?? null} />
                    </TableCell>
                    <TableCell>
                      <PassRateDelta
                        current={criterion.passRate}
                        baseline={previous?.passRate ?? null}
                      />
                    </TableCell>
                  </>
                ) : null}
                <TableCell className="tabular-nums">
                  {criterion.passed}
                </TableCell>
                <TableCell className="tabular-nums">
                  {criterion.failed}
                </TableCell>
                <TableCell className="tabular-nums">
                  {criterion.notApplicable}
                </TableCell>
              </TableRow>
            )
          })}
          {baselineOnly.map((criterion) => (
            <TableRow key={criterion.id} className="text-muted-foreground">
              <TableCell className="max-w-md whitespace-normal">
                <div className="font-medium">{criterion.name}</div>
                <div>
                  {t(
                    "components.evaluations.criteria_pass_rates.only_in_baseline"
                  )}
                </div>
              </TableCell>
              <TableCell>
                <PassRateBar rate={null} />
              </TableCell>
              <TableCell>
                <PassRateBar rate={criterion.passRate} />
              </TableCell>
              <TableCell>—</TableCell>
              <TableCell>—</TableCell>
              <TableCell>—</TableCell>
              <TableCell>—</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
