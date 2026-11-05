import { cn } from "cn"

import type { CallAnalyticsMetrics } from "@workspace/shared/api/calls/types"
import { Card } from "@workspace/ui/components/card"
import {
  formatCount,
  formatRate,
  NO_VALUE,
} from "@/components/analytics/analytics-format"
import { formatCallCost } from "@/components/calls/call-cost-breakdown"
import { env } from "@/lib/env"
import { useTranslation } from "@/lib/i18n"
import { formatDurationMs } from "@/lib/time"

function StatTile({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <Card size="sm" className="gap-1 px-4">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </Card>
  )
}

export function AnalyticsStatTiles({
  totals,
}: {
  totals: CallAnalyticsMetrics
}) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2",
        env.IS_CLOUD ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-4"
      )}
    >
      <StatTile
        label={t("components.analytics.tiles.calls.label")}
        value={formatCount(totals.calls)}
        detail={t("components.analytics.tiles.calls.detail", {
          answered: formatCount(totals.answered),
          noAnswer: formatCount(totals.noAnswer),
        })}
      />
      <StatTile
        label={t("components.analytics.tiles.answer_rate.label")}
        value={formatRate(totals.answerRate)}
        detail={t("components.analytics.tiles.answer_rate.detail")}
      />
      <StatTile
        label={t("components.analytics.tiles.average_duration.label")}
        value={
          totals.averageAnsweredDurationMs === null
            ? NO_VALUE
            : formatDurationMs(totals.averageAnsweredDurationMs)
        }
        detail={t("components.analytics.tiles.average_duration.detail")}
      />
      <StatTile
        label={t("components.analytics.tiles.total_duration.label")}
        value={formatDurationMs(totals.totalDurationMs)}
        detail={t("components.analytics.tiles.total_duration.detail")}
      />
      {env.IS_CLOUD ? (
        <StatTile
          label={t("components.analytics.tiles.total_cost.label")}
          value={
            totals.totalCost === null
              ? NO_VALUE
              : formatCallCost(totals.totalCost)
          }
          detail={t("components.analytics.tiles.total_cost.detail")}
        />
      ) : null}
    </div>
  )
}
