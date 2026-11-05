import { useNavigate } from "@tanstack/react-router"
import { createColumnHelper } from "@tanstack/react-table"

import { getRunPassRate } from "@workspace/shared/api/evaluations/summary"
import type {
  EvaluationSuiteListItem,
  EvaluationSuiteListResponse,
} from "@workspace/shared/api/evaluations/types"
import { AgentReferenceLink } from "@/components/agents/agent-reference-link"
import {
  EvaluationDataTable,
  type evaluationTableFeatures,
} from "@/components/evaluations/evaluation-data-table"
import { formatPassRate } from "@/components/evaluations/helpers"
import { RunStatusBadge } from "@/components/evaluations/run-status-badge"
import { UserDateTime } from "@/components/user-timezone-provider"
import { type TFunction, useTranslation } from "@/lib/i18n"

const columnHelper = createColumnHelper<
  typeof evaluationTableFeatures,
  EvaluationSuiteListItem
>()

function getColumns(t: TFunction) {
  return columnHelper.columns([
    columnHelper.accessor("name", {
      header: t("components.evaluations.suites_data_table.columns.name"),
      cell: ({ row }) => row.original.name,
    }),
    columnHelper.display({
      id: "agent",
      header: t("components.evaluations.suites_data_table.columns.agent"),
      cell: ({ row }) => (
        <AgentReferenceLink
          agentId={row.original.agentId}
          agent={row.original.agent}
        />
      ),
    }),
    columnHelper.display({
      id: "criteria",
      header: t("components.evaluations.suites_data_table.columns.criteria"),
      cell: ({ row }) => row.original.criteria.length,
    }),
    columnHelper.display({
      id: "lastRun",
      header: t("components.evaluations.suites_data_table.columns.last_run"),
      cell: ({ row }) => {
        const run = row.original.runs[0]

        if (!run) {
          return (
            <span className="text-muted-foreground">
              {t("components.evaluations.suites_data_table.no_runs")}
            </span>
          )
        }

        return (
          <div className="flex items-center gap-2">
            <RunStatusBadge status={run.status} />
            <span className="tabular-nums">
              {formatPassRate(getRunPassRate(run))}
            </span>
          </div>
        )
      },
    }),
    columnHelper.display({
      id: "updatedAt",
      header: t("components.evaluations.suites_data_table.columns.updated"),
      cell: ({ row }) => <UserDateTime value={row.original.updatedAt} />,
    }),
  ])
}

export function SuitesDataTable({
  data,
}: {
  data: EvaluationSuiteListResponse
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <EvaluationDataTable
      data={data}
      columns={getColumns(t)}
      onRowClick={(suite) =>
        navigate({
          to: "/evaluations/$suiteId",
          params: { suiteId: suite.id },
        })
      }
    />
  )
}
