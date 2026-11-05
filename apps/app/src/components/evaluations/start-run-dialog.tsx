import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Controller, useForm } from "react-hook-form"

import type { AgentVersionsListResponse } from "@workspace/shared/api/agents/types"
import { startEvaluationRunRequestSchema } from "@workspace/shared/api/evaluations/schemas"
import type {
  StartEvaluationRunRequest,
  StartEvaluationRunResponse,
} from "@workspace/shared/api/evaluations/types"
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
import {
  formatRunVersionLabel,
  suiteRunsQueryKey,
  suitesQueryKey,
} from "@/components/evaluations/helpers"
import { DateRangeFilter } from "@/components/filters/date-range-filter"
import { formatAgentVersionLabel } from "@/components/helpers"
import { captureEvent } from "@/lib/analytics"
import { api } from "@/lib/api"
import { useTranslation } from "@/lib/i18n"
import { zodResolverI18n } from "@/lib/zod-resolver"

const ALL_VERSIONS = "all"

function StartRunForm({
  suiteId,
  agentId,
  onDone,
}: {
  suiteId: string
  agentId: string
  onDone: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const form = useForm({
    resolver: zodResolverI18n(startEvaluationRunRequestSchema),
    defaultValues: {
      agentVersionId: null,
      from: null,
      to: null,
      limit: 50,
    },
  })

  const { data: versions = [] } = useQuery({
    queryKey: ["agents", "versions", agentId],
    queryFn: () =>
      api.get<AgentVersionsListResponse>(`/agents/${agentId}/versions`),
  })

  const startMutation = useMutation({
    mutationFn: (body: StartEvaluationRunRequest) =>
      api.post<StartEvaluationRunResponse, StartEvaluationRunRequest>(
        `/evaluations/suites/${suiteId}/runs`,
        { body }
      ),
    onSuccess: ({ id }) => {
      captureEvent("evaluation_run_started", { run_id: id })
      toast.success(t("components.evaluations.start_run_dialog.toasts.started"))
      queryClient.invalidateQueries({ queryKey: suitesQueryKey() })
      queryClient.invalidateQueries({ queryKey: suiteRunsQueryKey(suiteId) })
      onDone()
      navigate({ to: "/evaluations/runs/$runId", params: { runId: id } })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const dateRangeError = form.formState.errors.from?.message

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={form.handleSubmit((values) => startMutation.mutate(values))}
    >
      <FieldGroup>
        <Controller
          name="agentVersionId"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>
                {t("components.evaluations.start_run_dialog.version.label")}
              </FieldLabel>
              <Select
                value={field.value ?? ALL_VERSIONS}
                onValueChange={(value) =>
                  field.onChange(value === ALL_VERSIONS ? null : value)
                }
              >
                <SelectTrigger id={field.name}>
                  <SelectValue>
                    {formatRunVersionLabel(
                      versions.find((version) => version.id === field.value) ??
                        null,
                      t
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VERSIONS}>
                    {t("components.evaluations.helpers.all_versions")}
                  </SelectItem>
                  {versions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      {formatAgentVersionLabel(version, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        <Controller
          name="from"
          control={form.control}
          render={({ field }) => (
            <div>
              <DateRangeFilter
                id="evaluation-run-dates"
                label={t("components.evaluations.start_run_dialog.dates.label")}
                from={field.value ?? undefined}
                to={form.watch("to") ?? undefined}
                onChange={({ from, to }) => {
                  field.onChange(from ?? null)
                  form.setValue("to", to ?? null)
                }}
              />
              {dateRangeError ? (
                <FieldError>{dateRangeError}</FieldError>
              ) : null}
            </div>
          )}
        />

        <Controller
          name="limit"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>
                {t("components.evaluations.start_run_dialog.limit.label")}
              </FieldLabel>
              <Input
                {...field}
                id={field.name}
                type="number"
                min={1}
                max={200}
                value={Number.isNaN(field.value) ? "" : field.value}
                onChange={(event) => field.onChange(event.target.valueAsNumber)}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                {t("components.evaluations.start_run_dialog.limit.description")}
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          {t("common.actions.cancel")}
        </DialogClose>
        <Button type="submit" disabled={startMutation.isPending}>
          {startMutation.isPending ? (
            <Spinner className="mx-3" />
          ) : (
            t("components.evaluations.start_run_dialog.submit")
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function StartRunDialog({
  suiteId,
  agentId,
  open,
  onOpenChange,
}: {
  suiteId: string
  agentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("components.evaluations.start_run_dialog.title")}
          </DialogTitle>
          <DialogDescription>
            {t("components.evaluations.start_run_dialog.description")}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <StartRunForm
            suiteId={suiteId}
            agentId={agentId}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
