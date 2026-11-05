import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2Icon } from "lucide-react"
import { useState } from "react"

import type {
  DeleteKnowledgeBaseResponse,
  KnowledgeBaseListItem,
} from "@workspace/shared/api/knowledge-bases/types"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { DeleteConfirmDialog } from "@/components/knowledge-bases/delete-confirm-dialog"
import { UserDateTime } from "@/components/user-timezone-provider"
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { useTranslation } from "@/lib/i18n"

export function KnowledgeBasesTable({
  data,
  onSelect,
}: {
  data: KnowledgeBaseListItem[]
  onSelect: (knowledgeBaseId: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canDelete = useCheckPermission({ knowledgeBase: ["delete"] })
  const [deleting, setDeleting] = useState<KnowledgeBaseListItem | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete<DeleteKnowledgeBaseResponse>(`/knowledge-bases/${id}`),
    onSuccess: () => {
      setDeleting(null)
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t("components.knowledge_bases.table.columns.name")}
              </TableHead>
              <TableHead>
                {t("components.knowledge_bases.table.columns.documents")}
              </TableHead>
              <TableHead>
                {t("components.knowledge_bases.table.columns.created_at")}
              </TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t("common.table.no_results")}
                </TableCell>
              </TableRow>
            ) : (
              data.map((knowledgeBase) => (
                <TableRow
                  key={knowledgeBase.id}
                  className="cursor-pointer"
                  onClick={() => onSelect(knowledgeBase.id)}
                >
                  <TableCell>{knowledgeBase.name}</TableCell>
                  <TableCell>{knowledgeBase.documentCount}</TableCell>
                  <TableCell>
                    <UserDateTime value={knowledgeBase.createdAt} />
                  </TableCell>
                  <TableCell className="w-0">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive!"
                      disabled={!canDelete}
                      aria-label={t(
                        "components.knowledge_bases.table.delete_label",
                        { name: knowledgeBase.name }
                      )}
                      onClick={(event) => {
                        event.stopPropagation()
                        setDeleting(knowledgeBase)
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DeleteConfirmDialog
        open={deleting !== null}
        title={t("components.knowledge_bases.table.delete_dialog.title")}
        description={t(
          "components.knowledge_bases.table.delete_dialog.description",
          { name: deleting?.name }
        )}
        pending={deleteMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null)
          }
        }}
        onConfirm={() => {
          if (deleting) {
            deleteMutation.mutate(deleting.id)
          }
        }}
      />
    </>
  )
}
