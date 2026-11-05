import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  HistoryIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import type {
  DeleteWebhookResponse,
  SendWebhookTestResponse,
  WebhookEndpointResponse,
} from "@workspace/shared/api/webhooks/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import { WebhookDeliveriesDialog } from "@/components/settings/webhooks/webhook-deliveries-dialog"
import { WebhookFormDialog } from "@/components/settings/webhooks/webhook-form-dialog"
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { useTranslation } from "@/lib/i18n"

type WebhookRowActionsProps = {
  endpoint: WebhookEndpointResponse
  onSecretRevealed: (secret: string) => void
}

export function WebhookRowActions({
  endpoint,
  onSecretRevealed,
}: WebhookRowActionsProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canUpdate = useCheckPermission({ webhook: ["update"] })
  const canDelete = useCheckPermission({ webhook: ["delete"] })
  const [editOpen, setEditOpen] = useState(false)
  const [deliveriesOpen, setDeliveriesOpen] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const testMutation = useMutation({
    mutationFn: () =>
      api.post<SendWebhookTestResponse, never>(
        `/webhooks/${endpoint.id}/test`,
        {}
      ),
    onSuccess: () => {
      toast.success(t("components.settings.webhooks.actions.toasts.test_sent"))
      queryClient.invalidateQueries({
        queryKey: ["webhooks", endpoint.id, "deliveries"],
      })
      setDeliveriesOpen(true)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const rotateMutation = useMutation({
    mutationFn: () =>
      api.post<WebhookEndpointResponse, never>(
        `/webhooks/${endpoint.id}/rotate-secret`,
        {}
      ),
    onSuccess: (rotated) => {
      setRotateOpen(false)
      queryClient.invalidateQueries({ queryKey: ["webhooks"] })
      onSecretRevealed(rotated.secret)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () =>
      api.delete<DeleteWebhookResponse>(`/webhooks/${endpoint.id}`),
    onSuccess: () => {
      toast.success(t("components.settings.webhooks.actions.toasts.deleted"))
      setDeleteOpen(false)
      queryClient.invalidateQueries({ queryKey: ["webhooks"] })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("components.settings.webhooks.actions.open_actions", {
              url: endpoint.url,
            })}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48" align="end" sideOffset={4}>
          <DropdownMenuItem
            disabled={!canUpdate}
            onClick={() => setEditOpen(true)}
          >
            <PencilIcon />
            {t("common.actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canUpdate || testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            <SendIcon />
            {t("components.settings.webhooks.actions.send_test")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDeliveriesOpen(true)}>
            <HistoryIcon />
            {t("components.settings.webhooks.actions.view_deliveries")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canUpdate}
            onClick={() => setRotateOpen(true)}
          >
            <KeyRoundIcon />
            {t("components.settings.webhooks.actions.rotate_secret")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={!canDelete}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2Icon />
            {t("common.actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("components.settings.webhooks.actions.rotate_dialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "components.settings.webhooks.actions.rotate_dialog.description"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotateMutation.isPending}>
              {t("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={rotateMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                rotateMutation.mutate()
              }}
            >
              {rotateMutation.isPending ? (
                <Spinner className="mx-3 size-4" />
              ) : (
                t("components.settings.webhooks.actions.rotate_dialog.confirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("components.settings.webhooks.actions.delete_dialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "components.settings.webhooks.actions.delete_dialog.description",
                { url: endpoint.url }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                deleteMutation.mutate()
              }}
            >
              {deleteMutation.isPending ? (
                <Spinner className="mx-3 size-4" />
              ) : (
                t("common.actions.delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <WebhookFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        endpoint={endpoint}
      />
      <WebhookDeliveriesDialog
        open={deliveriesOpen}
        onOpenChange={setDeliveriesOpen}
        endpoint={endpoint}
      />
    </>
  )
}
