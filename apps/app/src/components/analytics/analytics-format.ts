import type { CallAnalyticsGranularity } from "@workspace/shared/api/calls/types"
import i18n from "@/lib/i18n"

export const NO_VALUE = "—"

export function formatCount(value: number) {
  return new Intl.NumberFormat(i18n.language).format(value)
}

export function formatRate(value: number | null) {
  return value === null
    ? NO_VALUE
    : new Intl.NumberFormat(i18n.language, {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value)
}

export function formatCostAxis(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumSignificantDigits: 3,
  }).format(value)
}

export function formatBucketTick(
  value: string,
  granularity: CallAnalyticsGranularity,
  timeZone: string
) {
  return new Intl.DateTimeFormat(
    i18n.language,
    granularity === "hour"
      ? { hour: "2-digit", minute: "2-digit", timeZone }
      : { month: "short", day: "numeric", timeZone }
  ).format(new Date(value))
}

export function formatBucketLabel(
  value: string,
  granularity: CallAnalyticsGranularity,
  timeZone: string
) {
  return new Intl.DateTimeFormat(
    i18n.language,
    granularity === "hour"
      ? // The zone name tells apart the two 02:00 hours when clocks go back.
        {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
          timeZone,
        }
      : { month: "short", day: "numeric", year: "numeric", timeZone }
  ).format(new Date(value))
}
