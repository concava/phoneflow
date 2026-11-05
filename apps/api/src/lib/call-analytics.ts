import { and, eq, gte, inArray, lte, sql } from "drizzle-orm"

import { db } from "@workspace/db/client"
import { agentsTable } from "@workspace/db/schema/agents"
import { callsTable } from "@workspace/db/schema/calls"
import { CALL_ANALYTICS_HOURLY_MAX_RANGE_MS } from "@workspace/shared/api/calls/schemas"
import type {
  CallAnalyticsMetrics,
  CallAnalyticsQuery,
  CallAnalyticsResponse,
} from "@workspace/shared/api/calls/types"

function metricColumns() {
  const { status, durationMs, totalCost } = callsTable

  return {
    calls: sql<number>`count(*)::int`.as("calls"),
    answered:
      sql<number>`(count(*) filter (where ${status} = 'completed'))::int`.as(
        "answered"
      ),
    noAnswer:
      sql<number>`(count(*) filter (where ${status} = 'no_answer'))::int`.as(
        "no_answer"
      ),
    inProgress:
      sql<number>`(count(*) filter (where ${status} = 'in_progress'))::int`.as(
        "in_progress"
      ),
    totalDurationMs: sql<number>`coalesce(sum(${durationMs}), 0)::float8`.as(
      "total_duration_ms"
    ),
    averageAnsweredDurationMs: sql<
      number | null
    >`round(avg(${durationMs}) filter (where ${status} = 'completed'))::float8`.as(
      "average_answered_duration_ms"
    ),
    // Left without coalesce: all-null costs must stay null, not become $0.
    totalCost: sql<number | null>`sum(${totalCost})::float8`.as("total_cost"),
  }
}

type MetricRow = {
  [Key in keyof Omit<CallAnalyticsMetrics, "answerRate">]:
    | CallAnalyticsMetrics[Key]
    | null
}

function toMetrics(row: MetricRow): CallAnalyticsMetrics {
  const calls = row.calls ?? 0
  const answered = row.answered ?? 0
  const inProgress = row.inProgress ?? 0
  const finished = calls - inProgress

  return {
    calls,
    answered,
    noAnswer: row.noAnswer ?? 0,
    inProgress,
    // Statuses this code does not know stay in the denominator: they finished
    // and nothing says they were answered.
    answerRate: finished > 0 ? answered / finished : null,
    totalDurationMs: row.totalDurationMs ?? 0,
    averageAnsweredDurationMs: row.averageAnsweredDurationMs,
    totalCost: row.totalCost,
  }
}

export async function getCallAnalytics(
  organizationId: string,
  query: CallAnalyticsQuery
): Promise<CallAnalyticsResponse> {
  const from = new Date(query.from)
  const to = new Date(query.to)
  const granularity =
    to.getTime() - from.getTime() <= CALL_ANALYTICS_HOURLY_MAX_RANGE_MS
      ? "hour"
      : "day"

  const filters = and(
    eq(callsTable.organizationId, organizationId),
    gte(callsTable.startedAt, from),
    lte(callsTable.startedAt, to),
    query.agentIds?.length
      ? inArray(callsTable.agentId, query.agentIds)
      : undefined,
    query.direction ? eq(callsTable.direction, query.direction) : undefined,
    query.channel ? eq(callsTable.channel, query.channel) : undefined
  )

  const callsPerBucket = db
    .select({
      bucket:
        sql<string>`date_trunc(${granularity}, ${callsTable.startedAt}, ${query.timezone})`.as(
          "bucket"
        ),
      ...metricColumns(),
    })
    .from(callsTable)
    .where(filters)
    .groupBy(sql`bucket`)
    .as("calls_per_bucket")

  // Buckets come from the same date_trunc as the calls, sampled finer than the
  // shortest bucket, instead of stepping by a day or an hour. That way repeated
  // hours, 23-hour days and missing midnights line up in every timezone.
  const sampleStep = granularity === "hour" ? "15 minutes" : "1 hour"
  const fromIso = from.toISOString()
  const toIso = to.toISOString()
  const allBuckets = sql`(
    select date_trunc(${granularity}, sample, ${query.timezone}) as bucket
    from generate_series(${fromIso}::timestamptz, ${toIso}::timestamptz, ${sampleStep}::interval) as sample
    union
    select date_trunc(${granularity}, ${toIso}::timestamptz, ${query.timezone})
  ) as all_buckets`

  const [seriesRows, agentRows] = await Promise.all([
    db
      .select({
        bucketStart: sql<string>`to_char(all_buckets.bucket at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
        calls: callsPerBucket.calls,
        answered: callsPerBucket.answered,
        noAnswer: callsPerBucket.noAnswer,
        inProgress: callsPerBucket.inProgress,
        totalDurationMs: callsPerBucket.totalDurationMs,
        averageAnsweredDurationMs: callsPerBucket.averageAnsweredDurationMs,
        totalCost: callsPerBucket.totalCost,
      })
      .from(allBuckets)
      .leftJoin(
        callsPerBucket,
        sql`${callsPerBucket.bucket} = all_buckets.bucket`
      )
      .orderBy(sql`all_buckets.bucket`),
    // The empty grouping set is the totals row, present even with no calls.
    db
      .select({
        isTotal: sql<number>`grouping(${callsTable.agentId})`,
        agentId: callsTable.agentId,
        agentName: agentsTable.name,
        ...metricColumns(),
      })
      .from(callsTable)
      .leftJoin(
        agentsTable,
        and(
          eq(agentsTable.id, callsTable.agentId),
          eq(agentsTable.organizationId, callsTable.organizationId)
        )
      )
      .where(filters)
      .groupBy(
        sql`grouping sets ((${callsTable.agentId}, ${agentsTable.name}), ())`
      )
      .orderBy(sql`count(*) desc`, agentsTable.name),
  ])

  const totals = agentRows.find((row) => row.isTotal === 1)

  if (!totals) {
    throw new Error("Call analytics totals row missing")
  }

  return {
    granularity,
    totals: toMetrics(totals),
    series: seriesRows.map(({ bucketStart, ...row }) => ({
      bucketStart,
      ...toMetrics(row),
    })),
    agents: agentRows
      .filter((row) => row.isTotal === 0)
      .map((row) => ({
        agentId: row.agentId,
        agentName: row.agentName,
        ...toMetrics(row),
      })),
  }
}
