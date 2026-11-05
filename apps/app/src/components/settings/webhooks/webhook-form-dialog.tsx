import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"

import {
  createWebhookRequestSchema,
  webhookEventTypes,
} from "@workspace/shared/api/webhooks/schemas"
import type {
  CreateWebhookRequest,
  WebhookEndpointResponse,
} from "@workspace/shared/api/webhooks/types"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import { webhookEventLabels } from "@/components/settings/webhooks/webhook-labels"
import { captureEvent } from "@/lib/analytics"
import { api } from "@/lib/api"
import { useTranslation } from "@/lib/i18n"
import { zodResolverI18n } from "@/lib/zod-resolver"

type WebhookFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpoint?: WebhookEndpointResponse
  onCreated?: (secret: string) => void
}

export function WebhookFormDialog({
  open,
  onOpenChange,
  endpoint,
  onCreated,
}: WebhookFormDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const initialValues: CreateWebhookRequest = {
    url: endpoint?.url ?? "",
    events: endpoint?.events ?? [...webhookEventTypes],
  }

  const form = useForm<CreateWebhookRequest>({
    resolver: zodResolverI18n(createWebhookRequestSchema),
    defaultValues: initialValues,
  })

  const saveMutation = useMutation({
    mutationFn: (values: CreateWebhookRequest) =>
      endpoint
        ? api.patch<WebhookEndpointResponse, CreateWebhookRequest>(
            `/webhooks/${endpoint.id}`,
            { body: values }
          )
        : api.post<WebhookEndpointResponse, CreateWebhookRequest>("/webhooks", {
            body: values,
          }),
    onSuccess: (saved) => {
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ["webhooks"] })
      if (!endpoint) {
        captureEvent("webhook_created", { webhook_id: saved.id })
        onCreated?.(saved.secret)
      }
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
        form.reset(initialValues)
        saveMutation.reset()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {endpoint
              ? t("components.settings.webhooks.form.edit_title")
              : t("components.settings.webhooks.form.create_title")}
          </DialogTitle>
          <DialogDescription>
            {t("components.settings.webhooks.form.description")}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          noValidate
        >
          <FieldGroup>
            <Controller
              name="url"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("components.settings.webhooks.form.url.label")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="url"
                    aria-invalid={fieldState.invalid}
                    placeholder="https://example.com/webhooks/phoneflow"
                    autoComplete="off"
                    disabled={saveMutation.isPending}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="events"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>
                    {t("components.settings.webhooks.form.events.label")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("components.settings.webhooks.form.events.description")}
                  </FieldDescription>
                  <div className="space-y-2">
                    {webhookEventTypes.map((event) => {
                      const id = `webhook-event-${event}`
                      return (
                        <Field key={event} orientation="horizontal">
                          <Checkbox
                            id={id}
                            checked={field.value.includes(event)}
                            disabled={saveMutation.isPending}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked === true
                                  ? [...field.value, event]
                                  : field.value.filter(
                                      (value) => value !== event
                                    )
                              )
                            }
                          />
                          <FieldLabel htmlFor={id}>
                            {t(webhookEventLabels[event])}
                          </FieldLabel>
                        </Field>
                      )
                    })}
                  </div>
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
                disabled={saveMutation.isPending}
              >
                {t("common.actions.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Spinner className="mx-6" />
              ) : endpoint ? (
                t("common.actions.save")
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
