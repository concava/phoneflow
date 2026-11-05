import { cn } from "cn"
import { ChartColumnIcon, TableIcon } from "lucide-react"
import { type ReactNode, useState } from "react"
import {
  Bar,
  BarChart,
  type BarShapeProps,
  BarStack,
  CartesianGrid,
  Line,
  LineChart,
  Rectangle,
  XAxis,
  YAxis,
} from "recharts"

import type {
  CallAnalyticsBucket,
  CallAnalyticsGranularity,
} from "@workspace/shared/api/calls/types"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui/components/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  formatBucketLabel,
  formatBucketTick,
  formatCostAxis,
  formatCount,
  formatRate,
  NO_VALUE,
} from "@/components/analytics/analytics-format"
import { formatCallCost } from "@/components/calls/call-cost-breakdown"
import { useTranslation } from "@/lib/i18n"
import { formatDurationMs } from "@/lib/time"

// Picked with the dataviz palette validator against the card surface of each
// theme. Aqua is under 3:1 on white, one reason every chart has a table view.
const seriesColors = {
  first: { light: "#2a78d6", dark: "#3987e5" },
  second: { light: "#eb6834", dark: "#d95926" },
  third: { light: "#1baf7a", dark: "#199e70" },
}

const CHART_HEIGHT = "h-64"
const BAR_MAX_WIDTH = 24
const BAR_END_RADIUS: [number, number, number, number] = [4, 4, 0, 0]
const STACK_GAP = 2

type ChartRow = CallAnalyticsBucket & { other: number }

type TableColumn = {
  header: string
  cell: (row: ChartRow) => string
}

type ChartScope = {
  rows: ChartRow[]
  granularity: CallAnalyticsGranularity
  timeZone: string
}

