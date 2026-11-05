import type { CallAnalyticsAgent } from "@workspace/shared/api/calls/types"
import { Card, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { formatCount, NO_VALUE } from "@/components/analytics/analytics-format"
import { formatCallCost } from "@/components/calls/call-cost-breakdown"
import { env } from "@/lib/env"
import { useTranslation } from "@/lib/i18n"
import { formatDurationMs } from "@/lib/time"

const numericCell = "text-right tabular-nums"

export function AnalyticsAgentsTable({
  agents,
}: {
  agents: CallAnalyticsAgent[]
}) {
  const { t } = useTranslation()

  return (
    <Card size="sm" className="pb-0">
      <CardHeader>
        <CardTitle>{t("components.analytics.agents.title")}</CardTitle>
      </CardHeader>
      <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
        <TableHeader>
          <TableRow>
            <TableHead>{t("components.analytics.agents.agent")}</TableHead>
            <TableHead className="text-right">
              {t("components.analytics.agents.calls")}
            </TableHead>
            <TableHead className="text-right">
              {t("components.analytics.agents.answered")}
            </TableHead>
            <TableHead className="text-right">
              {t("components.analytics.agents.average_duration")}
            </TableHead>
            {env.IS_CLOUD ? (
              <TableHead className="text-right">
                {t("components.analytics.agents.cost")}
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => (
            <TableRow key={agent.agentId}>
              <TableCell className="max-w-72 truncate">
                {agent.agentName ?? (
                  <span className="text-muted-foreground">
                    {t("components.analytics.agents.deleted")}
                  </span>
                )}
              </TableCell>
              <TableCell className={numericCell}>
                {formatCount(agent.calls)}
              </TableCell>
              <TableCell className={numericCell}>
                {formatCount(agent.answered)}
              </TableCell>
              <TableCell className={numericCell}>
                {agent.averageAnsweredDurationMs === null
                  ? NO_VALUE
                  : formatDurationMs(agent.averageAnsweredDurationMs)}
              </TableCell>
              {env.IS_CLOUD ? (
                <TableCell className={numericCell}>
                  {agent.totalCost === null
                    ? NO_VALUE
                    : formatCallCost(agent.totalCost)}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
