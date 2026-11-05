import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"

import { Skeleton } from "@workspace/ui/components/skeleton"
import { WebhooksSettings } from "@/components/settings/webhooks/webhooks-settings"
import { useTranslation } from "@/lib/i18n"

export const Route = createFileRoute(
  "/(authorized)/(organization)/(sidebar)/settings/webhooks/"
)({
  component: Page,
})

function WebhooksSettingsSkeleton() {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-60 w-full rounded-md" />
    </div>
  )
}

function Page() {
  const { t } = useTranslation()
  return (
    <>
      <title>{t("routes.settings.webhooks.page_title")}</title>
      <Suspense fallback={<WebhooksSettingsSkeleton />}>
        <WebhooksSettings />
      </Suspense>
    </>
  )
}
