import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { useState } from "react"

import type { EvaluationSuiteListResponse } from "@workspace/shared/api/evaluations/types"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@workspace/ui/components/breadcrumb"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { suitesQueryKey } from "@/components/evaluations/helpers"
import { SuiteEditorDialog } from "@/components/evaluations/suite-editor-dialog"
import { SuitesDataTable } from "@/components/evaluations/suites-data-table"
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { useTranslation } from "@/lib/i18n"

function suitesQueryOptions() {
  return {
    queryKey: suitesQueryKey(),
    queryFn: () => api.get<EvaluationSuiteListResponse>("/evaluations/suites"),
  }
}

export const Route = createFileRoute(
  "/(authorized)/(organization)/(sidebar)/evaluations/"
)({
  component: Page,
})

function Header() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canCreate = useCheckPermission({ evaluation: ["create"] })
  const [createOpen, setCreateOpen] = useState(false)

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
            <BreadcrumbPage>
              {t("routes.evaluations.breadcrumb")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto">
        <Button disabled={!canCreate} onClick={() => setCreateOpen(true)}>
          <PlusIcon />
          {t("routes.evaluations.create_suite")}
        </Button>
      </div>
      <SuiteEditorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(suiteId) =>
          navigate({ to: "/evaluations/$suiteId", params: { suiteId } })
        }
      />
    </header>
  )
}

function Page() {
  const { t } = useTranslation()
  const { data: suites } = useSuspenseQuery(suitesQueryOptions())

  return (
    <>
      <title>{t("routes.evaluations.page_title")}</title>
      <Header />
      <div className="p-5 pt-0">
        <SuitesDataTable data={suites} />
      </div>
    </>
  )
}
