import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, RotateCcwIcon } from "lucide-react"
import { useState } from "react"

import type {
  RetryWebhookDeliveryResponse,
  WebhookDeliveryListItem,
  WebhookDeliveryListResponse,
  WebhookDeliveryStatus,
  WebhookEndpointResponse,
} from "@workspace/shared/api/webhooks/types"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { toast } from "@workspace/ui/components/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  webhookErrorLabels,
  webhookEventLabels,
  webhookStatusLabels,
} from "@/components/settings/webhooks/webhook-labels"
import { UserDateTime } from "@/components/user-timezone-provider"
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { useTranslation } from "@/lib/i18n"

const PAGE_SIZE = 10

const statusVariants = {
  pending: "outline",
  succeeded: "secondary",
  failed: "destructive",
} as const satisfies Record<WebhookDeliveryStatus, string>

function useDeliveryResultLabel() {
  const { t } = useTranslation()

  return (delivery: WebhookDeliveryListItem) => {
    if (delivery.lastError) {
      const [code, detail] = delivery.lastError.split(":")
      const key: string | undefined =
        webhookErrorLabels[code as keyof typeof webhookErrorLabels]
      const label = key
        ? t(key, { statusCode: delivery.lastStatusCode })
        : delivery.lastError
      return detail ? `${label} (${detail})` : label
    }

    return delivery.lastStatusCode ? `HTTP ${delivery.lastStatusCode}` : "-"
  }
}

function RetryDeliveryButton({
  delivery,
  endpointId,
}: {
  delivery: WebhookDeliveryListItem
  endpointId: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canUpdate = useCheckPermission({ webhook: ["update"] })

  const retryMutation = useMutation({
    mutationFn: () =>
      api.post<RetryWebhookDeliveryResponse, never>(
        `/webhooks/${endpointId}/deliveries/${delivery.id}/retry`,
        {}
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["webhooks", endpointId, "deliveries"],
      })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("common.actions.retry")}
      disabled={!canUpdate || retryMutation.isPending}
      onClick={() => retryMutation.mutate()}
    >
      <RotateCcwIcon />
    </Button>
  )
}

function WebhookDeliveriesTable({ endpointId }: { endpointId: string }) {
  const { t } = useTranslation()
  const resultLabel = useDeliveryResultLabel()
  const [page, setPage] = useState(1)

  const { data, isPending, isError } = useQuery({
    queryKey: ["webhooks", endpointId, "deliveries", page],
    queryFn: () =>
      api.get<WebhookDeliveryListResponse>(
        `/webhooks/${endpointId}/deliveries?page=${page}&pageSize=${PAGE_SIZE}`
      ),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === "pending")
        ? 3000
        : false,
  })

  const items = data?.items ?? []
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  return (
    <div className="min-w-0">
      <div className="max-h-96 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t("components.settings.webhooks.deliveries.columns.event")}
              </TableHead>
              <TableHead>
                {t("components.settings.webhooks.deliveries.columns.status")}
              </TableHead>
              <TableHead>
                {t("components.settings.webhooks.deliveries.columns.result")}
              </TableHead>
              <TableHead>
                {t("components.settings.webhooks.deliveries.columns.attempts")}
              </TableHead>
              <TableHead>
                {t("components.settings.webhooks.deliveries.columns.created")}
              </TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length ? (
              items.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell>
                    {t(webhookEventLabels[delivery.eventType])}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariants[delivery.status]}>
                      {t(webhookStatusLabels[delivery.status])}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-60 whitespace-normal text-muted-foreground">
                    {resultLabel(delivery)}
                  </TableCell>
                  <TableCell>{delivery.attempts}</TableCell>
                  <TableCell>
                    <UserDateTime value={delivery.createdAt} />
                  </TableCell>
                  <TableCell>
                    {delivery.status === "failed" ? (
                      <RetryDeliveryButton
                        delivery={delivery}
                        endpointId={endpointId}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  {isPending
                    ? t("common.states.loading")
                    : isError
                      ? t("common.errors.generic")
                      : t("components.settings.webhooks.deliveries.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="pr-2 text-sm font-medium">
          {t("common.table.page", { page, total: pageCount })}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("components.settings.webhooks.deliveries.previous")}
          disabled={page <= 1}
          onClick={() => setPage((current) => current - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("components.settings.webhooks.deliveries.next")}
          disabled={page >= pageCount}
          onClick={() => setPage((current) => current + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

type WebhookDeliveriesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpoint: WebhookEndpointResponse
}

export function WebhookDeliveriesDialog({
  open,
  onOpenChange,
  endpoint,
}: WebhookDeliveriesDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {t("components.settings.webhooks.deliveries.title")}
          </DialogTitle>
          <DialogDescription className="truncate">
            {endpoint.url}
          </DialogDescription>
        </DialogHeader>
        {open ? <WebhookDeliveriesTable endpointId={endpoint.id} /> : null}
      </DialogContent>
    </Dialog>
  )
}
