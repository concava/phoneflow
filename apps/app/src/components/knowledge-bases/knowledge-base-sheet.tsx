import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { RefreshCwIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { Suspense, useState } from "react"

import {
  KNOWLEDGE_DOCUMENT_MAX_BYTES,
  KNOWLEDGE_DOCUMENT_MIME_TYPES,
} from "@workspace/shared/api/knowledge-bases/schemas"
import type {
  DeleteKnowledgeDocumentResponse,
  KnowledgeBaseDetailResponse,
  KnowledgeDocumentResponse,
  KnowledgeDocumentStatus,
  KnowledgeSearchResponse,
  TestKnowledgeBaseSearchRequest,
} from "@workspace/shared/api/knowledge-bases/types"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Dropzone } from "@workspace/ui/components/dropzone"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import { DeleteConfirmDialog } from "@/components/knowledge-bases/delete-confirm-dialog"
import { SheetSkeleton } from "@/components/sheet-skeleton"
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { env } from "@/lib/env"
import i18n, { useTranslation } from "@/lib/i18n"

const POLL_INTERVAL_MS = 2000
const ACCEPTED_EXTENSIONS = Object.keys(KNOWLEDGE_DOCUMENT_MIME_TYPES).join(",")

const statusVariants = {
  pending: "secondary",
  processing: "secondary",
  ready: "outline",
  failed: "destructive",
} as const satisfies Record<KnowledgeDocumentStatus, string>

async function uploadDocument(knowledgeBaseId: string, file: File) {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(
    `${env.API_URL}/api/knowledge-bases/${knowledgeBaseId}/documents`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Accept-Language": i18n.language },
      body: formData,
    }
  )
  const body = await response.json()

  if (!response.ok) {
    throw new Error(body.error || response.status)
  }

  return body as KnowledgeDocumentResponse
}

function DocumentRow({
  document,
  readOnly,
}: {
  document: KnowledgeDocumentResponse
  readOnly: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const documentPath = `/knowledge-bases/${document.knowledgeBaseId}/documents/${document.id}`

  const onError = (error: Error) => {
    toast.error(error.message)
  }

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<DeleteKnowledgeDocumentResponse>(documentPath),
    onSuccess: () => {
      setDeleteOpen(false)
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] })
    },
    onError,
  })

  const reprocessMutation = useMutation({
    mutationFn: () =>
      api.post<KnowledgeDocumentResponse, never>(
        `${documentPath}/reprocess`,
        {}
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] })
    },
    onError,
  })

  const busy = document.status === "pending" || document.status === "processing"

  return (
    <div className="flex items-center rounded-md border border-border p-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{document.name}</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={statusVariants[document.status]}>
            {t(`components.knowledge_bases.sheet.status.${document.status}`)}
          </Badge>
          {document.chunkCount > 0
            ? t("components.knowledge_bases.sheet.chunks", {
                count: document.chunkCount,
              })
            : null}
        </div>
        {document.error ? (
          <p className="mt-1 text-xs text-destructive">
            {t(`components.knowledge_bases.sheet.errors.${document.error}`)}
          </p>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("components.knowledge_bases.sheet.reprocess", {
          name: document.name,
        })}
        disabled={readOnly || busy || reprocessMutation.isPending}
        onClick={() => reprocessMutation.mutate()}
      >
        <RefreshCwIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-destructive!"
        aria-label={t("components.knowledge_bases.sheet.delete_label", {
          name: document.name,
        })}
        disabled={readOnly}
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2Icon />
      </Button>
      <DeleteConfirmDialog
        open={deleteOpen}
        title={t("components.knowledge_bases.sheet.delete_dialog.title")}
        description={t(
          "components.knowledge_bases.sheet.delete_dialog.description",
          { name: document.name }
        )}
        pending={deleteMutation.isPending}
        onOpenChange={setDeleteOpen}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}

function TestSearch({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")

  const searchMutation = useMutation({
    mutationFn: (value: string) =>
      api.post<KnowledgeSearchResponse, TestKnowledgeBaseSearchRequest>(
        `/knowledge-bases/${knowledgeBaseId}/search`,
        { body: { query: value } }
      ),
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const results = searchMutation.data?.results

  return (
    <Field>
      <FieldLabel htmlFor="knowledge-base-test-search">
        {t("components.knowledge_bases.sheet.search.label")}
      </FieldLabel>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (query.trim()) {
            searchMutation.mutate(query.trim())
          }
        }}
      >
        <Input
          id="knowledge-base-test-search"
          value={query}
          placeholder={t("components.knowledge_bases.sheet.search.placeholder")}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          aria-label={t("common.actions.search")}
          disabled={searchMutation.isPending || !query.trim()}
        >
          {searchMutation.isPending ? <Spinner /> : <SearchIcon />}
        </Button>
      </form>
      {results?.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("components.knowledge_bases.sheet.search.no_results")}
        </p>
      ) : null}
      {results?.map((result, index) => (
        <div key={index} className="rounded-md border border-border p-2">
          <div className="mb-1 flex justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">{result.documentName}</span>
            <span className="shrink-0">{result.score.toFixed(3)}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{result.content}</p>
        </div>
      ))}
    </Field>
  )
}

function KnowledgeBaseBody({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canUpdate = useCheckPermission({ knowledgeBase: ["update"] })

  const { data: knowledgeBase } = useSuspenseQuery({
    queryKey: ["knowledge-bases", knowledgeBaseId],
    queryFn: () =>
      api.get<KnowledgeBaseDetailResponse>(
        `/knowledge-bases/${knowledgeBaseId}`
      ),
    refetchInterval: ({ state }) =>
      state.data?.documents.some(
        (document) =>
          document.status === "pending" || document.status === "processing"
      )
        ? POLL_INTERVAL_MS
        : false,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDocument(knowledgeBaseId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <>
      <SheetHeader>
        <SheetTitle>{knowledgeBase.name}</SheetTitle>
      </SheetHeader>

      <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4">
        <Field>
          <FieldLabel>
            {t("components.knowledge_bases.sheet.documents")}
          </FieldLabel>
          <Dropzone
            accept={ACCEPTED_EXTENSIONS}
            className="h-24"
            disabled={!canUpdate || uploadMutation.isPending}
            placeholder={
              uploadMutation.isPending
                ? t("common.states.loading")
                : t("components.knowledge_bases.sheet.upload_placeholder")
            }
            onValueChange={(file) => {
              if (!file) {
                return
              }
              if (file.size > KNOWLEDGE_DOCUMENT_MAX_BYTES) {
                toast.error(t("components.knowledge_bases.sheet.too_large"))
                return
              }
              uploadMutation.mutate(file)
            }}
          />
          {knowledgeBase.documents.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              readOnly={!canUpdate}
            />
          ))}
        </Field>

        <TestSearch knowledgeBaseId={knowledgeBaseId} />
      </div>
    </>
  )
}

export function KnowledgeBaseSheet({
  knowledgeBaseId,
  open,
  onClose,
}: {
  knowledgeBaseId?: string
  open: boolean
  onClose: () => void
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <SheetContent className="sm:max-w-md">
        <Suspense fallback={<SheetSkeleton />}>
          {knowledgeBaseId ? (
            <KnowledgeBaseBody
              key={knowledgeBaseId}
              knowledgeBaseId={knowledgeBaseId}
            />
          ) : null}
        </Suspense>
      </SheetContent>
    </Sheet>
  )
}
