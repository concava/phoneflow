import { z } from "zod"

export const startWebCallRequestSchema = z
  .object({
    agentId: z.uuid(),
    agentVersionId: z.uuid().nullable(),
    livekitRoomName: z.string().trim().min(1),
    startedAt: z.iso.datetime(),
  })
  .strict()

export const startInboundCallRequestSchema = z
  .object({
    fromNumber: z.string(),
    toNumber: z.e164(),
    livekitRoomName: z.string().trim().min(1),
    startedAt: z.iso.datetime(),
  })
  .strict()

export const startOutboundCallRequestSchema = z
  .object({
    agentId: z.uuid(),
    agentVersionId: z.uuid().nullable(),
    fromNumber: z.e164(),
    toNumber: z.e164(),
    livekitRoomName: z.string().trim().min(1),
    startedAt: z.iso.datetime(),
    batchCallId: z.uuid().nullable(),
  })
  .strict()

export const unansweredCallRequestSchema = z
  .object({
    agentId: z.uuid(),
    agentVersionId: z.uuid().nullable(),
    fromNumber: z.e164(),
    toNumber: z.e164(),
    livekitRoomName: z.string().trim().min(1),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    batchCallId: z.uuid().nullable(),
  })
  .strict()

export const callTranscriptItemSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
  })
  .strict()

export const callTranscriptSchema = z.array(callTranscriptItemSchema)

export const completeCallRequestSchema = z
  .object({
    callId: z.uuid(),
    endedAt: z.iso.datetime(),
    status: z.enum(["completed"]),
    transcript: callTranscriptSchema,
    variables: z.record(z.string(), z.string()).optional(),
  })
  .strict()

export const triggerOutboundCallRequestSchema = z
  .object({
    phoneNumberId: z.uuid(),
    toNumber: z.e164(),
    agentId: z.uuid(),
    agentVersionId: z.uuid().nullable().optional(),
    variables: z.record(z.string(), z.string()).optional(),
  })
  .strict()

export const callListSortBySchema = z.enum(["startedAt", "duration", "cost"])

export const callNumericFilterOperatorSchema = z.enum([
  "eq",
  "between",
  "gte",
  "lte",
])

export const callListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .refine((value) => [10, 20, 30, 40, 50].includes(value))
      .default(10),
    channel: z.enum(["phone_call", "web_call"]).optional(),
    direction: z.enum(["inbound", "outbound"]).optional(),
    status: z.enum(["in_progress", "completed", "no_answer"]).optional(),
    startedAtFrom: z.iso.datetime().optional(),
    startedAtTo: z.iso.datetime().optional(),
    agentIds: z.union([z.string(), z.array(z.string())]).optional(),
    fromNumbers: z.union([z.string(), z.array(z.string())]).optional(),
    toNumbers: z.union([z.string(), z.array(z.string())]).optional(),
    costOp: callNumericFilterOperatorSchema.optional(),
    cost: z.coerce.number().nonnegative().optional(),
    costMax: z.coerce.number().nonnegative().optional(),
    durationOp: callNumericFilterOperatorSchema.optional(),
    duration: z.coerce.number().nonnegative().optional(),
    durationMax: z.coerce.number().nonnegative().optional(),
    batchId: z.uuid().optional(),
    sortBy: callListSortBySchema.default("startedAt"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()

const DAY_MS = 24 * 60 * 60 * 1000

const CALL_ANALYTICS_MAX_RANGE_MS = 366 * DAY_MS
export const CALL_ANALYTICS_HOURLY_MAX_RANGE_MS = 2 * DAY_MS

function isIanaTimeZone(value: string) {
  // Intl also accepts offsets like "+01:00", which Postgres would read as a
  // POSIX zone with the sign flipped.
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(value)) {
    return false
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const callAnalyticsQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    timezone: z.string().refine(isIanaTimeZone, {
      message: "schemas.calls.analytics.timezone.invalid",
    }),
    agentIds: z
      .union([z.string(), z.array(z.string())])
      .transform((value) =>
        (Array.isArray(value) ? value : [value])
          .flatMap((item) => item.split(","))
          .filter(Boolean)
      )
      .pipe(z.array(z.uuid()))
      .optional(),
    direction: z.enum(["inbound", "outbound"]).optional(),
    channel: z.enum(["phone_call", "web_call"]).optional(),
  })
  .strict()
  .refine((data) => new Date(data.from) < new Date(data.to), {
    message: "schemas.calls.analytics.range.order",
    path: ["to"],
  })
  .refine(
    (data) =>
      new Date(data.to).getTime() - new Date(data.from).getTime() <=
      CALL_ANALYTICS_MAX_RANGE_MS,
    {
      message: "schemas.calls.analytics.range.max",
      path: ["to"],
    }
  )
