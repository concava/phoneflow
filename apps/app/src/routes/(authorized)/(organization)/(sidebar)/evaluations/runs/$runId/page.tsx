import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { BanIcon } from "lucide-react"
import { z } from "zod"

import { getRunPassRate } from "@workspace/shared/api/evaluations/summary"
import type {
  CancelEvaluationRunResponse,
  EvaluationResultListResponse,
  EvaluationRunListResponse,
  EvaluationRunResponse,
} from "@workspace/shared/api/evaluations/types"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import { CallDetailSheet } from "@/components/calls/call-detail-sheet"
import { CriteriaPassRates } from "@/components/evaluations/criteria-pass-rates"
import {
  formatPassRate,
  formatRunVersionLabel,
  isRunActive,
  RUN_POLL_INTERVAL_MS,
  runQueryKey,
  runResultsQueryKey,
  suiteRunsQueryKey,
  suitesQueryKey,
} from "@/components/evaluations/helpers"
import { ResultsTable } from "@/components/evaluations/results-table"
import { RunStatusBadge } from "@/components/evaluations/run-status-badge"
import { formatAgentName } from "@/components/helpers"
import { UserDateTime } from "@/components/user-timezone-provider"
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { useTranslation } from "@/lib/i18n"

const NO_COMPARISON = "none"

const runPageSearchSchema = z.object({
  callId: z.uuid().optional(),
  compare: z.uuid().optional(),
})

export const Route = createFileRoute(
  "/(authorized)/(organization)/(sidebar)/evaluations/runs/$runId/"
)({
  validateSearch: runPageSearchSchema,
  component: Page,
})

function fetchRun(runId: string) {
  return api.get<EvaluationRunResponse>(`/evaluations/runs/${runId}`)
}

