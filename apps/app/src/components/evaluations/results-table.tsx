import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MinusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react"
import { Fragment, useState } from "react"

import { getCallOutcome } from "@workspace/shared/api/evaluations/summary"
import type {
  EvaluationCriterion,
  EvaluationResultError,
  EvaluationResultListItem,
  EvaluationResultListResponse,
  EvaluationVerdict,
  RejudgeEvaluationResultsRequest,
  RejudgeEvaluationResultsResponse,
} from "@workspace/shared/api/evaluations/types"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { runQueryKey } from "@/components/evaluations/helpers"
import { formatAgentVersionLabel } from "@/components/helpers"
import { UserDateTime } from "@/components/user-timezone-provider"
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { type TFunction, useTranslation } from "@/lib/i18n"

function errorLabel(error: EvaluationResultError | null, t: TFunction) {
  const labels: Record<EvaluationResultError, string> = {
    llm_not_configured: t(
      "components.evaluations.results_table.errors.llm_not_configured"
    ),
    llm_failed: t("components.evaluations.results_table.errors.llm_failed"),
    invalid_output: t(
      "components.evaluations.results_table.errors.invalid_output"
    ),
    call_unavailable: t(
      "components.evaluations.results_table.errors.call_unavailable"
    ),
    cancelled: t("components.evaluations.results_table.errors.cancelled"),
    enqueue_failed: t(
      "components.evaluations.results_table.errors.enqueue_failed"
    ),
  }

  return error ? labels[error] : t("common.errors.generic")
}

function OutcomeBadge({ result }: { result: EvaluationResultListItem }) {
  const { t } = useTranslation()

  if (result.status === "pending") {
    return (
      <Badge variant="outline">
        {t("components.evaluations.results_table.outcome.pending")}
      </Badge>
    )
  }

  if (result.status === "failed") {
    return (
      <Badge variant="outline">
        {result.error === "cancelled"
          ? t("components.evaluations.run_status.cancelled")
          : t("components.evaluations.results_table.outcome.error")}
      </Badge>
    )
  }

  const outcome = getCallOutcome(result.verdicts ?? [])

  if (outcome === "passed") {
    return (
      <Badge variant="secondary">
        {t("components.evaluations.results_table.outcome.passed")}
      </Badge>
    )
  }

  if (outcome === "failed") {
    return (
      <Badge variant="destructive">
        {t("components.evaluations.results_table.outcome.failed")}
      </Badge>
    )
  }

  return (
    <Badge variant="outline">
      {t("components.evaluations.results_table.outcome.inconclusive")}
    </Badge>
  )
}

function VerdictIcon({ passed }: { passed: boolean | null }) {
  if (passed === true) {
    return (
      <CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
    )
  }

  if (passed === false) {
    return <XIcon className="size-4 text-destructive" />
  }

  return <MinusIcon className="size-4 text-muted-foreground" />
}

