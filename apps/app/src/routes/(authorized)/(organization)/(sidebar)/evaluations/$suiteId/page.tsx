import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { PencilIcon, PlayIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import type {
  EvaluationRunListResponse,
  EvaluationSuiteResponse,
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
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { AgentReferenceLink } from "@/components/agents/agent-reference-link"
import { DeleteSuiteDialog } from "@/components/evaluations/delete-suite-dialog"
import {
  isRunActive,
  RUN_POLL_INTERVAL_MS,
  suiteQueryKey,
  suiteRunsQueryKey,
} from "@/components/evaluations/helpers"
import { RunsDataTable } from "@/components/evaluations/runs-data-table"
import { StartRunDialog } from "@/components/evaluations/start-run-dialog"
import { SuiteEditorDialog } from "@/components/evaluations/suite-editor-dialog"
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { useTranslation } from "@/lib/i18n"

export const Route = createFileRoute(
  "/(authorized)/(organization)/(sidebar)/evaluations/$suiteId/"
)({
  component: Page,
})

function Header({ suite }: { suite: EvaluationSuiteResponse }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canUpdate = useCheckPermission({ evaluation: ["update"] })
  const canDelete = useCheckPermission({ evaluation: ["delete"] })
  const canRun = useCheckPermission({ evaluation: ["run"] })
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [startOpen, setStartOpen] = useState(false)

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
          <BreadcrumbItem>
            <BreadcrumbPage>{suite.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex space-x-3">
        <Button
          variant="outline"
          size="icon"
          disabled={!canDelete}
          aria-label={t("common.actions.delete")}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2Icon />
        </Button>
        <Button
          variant="outline"
          disabled={!canUpdate}
          onClick={() => setEditOpen(true)}
        >
          <PencilIcon />
          {t("common.actions.edit")}
        </Button>
        <Button
          disabled={!canRun || !suite.agent}
          onClick={() => setStartOpen(true)}
        >
          <PlayIcon />
          {t("routes.evaluations_suite.start_run")}
        </Button>
      </div>
      <SuiteEditorDialog
        suite={suite}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteSuiteDialog
        suite={suite}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => navigate({ to: "/evaluations" })}
      />
      <StartRunDialog
        suiteId={suite.id}
        agentId={suite.agentId}
        open={startOpen}
        onOpenChange={setStartOpen}
      />
    </header>
  )
}

function Page() {
  const { t } = useTranslation()
  const { suiteId } = Route.useParams()

  const { data: suite } = useSuspenseQuery({
    queryKey: suiteQueryKey(suiteId),
    queryFn: () =>
      api.get<EvaluationSuiteResponse>(`/evaluations/suites/${suiteId}`),
  })

  const { data: runs } = useSuspenseQuery({
    queryKey: suiteRunsQueryKey(suiteId),
    queryFn: () =>
      api.get<EvaluationRunListResponse>(`/evaluations/suites/${suiteId}/runs`),
    refetchInterval: (query) =>
      query.state.data?.some((run) => isRunActive(run.status))
        ? RUN_POLL_INTERVAL_MS
        : false,
  })

  return (
    <>
      <title>
        {t("routes.evaluations_suite.page_title", { name: suite.name })}
      </title>
      <Header suite={suite} />
      <div className="flex flex-col gap-6 p-5 pt-0">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">
              {t("routes.evaluations_suite.criteria")}
            </h2>
            <span className="text-sm text-muted-foreground">
              <AgentReferenceLink agentId={suite.agentId} agent={suite.agent} />
            </span>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {suite.criteria.map((criterion) => (
              <li key={criterion.id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{criterion.name}</div>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {criterion.description}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">{t("routes.evaluations_suite.runs")}</h2>
          <RunsDataTable data={runs} />
        </section>
      </div>
    </>
  )
}
