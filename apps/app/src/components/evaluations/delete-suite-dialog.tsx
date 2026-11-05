import { useMutation, useQueryClient } from "@tanstack/react-query"

import type {
  DeleteEvaluationSuiteResponse,
  EvaluationSuite,
} from "@workspace/shared/api/evaluations/types"
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
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import { suitesQueryKey } from "@/components/evaluations/helpers"
import { api } from "@/lib/api"
import { useTranslation } from "@/lib/i18n"

export function DeleteSuiteDialog({
  suite,
  open,
  onOpenChange,
  onDeleted,
}: {
  suite: Pick<EvaluationSuite, "id" | "name">
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () =>
      api.delete<DeleteEvaluationSuiteResponse>(
        `/evaluations/suites/${suite.id}`
      ),
    onSuccess: () => {
      toast.success(
        t("components.evaluations.delete_suite_dialog.toasts.deleted", {
          name: suite.name,
        })
      )
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: suitesQueryKey() })
      onDeleted()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("components.evaluations.delete_suite_dialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("components.evaluations.delete_suite_dialog.description", {
              name: suite.name,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>
            {t("common.actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? (
              <Spinner className="mx-3" />
            ) : (
              t("common.actions.delete")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
