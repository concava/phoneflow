import { useMutation, useQueryClient } from "@tanstack/react-query"
import { RotateCwIcon } from "lucide-react"

import type {
  CallDetailResponse,
  CallExtraction as CallExtractionValues,
  ExtractionErrorCode,
  ExtractionStatus,
  RerunExtractionResponse,
} from "@workspace/shared/api/calls/types"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { useTranslation } from "@/lib/i18n"

export function ExtractionStatusBadge({
  status,
}: {
  status: ExtractionStatus
}) {
  const { t } = useTranslation()

  return (
    <Badge
      variant={
        status === "failed"
          ? "destructive"
          : status === "completed"
            ? "secondary"
            : "outline"
      }
    >
      {status === "pending" ? <Spinner /> : null}
      {t(`components.calls.call_extraction.status.${status}`)}
    </Badge>
  )
}

export function ExtractionErrorMessage({
  error,
}: {
  error: ExtractionErrorCode
}) {
  const { t } = useTranslation()

  return (
    <p className="text-sm text-muted-foreground">
      {t(`components.calls.call_extraction.errors.${error}`)}
    </p>
  )
}

export function ExtractionValues({
  extraction,
}: {
  extraction: CallExtractionValues
}) {
  const { t } = useTranslation()

  function formatValue(value: CallExtractionValues[string]) {
    if (value === null) {
      return (
        <span className="text-muted-foreground">
          {t("components.calls.call_extraction.values.empty")}
        </span>
      )
    }
    if (typeof value === "boolean") {
      return t(
        `components.calls.call_extraction.values.${value ? "yes" : "no"}`
      )
    }
    return String(value)
  }

  return (
    <div className="flex flex-col gap-2">
      {Object.entries(extraction).map(([key, value]) => (
        <div key={key} className="flex justify-between gap-4">
          <span className="text-sm text-muted-foreground">{key}</span>
          <span className="text-right text-sm break-all">
            {formatValue(value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function CallExtraction({ call }: { call: CallDetailResponse }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canRerun = useCheckPermission({ calls: ["create"] })

  const rerunMutation = useMutation({
    mutationFn: () =>
      api.post<RerunExtractionResponse, never>(
        `/calls/${call.id}/extraction/rerun`,
        {}
      ),
    onSuccess: () => {
      toast.success(t("components.calls.call_extraction.toasts.rerun_started"))
      queryClient.invalidateQueries({ queryKey: ["calls", call.id] })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  if (!call.extractionStatus) {
    return null
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <div className="font-medium">
          {t("components.calls.call_extraction.title")}
        </div>
        <ExtractionStatusBadge status={call.extractionStatus} />
        {canRerun ? (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={
              rerunMutation.isPending || call.extractionStatus === "pending"
            }
            onClick={() => rerunMutation.mutate()}
          >
            {rerunMutation.isPending ? <Spinner /> : <RotateCwIcon />}
            {t("components.calls.call_extraction.rerun")}
          </Button>
        ) : null}
      </div>
      {call.extractionError ? (
        <ExtractionErrorMessage error={call.extractionError} />
      ) : null}
      {call.extraction ? (
        <ExtractionValues extraction={call.extraction} />
      ) : null}
    </div>
  )
}
