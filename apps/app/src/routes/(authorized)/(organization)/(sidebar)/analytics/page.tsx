import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { cn } from "cn"
import { CircleAlertIcon, PhoneOffIcon } from "lucide-react"
import { useMemo } from "react"
import { z } from "zod"

import type { CallAnalyticsResponse } from "@workspace/shared/api/calls/types"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@workspace/ui/components/breadcrumb"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { AnalyticsAgentsTable } from "@/components/analytics/analytics-agents-table"
import { AnalyticsCharts } from "@/components/analytics/analytics-charts"
import {
  AnalyticsFilters,
  type AnalyticsFilterValues,
  analyticsRangePresets,
} from "@/components/analytics/analytics-filters"
import { AnalyticsStatTiles } from "@/components/analytics/analytics-stat-tiles"
import { useUserTimeZone } from "@/components/user-timezone-provider"
import { api } from "@/lib/api"
import { env } from "@/lib/env"
import { useTranslation } from "@/lib/i18n"
import { zonedDateTimeToIso, zonedDayBounds } from "@/lib/time"

const DAY_MS = 24 * 60 * 60 * 1000

const presetDays = { today: 1, "7d": 7, "30d": 30, "90d": 90 }

const analyticsSearchSchema = z.object({
  range: z.enum(analyticsRangePresets).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  agentIds: z.array(z.uuid()).optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  channel: z.enum(["phone_call", "web_call"]).optional(),
})

function resolveRange(filters: AnalyticsFilterValues, timeZone: string) {
  const endOfDay = (iso: string) =>
    // zonedDayBounds ends at 23:59:59; keep the last second of the day whole.
    new Date(Date.parse(iso) + 999).toISOString()

  if (filters.from) {
    const fromDate = new Date(filters.from)

    return {
      from: filters.from,
      to: endOfDay(filters.to ?? zonedDayBounds(fromDate, timeZone).end),
    }
  }

  const now = new Date()
  const days = presetDays[filters.range ?? "30d"]
  // Local noon, so that stepping back whole days across a DST change cannot
  // land on a neighbouring date.
  const todayNoon = Date.parse(zonedDateTimeToIso(now, "12:00:00", timeZone))
  const firstDay = new Date(todayNoon - (days - 1) * DAY_MS)

  return {
    from: zonedDayBounds(firstDay, timeZone).start,
    to: endOfDay(zonedDayBounds(now, timeZone).end),
  }
}

function buildAnalyticsPath(
  filters: AnalyticsFilterValues,
  range: { from: string; to: string },
  timeZone: string
) {
  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
    timezone: timeZone,
  })

  if (filters.agentIds?.length) {
    params.set("agentIds", filters.agentIds.join(","))
  }

  if (filters.direction) {
    params.set("direction", filters.direction)
  }

  if (filters.channel) {
    params.set("channel", filters.channel)
  }

  return `/calls/analytics?${params.toString()}`
}

export const Route = createFileRoute(
  "/(authorized)/(organization)/(sidebar)/analytics/"
)({
  validateSearch: analyticsSearchSchema,
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
            <BreadcrumbPage>{t("routes.analytics.breadcrumb")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}

function AnalyticsSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-88 rounded-xl" />
        ))}
      </div>
    </>
  )
}

function Page() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const timeZone = useUserTimeZone()
  const range = useMemo(
    () => resolveRange(search, timeZone),
    [search, timeZone]
  )

  const { data, error, isPending, isPlaceholderData } = useQuery({
    queryKey: ["calls", "analytics", search, range, timeZone],
    queryFn: () =>
      api.get<CallAnalyticsResponse>(
        buildAnalyticsPath(search, range, timeZone)
      ),
    placeholderData: keepPreviousData,
    // A rejected range would otherwise sit on the skeleton through every retry.
    retry: false,
  })

  return (
    <>
      <title>{t("routes.analytics.page_title")}</title>
      <Header />
      <div className="flex flex-col gap-3 p-5 pt-0">
        <AnalyticsFilters
          filters={search}
          resolvedRange={range}
          onFiltersChange={(nextFilters) => {
            navigate({ search: nextFilters })
          }}
        />
        <p className="mb-2 text-xs text-muted-foreground">
          {t("components.analytics.filters.timezone_note", { timeZone })}
        </p>
        {error ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlertIcon />
              </EmptyMedia>
              <EmptyTitle>{t("components.analytics.error.title")}</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : isPending ? (
          <AnalyticsSkeleton />
        ) : data.totals.calls === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PhoneOffIcon />
              </EmptyMedia>
              <EmptyTitle>{t("components.analytics.empty.title")}</EmptyTitle>
              <EmptyDescription>
                {t("components.analytics.empty.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            className={cn(
              "flex flex-col gap-3 transition-opacity",
              isPlaceholderData && "opacity-50"
            )}
          >
            <AnalyticsStatTiles totals={data.totals} />
            <AnalyticsCharts
              series={data.series}
              granularity={data.granularity}
              timeZone={timeZone}
              showCost={env.IS_CLOUD}
            />
            <AnalyticsAgentsTable agents={data.agents} />
          </div>
        )}
      </div>
    </>
  )
}
