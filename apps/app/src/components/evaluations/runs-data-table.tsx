import { useNavigate } from "@tanstack/react-router"
import { createColumnHelper } from "@tanstack/react-table"

import { getRunPassRate } from "@workspace/shared/api/evaluations/summary"
import type {
  EvaluationRunListResponse,
  EvaluationRunSummary,
} from "@workspace/shared/api/evaluations/types"
import {
  EvaluationDataTable,
  type evaluationTableFeatures,
} from "@/components/evaluations/evaluation-data-table"
import {
  formatPassRate,
  formatRunVersionLabel,
} from "@/components/evaluations/helpers"
import { RunStatusBadge } from "@/components/evaluations/run-status-badge"
import { UserDateTime } from "@/components/user-timezone-provider"
import { type TFunction, useTranslation } from "@/lib/i18n"

const columnHelper = createColumnHelper<
  typeof evaluationTableFeatures,
  EvaluationRunSummary
>()

function getColumns(t: TFunction) {
  return columnHelper.columns([
    columnHelper.display({
      id: "createdAt",
      header: t("components.evaluations.runs_data_table.columns.started"),
      cell: ({ row }) => <UserDateTime value={row.original.createdAt} />,
    }),
    columnHelper.display({
      id: "status",
      header: t("components.evaluations.runs_data_table.columns.status"),
      cell: ({ row }) => <RunStatusBadge status={row.original.status} />,
    }),
    columnHelper.display({
      id: "version",
      header: t("components.evaluations.runs_data_table.columns.version"),
      cell: ({ row }) => formatRunVersionLabel(row.original.agentVersion, t),
    }),
    columnHelper.display({
      id: "progress",
      header: t("components.evaluations.runs_data_table.columns.calls"),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.completedCount + row.original.failedCount}/
          {row.original.totalCount}
        </span>
      ),
    }),
    columnHelper.display({
      id: "passRate",
      header: t("components.evaluations.runs_data_table.columns.pass_rate"),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatPassRate(getRunPassRate(row.original))}
        </span>
      ),
    }),
    columnHelper.display({
      id: "errors",
      header: t("components.evaluations.runs_data_table.columns.errors"),
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.failedCount}</span>
      ),
    }),
  ])
}

export function RunsDataTable({ data }: { data: EvaluationRunListResponse }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <EvaluationDataTable
      data={data}
      columns={getColumns(t)}
      onRowClick={(run) =>
        navigate({
          to: "/evaluations/runs/$runId",
          params: { runId: run.id },
        })
      }
    />
  )
}
