import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import type { KnowledgeBaseListResponse } from "@workspace/shared/api/knowledge-bases/types"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@workspace/ui/components/breadcrumb"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { CreateKnowledgeBaseForm } from "@/components/knowledge-bases/create-knowledge-base-form"
import { KnowledgeBaseSheet } from "@/components/knowledge-bases/knowledge-base-sheet"
import { KnowledgeBasesTable } from "@/components/knowledge-bases/knowledge-bases-table"
import { api } from "@/lib/api"
import { useTranslation } from "@/lib/i18n"

const knowledgeBasesPageSearchSchema = z
  .object({
    knowledgeBaseId: z.uuid().optional(),
  })
  .strict()

export const Route = createFileRoute(
  "/(authorized)/(organization)/(sidebar)/knowledge-bases/"
)({
  validateSearch: knowledgeBasesPageSearchSchema,
  component: Page,
})

function Header() {
  const { t } = useTranslation()

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
              {t("routes.knowledge_bases.breadcrumb")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex space-x-3">
        <CreateKnowledgeBaseForm />
      </div>
    </header>
  )
}

function Page() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: knowledgeBases } = useSuspenseQuery({
    queryKey: ["knowledge-bases"],
    queryFn: () => api.get<KnowledgeBaseListResponse>("/knowledge-bases"),
  })

  return (
    <>
      <title>{t("routes.knowledge_bases.page_title")}</title>
      <Header />
      <div className="p-5 pt-0">
        <KnowledgeBasesTable
          data={knowledgeBases}
          onSelect={(knowledgeBaseId) => {
            navigate({ search: (prev) => ({ ...prev, knowledgeBaseId }) })
          }}
        />
        <KnowledgeBaseSheet
          knowledgeBaseId={search.knowledgeBaseId}
          open={Boolean(search.knowledgeBaseId)}
          onClose={() => {
            navigate({ search: { ...search, knowledgeBaseId: undefined } })
          }}
        />
      </div>
    </>
  )
}