function VerdictIcons({
  criteria,
  verdicts,
}: {
  criteria: EvaluationCriterion[]
  verdicts: EvaluationVerdict[]
}) {
  return (
    <div className="flex items-center gap-1">
      {criteria.map((criterion) => {
        const verdict = verdicts.find(
          (item) => item.criterionId === criterion.id
        )

        return (
          <Tooltip key={criterion.id}>
            <TooltipTrigger render={<span />}>
              <VerdictIcon passed={verdict?.passed ?? null} />
            </TooltipTrigger>
            <TooltipContent>{criterion.name}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

function ResultDetails({
  result,
  criteria,
}: {
  result: EvaluationResultListItem
  criteria: EvaluationCriterion[]
}) {
  const { t } = useTranslation()

  if (result.status === "failed") {
    return (
      <p className="text-muted-foreground">{errorLabel(result.error, t)}</p>
    )
  }

  if (result.status === "pending") {
    return (
      <p className="text-muted-foreground">
        {t("components.evaluations.results_table.waiting")}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {criteria.map((criterion) => {
        const verdict = result.verdicts?.find(
          (item) => item.criterionId === criterion.id
        )

        if (!verdict) return null

        return (
          <div key={criterion.id} className="flex gap-2">
            <div className="pt-0.5">
              <VerdictIcon passed={verdict.passed} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="font-medium">{criterion.name}</div>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {verdict.reasoning}
              </p>
              {verdict.quote ? (
                <blockquote className="whitespace-pre-wrap border-l-2 pl-3 italic">
                  {verdict.quote}
                </blockquote>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ResultsTable({
  runId,
  criteria,
  results,
  onOpenCall,
}: {
  runId: string
  criteria: EvaluationCriterion[]
  results: EvaluationResultListResponse
  onOpenCall: (callId: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canRun = useCheckPermission({ evaluation: ["run"] })
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const isSelectable = (result: EvaluationResultListItem) =>
    canRun && result.status !== "pending" && Boolean(result.callId)

  const selectable = results.filter(isSelectable)
  const selected = selectable.filter((result) => selectedIds.has(result.id))
  const hasRejudgeableFailures = results.some(
    (result) => result.status === "failed" && result.callId
  )
  const allSelected =
    selectable.length > 0 && selected.length === selectable.length

  const rejudgeMutation = useMutation({
    mutationFn: (body: RejudgeEvaluationResultsRequest) =>
      api.post<
        RejudgeEvaluationResultsResponse,
        RejudgeEvaluationResultsRequest
      >(`/evaluations/runs/${runId}/rejudge`, { body }),
    onSuccess: ({ count }) => {
      toast.success(
        t("components.evaluations.results_table.toasts.rejudging", { count })
      )
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: runQueryKey(runId) })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">
          {t("components.evaluations.results_table.title")}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={
              !canRun || selected.length === 0 || rejudgeMutation.isPending
            }
            onClick={() =>
              rejudgeMutation.mutate({
                resultIds: selected.map((result) => result.id),
              })
            }
          >
            <RotateCcwIcon />
            {t("components.evaluations.results_table.rejudge_selected", {
              count: selected.length,
            })}
          </Button>
          <Button
            variant="outline"
            disabled={
              !canRun || !hasRejudgeableFailures || rejudgeMutation.isPending
            }
            onClick={() => rejudgeMutation.mutate({})}
          >
            {rejudgeMutation.isPending ? <Spinner /> : <RotateCcwIcon />}
            {t("components.evaluations.results_table.rejudge_failed")}
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  disabled={selectable.length === 0}
                  aria-label={t(
                    "components.evaluations.results_table.select_all"
                  )}
                  onCheckedChange={(checked) =>
                    setSelectedIds(
                      new Set(
                        checked ? selectable.map((result) => result.id) : []
                      )
                    )
                  }
                />
              </TableHead>
              <TableHead>
                {t("components.evaluations.results_table.columns.call")}
              </TableHead>
              <TableHead>
                {t("components.evaluations.results_table.columns.version")}
              </TableHead>
              <TableHead>
                {t("components.evaluations.results_table.columns.outcome")}
              </TableHead>
              <TableHead>
                {t("components.evaluations.results_table.columns.verdicts")}
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result) => {
              const expanded = expandedIds.has(result.id)

              return (
                <Fragment key={result.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => toggleExpanded(result.id)}
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(result.id)}
                        disabled={!isSelectable(result)}
                        aria-label={t(
                          "components.evaluations.results_table.select_result"
                        )}
                        onCheckedChange={(checked) =>
                          toggleSelected(result.id, Boolean(checked))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {result.call ? (
                        <button
                          type="button"
                          className="hover:underline"
                          onClick={(event) => {
                            event.stopPropagation()
                            if (result.call) onOpenCall(result.call.id)
                          }}
                        >
                          <UserDateTime value={result.call.startedAt} />
                        </button>
                      ) : (
                        <span className="text-muted-foreground">
                          {t(
                            "components.evaluations.results_table.deleted_call"
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {result.call
                        ? formatAgentVersionLabel(result.call.agentVersion, t)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <OutcomeBadge result={result} />
                    </TableCell>
                    <TableCell>
                      {result.status === "completed" ? (
                        <VerdictIcons
                          criteria={criteria}
                          verdicts={result.verdicts ?? []}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {expanded ? (
                        <ChevronDownIcon className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRightIcon className="size-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                  {expanded ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell />
                      <TableCell colSpan={5} className="whitespace-normal py-4">
                        <ResultDetails result={result} criteria={criteria} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
