import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { Controller, useFieldArray, useForm } from "react-hook-form"

import type { AgentsListResponse } from "@workspace/shared/api/agents/types"
import { createEvaluationSuiteRequestSchema } from "@workspace/shared/api/evaluations/schemas"
import type {
  CreateEvaluationSuiteRequest,
  CreateEvaluationSuiteResponse,
  EvaluationSuite,
  UpdateEvaluationSuiteRequest,
  UpdateEvaluationSuiteResponse,
} from "@workspace/shared/api/evaluations/types"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"
import { suiteQueryKey, suitesQueryKey } from "@/components/evaluations/helpers"
import { formatAgentName } from "@/components/helpers"
import { captureEvent } from "@/lib/analytics"
import { api } from "@/lib/api"
import { useTranslation } from "@/lib/i18n"
import { zodResolverI18n } from "@/lib/zod-resolver"

const MAX_CRITERIA = 20

function newCriterion() {
  return { id: crypto.randomUUID(), name: "", description: "" }
}

function SuiteEditorForm({
  suite,
  onDone,
}: {
  suite?: EvaluationSuite
  onDone: (suiteId: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const form = useForm<CreateEvaluationSuiteRequest>({
    resolver: zodResolverI18n(createEvaluationSuiteRequestSchema),
    defaultValues: {
      name: suite?.name ?? "",
      agentId: suite?.agentId ?? "",
      criteria: suite?.criteria ?? [newCriterion()],
    },
  })

  // The criterion's own id must survive edits so runs stay comparable, so
  // react-hook-form has to keep its row key in a different property.
  const criteria = useFieldArray({
    control: form.control,
    name: "criteria",
    keyName: "fieldKey",
  })

  const { data: agents = [] } = useQuery({
    queryKey: ["agents", "list"],
    queryFn: () => api.get<AgentsListResponse>("/agents"),
    enabled: !suite,
  })

  const saveMutation = useMutation({
    mutationFn: async (values: CreateEvaluationSuiteRequest) => {
      if (suite) {
        await api.patch<
          UpdateEvaluationSuiteResponse,
          UpdateEvaluationSuiteRequest
        >(`/evaluations/suites/${suite.id}`, {
          body: { name: values.name, criteria: values.criteria },
        })
        return suite.id
      }

      const { id } = await api.post<
        CreateEvaluationSuiteResponse,
        CreateEvaluationSuiteRequest
      >("/evaluations/suites", { body: values })
      captureEvent("evaluation_suite_created", { suite_id: id })
      return id
    },
    onSuccess: (suiteId) => {
      toast.success(
        suite
          ? t("components.evaluations.suite_editor_dialog.toasts.updated")
          : t("components.evaluations.suite_editor_dialog.toasts.created")
      )
      queryClient.invalidateQueries({ queryKey: suitesQueryKey() })
      queryClient.invalidateQueries({ queryKey: suiteQueryKey(suiteId) })
      onDone(suiteId)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const criteriaError =
    form.formState.errors.criteria?.root?.message ??
    form.formState.errors.criteria?.message

  return (
    <form
      noValidate
      className="flex min-h-0 flex-col gap-6"
      onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
    >
      <FieldGroup className="max-h-[60vh] overflow-y-auto p-1">
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>
                {t("components.evaluations.suite_editor_dialog.name.label")}
              </FieldLabel>
              <Input
                {...field}
                id={field.name}
                autoComplete="off"
                placeholder={t(
                  "components.evaluations.suite_editor_dialog.name.placeholder"
                )}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="agentId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>
                {t("components.evaluations.suite_editor_dialog.agent.label")}
              </FieldLabel>
              <Select
                value={field.value || null}
                onValueChange={field.onChange}
                readOnly={Boolean(suite)}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue
                    placeholder={t(
                      "components.evaluations.suite_editor_dialog.agent.placeholder"
                    )}
                  >
                    {suite
                      ? formatAgentName(suite.agent, t)
                      : (agents.find((agent) => agent.id === field.value)
                          ?.name ??
                        t(
                          "components.evaluations.suite_editor_dialog.agent.placeholder"
                        ))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {suite ? (
                <FieldDescription>
                  {t("components.evaluations.suite_editor_dialog.agent.locked")}
                </FieldDescription>
              ) : null}
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Field>
          <FieldLabel>
            {t("components.evaluations.suite_editor_dialog.criteria.label")}
          </FieldLabel>
          <FieldDescription>
            {t(
              "components.evaluations.suite_editor_dialog.criteria.description"
            )}
          </FieldDescription>
          <div className="mt-2 flex flex-col gap-4">
            {criteria.fields.map((criterion, index) => (
              <div
                key={criterion.fieldKey}
                className="flex flex-col gap-3 rounded-md border p-3"
              >
                <div className="flex items-start gap-2">
                  <Controller
                    name={`criteria.${index}.name`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <Input
                          {...field}
                          autoComplete="off"
                          placeholder={t(
                            "components.evaluations.suite_editor_dialog.criteria.name_placeholder"
                          )}
                          aria-label={t(
                            "components.evaluations.suite_editor_dialog.criteria.name_label"
                          )}
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t(
                      "components.evaluations.suite_editor_dialog.criteria.remove"
                    )}
                    disabled={criteria.fields.length === 1}
                    onClick={() => criteria.remove(index)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <Controller
                  name={`criteria.${index}.description`}
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <Textarea
                        {...field}
                        placeholder={t(
                          "components.evaluations.suite_editor_dialog.criteria.description_placeholder"
                        )}
                        aria-label={t(
                          "components.evaluations.suite_editor_dialog.criteria.description_label"
                        )}
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>
            ))}
          </div>
          {criteriaError ? <FieldError>{criteriaError}</FieldError> : null}
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-fit"
            disabled={criteria.fields.length >= MAX_CRITERIA}
            onClick={() => criteria.append(newCriterion())}
          >
            <PlusIcon />
            {t("components.evaluations.suite_editor_dialog.criteria.add")}
          </Button>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          {t("common.actions.cancel")}
        </DialogClose>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <Spinner className="mx-3" />
          ) : (
            t("common.actions.save")
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function SuiteEditorDialog({
  suite,
  open,
  onOpenChange,
  onSaved,
}: {
  suite?: EvaluationSuite
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (suiteId: string) => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {suite
              ? t("components.evaluations.suite_editor_dialog.edit_title")
              : t("components.evaluations.suite_editor_dialog.create_title")}
          </DialogTitle>
        </DialogHeader>
        {open ? (
          <SuiteEditorForm
            suite={suite}
            onDone={(suiteId) => {
              onOpenChange(false)
              onSaved?.(suiteId)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
