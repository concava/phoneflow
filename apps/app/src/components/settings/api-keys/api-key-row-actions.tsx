import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MoreHorizontalIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import type {
  ApiKeyListItem,
  RevokeApiKeyResponse,
} from "@workspace/shared/api/api-keys/types"
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
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { useTranslation } from "@/lib/i18n"

export function ApiKeyRowActions({ apiKey }: { apiKey: ApiKeyListItem }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [revokeOpen, setRevokeOpen] = useState(false)
  const canRevoke = useCheckPermission({ apiKey: ["revoke"] })

  const revokeMutation = useMutation({
    mutationFn: () =>
      api.delete<RevokeApiKeyResponse>(`/api-keys/${apiKey.id}`),
    onSuccess: () => {
      toast.success(
        t("components.settings.api_keys.api_key_row_actions.toasts.revoked", {
          name: apiKey.name,
        })
      )
      setRevokeOpen(false)
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <>
      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                "components.settings.api_keys.api_key_row_actions.revoke_dialog.title"
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "components.settings.api_keys.api_key_row_actions.revoke_dialog.description",
                { name: apiKey.name }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>
              {t("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                revokeMutation.mutate()
              }}
            >
              {revokeMutation.isPending ? (
                <Spinner className="mx-3 size-4" />
              ) : (
                t(
                  "components.settings.api_keys.api_key_row_actions.revoke_dialog.confirm"
                )
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t(
              "components.settings.api_keys.api_key_row_actions.open_actions",
              { name: apiKey.name }
            )}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-40" align="end" sideOffset={4}>
          <DropdownMenuItem
            variant="destructive"
            disabled={!canRevoke}
            onClick={() => setRevokeOpen(true)}
          >
            <Trash2Icon />
            {t("components.settings.api_keys.api_key_row_actions.revoke")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
