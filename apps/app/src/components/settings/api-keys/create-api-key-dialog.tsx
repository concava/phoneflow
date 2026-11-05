import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import * as z from "zod"

import { createApiKeyRequestSchema } from "@workspace/shared/api/api-keys/schemas"
import type {
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from "@workspace/shared/api/api-keys/types"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import { CopyButton } from "@/components/copy-button"
import { api } from "@/lib/api"
import { useTranslation } from "@/lib/i18n"
import { zodResolverI18n } from "@/lib/zod-resolver"

const EXPIRY_OPTIONS = ["never", "30", "90", "365"] as const

const createApiKeyFormSchema = z.object({
  name: createApiKeyRequestSchema.shape.name,
  expiry: z.enum(EXPIRY_OPTIONS),
})

type CreateApiKeyFormValues = z.infer<typeof createApiKeyFormSchema>

function expiryToDate(expiry: CreateApiKeyFormValues["expiry"]) {
  if (expiry === "never") {
    return null
  }

  return new Date(
    Date.now() + Number(expiry) * 24 * 60 * 60 * 1000
  ).toISOString()
}

type CreateApiKeyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
}: CreateApiKeyDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [revealedKey, setRevealedKey] = useState<string | null>(null)

  const form = useForm<CreateApiKeyFormValues>({
    resolver: zodResolverI18n(createApiKeyFormSchema),
    defaultValues: {
      name: "",
      expiry: "never",
    },
  })

  const createMutation = useMutation({
    mutationFn: (values: CreateApiKeyFormValues) =>
      api.post<CreateApiKeyResponse, CreateApiKeyRequest>("/api-keys", {
        body: {
          name: values.name,
          expiresAt: expiryToDate(values.expiry),
        },
      }),
    onSuccess: ({ key }) => {
      setRevealedKey(key)
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
        setRevealedKey(null)
        form.reset()
        createMutation.reset()
      }}
    >
      <DialogContent>
        {revealedKey ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t(
                  "components.settings.api_keys.create_api_key_dialog.reveal.title"
                )}
              </DialogTitle>
              <DialogDescription>
                {t(
                  "components.settings.api_keys.create_api_key_dialog.reveal.description"
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={revealedKey}
                aria-label={t(
                  "components.settings.api_keys.create_api_key_dialog.reveal.label"
                )}
                className="font-mono text-xs"
                onFocus={(event) => event.target.select()}
              />
              <CopyButton value={revealedKey} />
            </div>
            <DialogFooter className="mt-4">
              <DialogClose>
                <Button>{t("common.actions.close")}</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t("components.settings.api_keys.create_api_key_dialog.title")}
              </DialogTitle>
              <DialogDescription>
                {t(
                  "components.settings.api_keys.create_api_key_dialog.description"
                )}
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
                        {t(
                          "components.settings.api_keys.create_api_key_dialog.name.label"
                        )}
                      </FieldLabel>
                      <Input
                        {...field}
                        id={field.name}
                        placeholder={t(
                          "components.settings.api_keys.create_api_key_dialog.name.placeholder"
                        )}
                        autoFocus
                        aria-invalid={fieldState.invalid}
                        disabled={createMutation.isPending}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="expiry"
                  control={form.control}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>
                        {t(
                          "components.settings.api_keys.create_api_key_dialog.expiry.label"
                        )}
                      </FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={(nextValue) => {
                          if (nextValue) {
                            field.onChange(nextValue)
                          }
                        }}
                        disabled={createMutation.isPending}
                      >
                        <SelectTrigger id={field.name} className="w-full">
                          <SelectValue>
                            {t(
                              `components.settings.api_keys.create_api_key_dialog.expiry.options.${field.value}`
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {EXPIRY_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {t(
                                `components.settings.api_keys.create_api_key_dialog.expiry.options.${option}`
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />
              </FieldGroup>

              <DialogFooter className="mt-8">
                <DialogClose>
                  <Button variant="outline" disabled={createMutation.isPending}>
                    {t("common.actions.cancel")}
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <Spinner className="mx-6" />
                  ) : (
                    t(
                      "components.settings.api_keys.create_api_key_dialog.submit"
                    )
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
