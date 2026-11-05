import { useMutation, useQueryClient } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { createKnowledgeBaseRequestSchema } from "@workspace/shared/api/knowledge-bases/schemas"
import type {
  CreateKnowledgeBaseRequest,
  KnowledgeBaseResponse,
} from "@workspace/shared/api/knowledge-bases/types"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { useTranslation } from "@/lib/i18n"
import { zodResolverI18n } from "@/lib/zod-resolver"

export function CreateKnowledgeBaseForm() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const canCreate = useCheckPermission({ knowledgeBase: ["create"] })

  const form = useForm<CreateKnowledgeBaseRequest>({
    resolver: zodResolverI18n(createKnowledgeBaseRequestSchema),
    defaultValues: { name: "" },
  })

  const createMutation = useMutation({
    mutationFn: (values: CreateKnowledgeBaseRequest) =>
      api.post<KnowledgeBaseResponse, CreateKnowledgeBaseRequest>(
        "/knowledge-bases",
        { body: values }
      ),
    onSuccess: () => {
      form.reset()
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        form.reset()
        createMutation.reset()
      }}
    >
      <DialogTrigger disabled={!canCreate}>
        <Button disabled={!canCreate}>
          <PlusIcon />
          {t("components.knowledge_bases.create_form.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("components.knowledge_bases.create_form.title")}
          </DialogTitle>
          <DialogDescription>
            {t("components.knowledge_bases.create_form.description")}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) =>
            createMutation.mutate(values)
          )}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("components.knowledge_bases.create_form.name")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    disabled={createMutation.isPending}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>

          <DialogFooter className="mt-6">
            <DialogClose>
              <Button
                type="button"
                variant="outline"
                disabled={createMutation.isPending}
              >
                {t("common.actions.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Spinner className="mx-4" />
              ) : (
                t("common.actions.create")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