function Header({ run }: { run: EvaluationRunResponse }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canRun = useCheckPermission({ evaluation: ["run"] })

  const cancelMutation = useMutation({
    mutationFn: () =>
      api.post<CancelEvaluationRunResponse, never>(
        `/evaluations/runs/${run.id}/cancel`,
        {}
      ),
    onSuccess: () => {
      toast.success(t("routes.evaluations_run.toasts.cancelled"))
      queryClient.invalidateQueries({ queryKey: runQueryKey(run.id) })
      queryClient.invalidateQueries({ queryKey: suitesQueryKey() })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <header className="flex h-18 items-center gap-2 px-5">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
      />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/evaluations" />}>
              {t("routes.evaluations.breadcrumb")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {run.suite ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={
                    <Link
                      to="/evaluations/$suiteId"
                      params={{ suiteId: run.suite.id }}
                    />
                  }
                >
                  {run.suite.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          ) : null}
          <BreadcrumbItem>
            <BreadcrumbPage>
              <UserDateTime value={run.createdAt} />
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {isRunActive(run.status) ? (
        <div className="ml-auto">
          <Button
            variant="outline"
            disabled={!canRun || cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
          >
            {cancelMutation.isPending ? <Spinner /> : <BanIcon />}
            {t("routes.evaluations_run.cancel")}
          </Button>
        </div>
      ) : null}
    </header>
  )
}

function Stat({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{children}</span>
    </div>
  )
}

function RunStats({ run }: { run: EvaluationRunResponse }) {
  const { t } = useTranslation()
  const judged = run.completedCount + run.failedCount

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Stat label={t("routes.evaluations_run.stats.status")}>
        <RunStatusBadge status={run.status} />
      </Stat>
      <Stat label={t("routes.evaluations_run.stats.agent")}>
        {formatAgentName(run.suite?.agent, t)}
      </Stat>
      <Stat label={t("routes.evaluations_run.stats.version")}>
        {formatRunVersionLabel(run.agentVersion, t)}
      </Stat>
      <Stat label={t("routes.evaluations_run.stats.period")}>
        {run.callsFrom || run.callsTo ? (
          <>
            {run.callsFrom ? <UserDateTime value={run.callsFrom} /> : "…"}
            {" – "}
            {run.callsTo ? <UserDateTime value={run.callsTo} /> : "…"}
          </>
        ) : (
          t("routes.evaluations_run.stats.all_dates")
        )}
      </Stat>
      <Stat label={t("routes.evaluations_run.stats.judged")}>
        {judged}/{run.totalCount}
        {run.failedCount > 0
          ? ` · ${t("routes.evaluations_run.stats.errors", {
              count: run.failedCount,
            })}`
          : null}
      </Stat>
      <Stat label={t("routes.evaluations_run.stats.pass_rate")}>
        {formatPassRate(getRunPassRate(run))}
      </Stat>
    </div>
  )
}

function Comparison({ run }: { run: EvaluationRunResponse }) {
  const { t } = useTranslation()
  const { compare } = Route.useSearch()
  const navigate = Route.useNavigate()

  const { data: runs = [] } = useQuery({
    queryKey: suiteRunsQueryKey(run.suiteId),
    queryFn: () =>
      api.get<EvaluationRunListResponse>(
        `/evaluations/suites/${run.suiteId}/runs`
      ),
  })

  const { data: comparedRun } = useQuery({
    queryKey: runQueryKey(compare ?? ""),
    queryFn: () => fetchRun(compare ?? ""),
    enabled: Boolean(compare),
    refetchInterval: (query) =>
      isRunActive(query.state.data?.status) ? RUN_POLL_INTERVAL_MS : false,
  })

  // A hand-edited URL could point at a run of another suite.
  const baseline =
    comparedRun?.suiteId === run.suiteId && comparedRun.id !== run.id
      ? comparedRun
      : undefined
  const otherRuns = runs.filter((item) => item.id !== run.id)
  const selectedRun = otherRuns.find((item) => item.id === baseline?.id)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">
          {t("routes.evaluations_run.pass_rate_per_criterion")}
        </h2>
        <Select
          value={baseline?.id ?? NO_COMPARISON}
          onValueChange={(value) =>
            navigate({
              search: (search) => ({
                ...search,
                compare:
                  value === NO_COMPARISON ? undefined : (value ?? undefined),
              }),
            })
          }
        >
          <SelectTrigger className="w-72">
            <SelectValue>
              {selectedRun ? (
                <span className="truncate">
                  {formatRunVersionLabel(selectedRun.agentVersion, t)} ·{" "}
                  <UserDateTime value={selectedRun.createdAt} />
                </span>
              ) : (
                t("routes.evaluations_run.compare_placeholder")
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_COMPARISON}>
              {t("routes.evaluations_run.compare_none")}
            </SelectItem>
            {otherRuns.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {formatRunVersionLabel(item.agentVersion, t)} ·{" "}
                <UserDateTime value={item.createdAt} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <CriteriaPassRates run={run} baseline={baseline} />
      {baseline ? (
        <p className="text-sm text-muted-foreground">
          {t("routes.evaluations_run.compare_note")}
        </p>
      ) : null}
    </section>
  )
}

function Page() {
  const { t } = useTranslation()
  const { runId } = Route.useParams()
  const { callId } = Route.useSearch()
  const navigate = Route.useNavigate()

  const { data: run } = useSuspenseQuery({
    queryKey: runQueryKey(runId),
    queryFn: () => fetchRun(runId),
    refetchInterval: (query) =>
      isRunActive(query.state.data?.status) ? RUN_POLL_INTERVAL_MS : false,
  })

  const { data: results } = useSuspenseQuery({
    queryKey: runResultsQueryKey(runId),
    queryFn: () =>
      api.get<EvaluationResultListResponse>(
        `/evaluations/runs/${runId}/results`
      ),
    refetchInterval: isRunActive(run.status) ? RUN_POLL_INTERVAL_MS : false,
  })

  return (
    <>
      <title>{t("routes.evaluations_run.page_title")}</title>
      <Header run={run} />
      <div className="flex flex-col gap-6 p-5 pt-0">
        <RunStats run={run} />
        <Comparison run={run} />
        <ResultsTable
          runId={run.id}
          criteria={run.criteria}
          results={results}
          onOpenCall={(nextCallId) =>
            navigate({
              search: (search) => ({ ...search, callId: nextCallId }),
            })
          }
        />
      </div>
      <CallDetailSheet
        callId={callId}
        open={Boolean(callId)}
        onClose={() =>
          navigate({ search: (search) => ({ ...search, callId: undefined }) })
        }
      />
    </>
  )
}
