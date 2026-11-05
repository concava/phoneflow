import { useQuery } from "@tanstack/react-query"
import { cn } from "cn"
import { useMemo } from "react"

import type { AgentsListResponse } from "@workspace/shared/api/agents/types"
import type {
  CallChannel,
  CallDirection,
} from "@workspace/shared/api/calls/types"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { DateRangeFilter } from "@/components/filters/date-range-filter"
import {
  FilterMultiSelect,
  type MultiSelectOption,
} from "@/components/filters/filter-multi-select"
import { api } from "@/lib/api"
import { useTranslation } from "@/lib/i18n"

export const analyticsRangePresets = ["today", "7d", "30d", "90d"] as const

export type AnalyticsRangePreset = (typeof analyticsRangePresets)[number]

export type AnalyticsFilterValues = {
  range?: AnalyticsRangePreset
  from?: string
  to?: string
  agentIds?: string[]
  direction?: CallDirection
  channel?: CallChannel
}

function FilterSelect({
  label,
  value,
  options,
  width = "w-40",
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  width?: string
  onChange: (value: string) => void
}) {
  return (
    <Field className={cn(width, "gap-1.5")}>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next) {
            onChange(next)
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue>
            {options.find((option) => option.value === value)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export function AnalyticsFilters({
  filters,
  resolvedRange,
  onFiltersChange,
}: {
  filters: AnalyticsFilterValues
  resolvedRange: { from: string; to: string }
  onFiltersChange: (filters: AnalyticsFilterValues) => void
}) {
  const { t } = useTranslation()
  const { data: agents = [] } = useQuery({
    queryKey: ["agents", "list"],
    queryFn: () => api.get<AgentsListResponse>("/agents"),
  })
  const agentItems = useMemo<MultiSelectOption[]>(
    () => agents.map((agent) => ({ value: agent.id, label: agent.name })),
    [agents]
  )

  const isCustomRange = Boolean(filters.from)
  const rangeOptions = [
    ...analyticsRangePresets.map((preset) => ({
      value: preset,
      label: t(`components.analytics.filters.range.${preset}`),
    })),
    ...(isCustomRange
      ? [
          {
            value: "custom",
            label: t("components.analytics.filters.range.custom"),
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect
        label={t("components.analytics.filters.range.label")}
        value={isCustomRange ? "custom" : (filters.range ?? "30d")}
        options={rangeOptions}
        onChange={(value) => {
          // "custom" only labels a range picked in the calendar; it is not a preset.
          if (value === "custom") return

          onFiltersChange({
            ...filters,
            range: value as AnalyticsRangePreset,
            from: undefined,
            to: undefined,
          })
        }}
      />
      <DateRangeFilter
        id="analytics-date-range"
        label={t("components.analytics.filters.date.label")}
        from={resolvedRange.from}
        to={resolvedRange.to}
        onChange={({ from, to }) =>
          onFiltersChange({ ...filters, range: undefined, from, to })
        }
      />
      <FilterMultiSelect
        label={t("components.calls.calls_filters.agent.label")}
        placeholder={t("components.calls.calls_filters.agent.placeholder")}
        items={agentItems}
        selectedValues={filters.agentIds ?? []}
        onSelectedValuesChange={(agentIds) =>
          onFiltersChange({
            ...filters,
            agentIds: agentIds.length > 0 ? agentIds : undefined,
          })
        }
      />
      <FilterSelect
        label={t("components.calls.calls_filters.channel.label")}
        value={filters.channel ?? "all"}
        options={[
          {
            value: "all",
            label: t("components.calls.calls_filters.channel.all"),
          },
          {
            value: "phone_call",
            label: t("components.calls.calls_filters.channel.phone_call"),
          },
          {
            value: "web_call",
            label: t("components.calls.calls_filters.channel.web_call"),
          },
        ]}
        onChange={(value) =>
          onFiltersChange({
            ...filters,
            channel: value === "all" ? undefined : (value as CallChannel),
          })
        }
      />
      <FilterSelect
        label={t("components.calls.calls_filters.direction.label")}
        width="w-48"
        value={filters.direction ?? "all"}
        options={[
          {
            value: "all",
            label: t("components.calls.calls_filters.direction.all"),
          },
          {
            value: "inbound",
            label: t("components.calls.calls_filters.direction.inbound"),
          },
          {
            value: "outbound",
            label: t("components.calls.calls_filters.direction.outbound"),
          },
        ]}
        onChange={(value) =>
          onFiltersChange({
            ...filters,
            direction: value === "all" ? undefined : (value as CallDirection),
          })
        }
      />
    </div>
  )
}