function ChartCard({
  title,
  description,
  columns,
  scope,
  isEmpty = false,
  className,
  children,
}: {
  title: string
  description: string
  columns: TableColumn[]
  scope: ChartScope
  isEmpty?: boolean
  className?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [showTable, setShowTable] = useState(false)
  const toggleLabel = t(
    showTable
      ? "components.analytics.charts.show_chart"
      : "components.analytics.charts.show_table"
  )

  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={toggleLabel}
            title={toggleLabel}
            aria-pressed={showTable}
            onClick={() => setShowTable((current) => !current)}
          >
            {showTable ? <ChartColumnIcon /> : <TableIcon />}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {showTable ? (
          <div className={cn(CHART_HEIGHT, "overflow-y-auto")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t("components.analytics.charts.bucket")}
                  </TableHead>
                  {columns.map((column) => (
                    <TableHead key={column.header} className="text-right">
                      {column.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {scope.rows.map((row) => (
                  <TableRow key={row.bucketStart}>
                    <TableCell>
                      {formatBucketLabel(
                        row.bucketStart,
                        scope.granularity,
                        scope.timeZone
                      )}
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell
                        key={column.header}
                        className="text-right tabular-nums"
                      >
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : isEmpty ? (
          <div
            className={cn(
              CHART_HEIGHT,
              "flex items-center justify-center text-muted-foreground"
            )}
          >
            {t("components.analytics.charts.no_data")}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

function bucketAxisProps({ granularity, timeZone }: ChartScope) {
  return {
    dataKey: "bucketStart",
    tickLine: false,
    tickMargin: 8,
    minTickGap: 32,
    axisLine: { stroke: "var(--border)" },
    tickFormatter: (value: string) =>
      formatBucketTick(value, granularity, timeZone),
  }
}

const valueAxisProps = {
  tickLine: false,
  axisLine: false,
  width: "auto",
} as const

const AXIS_MAX_INTERVALS = 4

function axisFromStep(max: number, step: number) {
  const intervals = Math.max(1, Math.ceil(max / step))

  return {
    domain: [0, intervals * step] as [number, number],
    ticks: Array.from({ length: intervals + 1 }, (_, index) => index * step),
  }
}

function niceAxis(max: number, minStep = 0) {
  if (max <= 0) {
    return axisFromStep(1, 1)
  }

  const roughStep = max / AXIS_MAX_INTERVALS
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const multiplier =
    [1, 2, 5, 10].find((value) => value * magnitude >= roughStep) ?? 10

  return axisFromStep(max, Math.max(multiplier * magnitude, minStep))
}

function TooltipRow({
  color,
  label,
  value,
}: {
  color?: string
  label: ReactNode
  value: string
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <div
        className="h-0.5 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="font-medium text-foreground tabular-nums">{value}</span>
      <span className="ml-auto pl-3 text-muted-foreground">{label}</span>
    </div>
  )
}

function bucketTooltip(
  config: ChartConfig,
  { granularity, timeZone }: ChartScope,
  formatValue: (value: number | null) => string
) {
  return (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) =>
            formatBucketLabel(
              payload[0]?.payload.bucketStart,
              granularity,
              timeZone
            )
          }
          formatter={(value, name, item) => (
            <TooltipRow
              color={item.color}
              label={config[String(name)]?.label ?? name}
              value={formatValue(typeof value === "number" ? value : null)}
            />
          )}
        />
      }
    />
  )
}

function VolumeChart({
  scope,
  className,
}: {
  scope: ChartScope
  className?: string
}) {
  const { t } = useTranslation()
  const config = {
    answered: {
      label: t("components.analytics.charts.volume.answered"),
      theme: seriesColors.first,
    },
    noAnswer: {
      label: t("components.analytics.charts.volume.no_answer"),
      theme: seriesColors.second,
    },
    other: {
      label: t("components.analytics.charts.volume.other"),
      theme: seriesColors.third,
    },
  } satisfies ChartConfig

  const segmentShape =
    (hasSegmentBelow: (row: ChartRow) => boolean) => (props: BarShapeProps) => {
      const height = props.height ?? 0
      const opensGap =
        height > STACK_GAP + 1 && hasSegmentBelow(props.payload as ChartRow)

      return (
        <Rectangle {...props} height={opensGap ? height - STACK_GAP : height} />
      )
    }

  return (
    <ChartCard
      className={className}
      title={t("components.analytics.charts.volume.title")}
      description={t("components.analytics.charts.volume.description")}
      scope={scope}
      columns={[
        {
          header: config.answered.label,
          cell: (row) => formatCount(row.answered),
        },
        {
          header: config.noAnswer.label,
          cell: (row) => formatCount(row.noAnswer),
        },
        { header: config.other.label, cell: (row) => formatCount(row.other) },
      ]}
    >
      <ChartContainer config={config} className={cn(CHART_HEIGHT, "w-full")}>
        <BarChart data={scope.rows} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis {...bucketAxisProps(scope)} />
          <YAxis
            {...valueAxisProps}
            {...niceAxis(Math.max(...scope.rows.map((row) => row.calls)), 1)}
          />
          {bucketTooltip(config, scope, (value) => formatCount(value ?? 0))}
          <ChartLegend content={<ChartLegendContent />} />
          <BarStack radius={BAR_END_RADIUS}>
            <Bar
              dataKey="answered"
              fill="var(--color-answered)"
              maxBarSize={BAR_MAX_WIDTH}
              isAnimationActive={false}
            />
            <Bar
              dataKey="noAnswer"
              fill="var(--color-noAnswer)"
              maxBarSize={BAR_MAX_WIDTH}
              isAnimationActive={false}
              shape={segmentShape((row) => row.answered > 0)}
            />
            <Bar
              dataKey="other"
              fill="var(--color-other)"
              maxBarSize={BAR_MAX_WIDTH}
              isAnimationActive={false}
              shape={segmentShape((row) => row.answered + row.noAnswer > 0)}
            />
          </BarStack>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}

function TrendLine({
  dataKey,
  label,
  scope,
  formatValue,
  yAxis,
}: {
  dataKey: "answerRate" | "averageAnsweredDurationMs"
  label: string
  scope: ChartScope
  formatValue: (value: number | null) => string
  yAxis: { domain: [number, number]; ticks: number[] }
}) {
  const config = {
    [dataKey]: { label, theme: seriesColors.first },
  } satisfies ChartConfig
  const { rows } = scope
  const isMissing = (index: number) =>
    index < 0 || index >= rows.length || rows[index][dataKey] === null
  const lastIndex = rows.findLastIndex((row) => row[dataKey] !== null)

  return (
    <ChartContainer config={config} className={cn(CHART_HEIGHT, "w-full")}>
      <LineChart data={rows} margin={{ top: 20, right: 8 }} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis {...bucketAxisProps(scope)} />
        <YAxis
          {...valueAxisProps}
          domain={yAxis.domain}
          ticks={yAxis.ticks}
          tickFormatter={(value: number) => formatValue(value)}
        />
        {bucketTooltip(config, scope, formatValue)}
        <Line
          dataKey={dataKey}
          type="linear"
          stroke={`var(--color-${dataKey})`}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          isAnimationActive={false}
          activeDot={{
            r: 4,
            fill: `var(--color-${dataKey})`,
            stroke: "var(--card)",
            strokeWidth: 2,
          }}
          // Buckets with no data leave a gap in the line, so a value with no
          // neighbours needs a marker or it would not be drawn at all.
          dot={({ cx, cy, index, key }) => {
            const isLast = index === lastIndex
            const isIsolated = isMissing(index - 1) && isMissing(index + 1)

            if (
              cy === undefined ||
              isMissing(index) ||
              (!isLast && !isIsolated)
            ) {
              return <g key={key} />
            }

            return (
              <g key={key}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill={`var(--color-${dataKey})`}
                  stroke="var(--card)"
                  strokeWidth={2}
                />
                {isLast ? (
                  <text
                    x={cx}
                    y={cy - 10}
                    textAnchor="end"
                    stroke="var(--card)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    className="fill-foreground text-xs font-medium"
                  >
                    {formatValue(rows[index][dataKey])}
                  </text>
                ) : null}
              </g>
            )
          }}
        />
      </LineChart>
    </ChartContainer>
  )
}

function AnswerRateChart({ scope }: { scope: ChartScope }) {
  const { t } = useTranslation()
  const label = t("components.analytics.charts.answer_rate.value")

  return (
    <ChartCard
      title={t("components.analytics.charts.answer_rate.title")}
      description={t("components.analytics.charts.answer_rate.description")}
      scope={scope}
      isEmpty={scope.rows.every((row) => row.answerRate === null)}
      columns={[{ header: label, cell: (row) => formatRate(row.answerRate) }]}
    >
      <TrendLine
        dataKey="answerRate"
        label={label}
        scope={scope}
        formatValue={formatRate}
        yAxis={{ domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1] }}
      />
    </ChartCard>
  )
}

const DURATION_TICK_STEPS_SECONDS = [
  1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200,
]

function durationAxis(maxMs: number) {
  const stepSeconds =
    DURATION_TICK_STEPS_SECONDS.find(
      (seconds) => maxMs / (seconds * 1000) <= AXIS_MAX_INTERVALS
    ) ?? Math.ceil(maxMs / 1000 / AXIS_MAX_INTERVALS)

  return axisFromStep(maxMs, stepSeconds * 1000)
}

function formatDuration(value: number | null) {
  return value === null ? NO_VALUE : formatDurationMs(value)
}

function DurationChart({ scope }: { scope: ChartScope }) {
  const { t } = useTranslation()
  const label = t("components.analytics.charts.duration.value")
  const maxMs = Math.max(
    0,
    ...scope.rows.map((row) => row.averageAnsweredDurationMs ?? 0)
  )

  return (
    <ChartCard
      title={t("components.analytics.charts.duration.title")}
      description={t("components.analytics.charts.duration.description")}
      scope={scope}
      isEmpty={scope.rows.every(
        (row) => row.averageAnsweredDurationMs === null
      )}
      columns={[
        {
          header: label,
          cell: (row) => formatDuration(row.averageAnsweredDurationMs),
        },
        {
          header: t("components.analytics.charts.duration.total"),
          cell: (row) => formatDurationMs(row.totalDurationMs),
        },
      ]}
    >
      <TrendLine
        dataKey="averageAnsweredDurationMs"
        label={label}
        scope={scope}
        formatValue={formatDuration}
        yAxis={durationAxis(maxMs)}
      />
    </ChartCard>
  )
}

function formatCost(value: number | null) {
  return value === null ? NO_VALUE : formatCallCost(value)
}

function CostChart({ scope }: { scope: ChartScope }) {
  const { t } = useTranslation()
  const config = {
    totalCost: {
      label: t("components.analytics.charts.cost.value"),
      theme: seriesColors.first,
    },
  } satisfies ChartConfig

  return (
    <ChartCard
      title={t("components.analytics.charts.cost.title")}
      description={t("components.analytics.charts.cost.description")}
      scope={scope}
      isEmpty={scope.rows.every((row) => row.totalCost === null)}
      columns={[
        {
          header: config.totalCost.label,
          cell: (row) => formatCost(row.totalCost),
        },
      ]}
    >
      <ChartContainer config={config} className={cn(CHART_HEIGHT, "w-full")}>
        <BarChart data={scope.rows} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis {...bucketAxisProps(scope)} />
          <YAxis
            {...valueAxisProps}
            {...niceAxis(
              Math.max(...scope.rows.map((row) => row.totalCost ?? 0))
            )}
            tickFormatter={formatCostAxis}
          />
          {bucketTooltip(config, scope, formatCost)}
          <Bar
            dataKey="totalCost"
            fill="var(--color-totalCost)"
            radius={BAR_END_RADIUS}
            maxBarSize={BAR_MAX_WIDTH}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}

export function AnalyticsCharts({
  series,
  granularity,
  timeZone,
  showCost,
}: {
  series: CallAnalyticsBucket[]
  granularity: CallAnalyticsGranularity
  timeZone: string
  showCost: boolean
}) {
  const now = Date.now()
  const rows = series
    // A range can end later today; hours still to come are not zero-call hours.
    .filter(
      (bucket) => bucket.calls > 0 || Date.parse(bucket.bucketStart) <= now
    )
    .map((bucket) => ({
      ...bucket,
      other: bucket.calls - bucket.answered - bucket.noAnswer,
    }))
  const scope = { rows, granularity, timeZone }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <VolumeChart
        scope={scope}
        className={showCost ? undefined : "lg:col-span-2"}
      />
      <AnswerRateChart scope={scope} />
      <DurationChart scope={scope} />
      {showCost ? <CostChart scope={scope} /> : null}
    </div>
  )
}
