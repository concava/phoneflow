import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { useState } from "react"

import type {
  UpdateWebhookRequest,
  WebhookEndpointListResponse,
  WebhookEndpointResponse,
} from "@workspace/shared/api/webhooks/types"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { Switch } from "@workspace/ui/components/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { WebhookFormDialog } from "@/components/settings/webhooks/webhook-form-dialog"
import { webhookEventLabels } from "@/components/settings/webhooks/webhook-labels"
import { WebhookRowActions } from "@/components/settings/webhooks/webhook-row-actions"
import { WebhookSecretDialog } from "@/components/settings/webhooks/webhook-secret-dialog"
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { useTranslation } from "@/lib/i18n"

function WebhookEnabledSwitch({
  endpoint,
}: {
  endpoint: WebhookEndpointResponse
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canUpdate = useCheckPermission({ webhook: ["update"] })

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch<WebhookEndpointResponse, UpdateWebhookRequest>(
        `/webhooks/${endpoint.id}`,
        { body: { enabled } }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <Switch
      aria-label={t("components.settings.webhooks.table.toggle_enabled", {
        url: endpoint.url,
      })}
      checked={endpoint.enabled}
      disabled={!canUpdate || toggleMutation.isPending}
      onCheckedChange={(enabled) => toggleMutation.mutate(enabled)}
    />
  )
}

function WebhooksTable() {
  const { t } = useTranslation()
  const { data: endpoints } = useSuspenseQuery({
    queryKey: ["webhooks"],
    queryFn: () => api.get<WebhookEndpointListResponse>("/webhooks"),
  })
  const canCreate = useCheckPermission({ webhook: ["create"] })
  const [createOpen, setCreateOpen] = useState(false)
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t("components.settings.webhooks.table.description")}
        </p>
        <Button disabled={!canCreate} onClick={() => setCreateOpen(true)}>
          <PlusIcon />
          {t("components.settings.webhooks.table.create")}
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t("components.settings.webhooks.table.columns.url")}
              </TableHead>
              <TableHead>
                {t("components.settings.webhooks.table.columns.events")}
              </TableHead>
              <TableHead>
                {t("components.settings.webhooks.table.columns.secret")}
              </TableHead>
              <TableHead className="w-0">
                {t("components.settings.webhooks.table.columns.enabled")}
              </TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpoints.length ? (
              endpoints.map((endpoint) => (
                <TableRow key={endpoint.id}>
                  <TableCell className="max-w-80 truncate font-medium">
                    {endpoint.url}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {endpoint.events.map((event) => (
                        <Badge key={event} variant="outline">
                          {t(webhookEventLabels[event])}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {endpoint.secret}
                  </TableCell>
                  <TableCell>
                    <WebhookEnabledSwitch endpoint={endpoint} />
                  </TableCell>
                  <TableCell>
                    <WebhookRowActions
                      endpoint={endpoint}
                      onSecretRevealed={setRevealedSecret}
                    />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t("components.settings.webhooks.table.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <WebhookFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setRevealedSecret}
      />
      <WebhookSecretDialog
        secret={revealedSecret}
        onClose={() => setRevealedSecret(null)}
      />
    </div>
  )
}

export function WebhooksSettings() {
  const { t } = useTranslation()
  const canRead = useCheckPermission({ webhook: ["read"] })

  if (!canRead) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("components.settings.webhooks.no_permission")}
      </p>
    )
  }

  return <WebhooksTable />
}
