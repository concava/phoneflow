import { useMemo } from "react"
import { Controller, useForm } from "react-hook-form"

import { extractionFieldSchema } from "@workspace/shared/api/agent-config/schemas"
import type { ExtractionField } from "@workspace/shared/api/agent-config/types"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
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
import { Textarea } from "@workspace/ui/components/textarea"
import {
  EnumField,
  StringListField,
  SwitchField,
} from "@/components/flow/sidepanel/config/fields"
import { useTranslation } from "@/lib/i18n"
import { zodResolverI18n } from "@/lib/zod-resolver"

const DIALOG_KEY = "components.flow.sidepanel.extraction.dialog"

export function createExtractionFieldDraft(): ExtractionField {
  return { key: "", type: "string", description: "", nullable: true }
}

export function ExtractionFieldDialog({
  open,
  isNew,
  field,
  otherKeys,
  readOnly,
  onOpenChange,
  onSave,
}: {
  open: boolean
  isNew: boolean
  field: ExtractionField
  otherKeys: string[]
  readOnly: boolean
  onOpenChange: (open: boolean) => void
  onSave: (field: ExtractionField) => void
}) {
  const { t } = useTranslation()
  const schema = useMemo(
    () =>
      extractionFieldSchema.refine((value) => !otherKeys.includes(value.key), {
        path: ["key"],
        message: "schemas.agent_config.post_call_extraction.key.duplicate",
      }),
    [otherKeys]
  )
  const form = useForm<ExtractionField>({
    resolver: zodResolverI18n(schema),
    defaultValues: field,
  })
  const type = form.watch("type")

  const typeOptions = (["string", "number", "boolean", "enum"] as const).map(
    (value) => ({
      value,
      label: t(`components.flow.sidepanel.extraction.types.${value}`),
    })
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(`${DIALOG_KEY}.${isNew ? "add_title" : "edit_title"}`)}
          </DialogTitle>
          <DialogDescription>
            {t(`${DIALOG_KEY}.description`)}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          noValidate
          onSubmit={form.handleSubmit(onSave)}
        >
          <FieldGroup className="gap-4">
            <Controller
              name="key"
              control={form.control}
              render={({ field: keyField, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={keyField.name}>
                    {t(`${DIALOG_KEY}.key.label`)}
                  </FieldLabel>
                  <Input
                    {...keyField}
                    id={keyField.name}
                    placeholder={t(`${DIALOG_KEY}.key.placeholder`)}
                    readOnly={readOnly}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="type"
              control={form.control}
              render={({ field: typeField }) => (
                <EnumField
                  label={t(`${DIALOG_KEY}.type.label`)}
                  value={typeField.value}
                  options={typeOptions}
                  readOnly={readOnly}
                  onChange={(next) => {
                    typeField.onChange(next)
                    form.setValue(
                      "options",
                      next === "enum"
                        ? (form.getValues("options") ?? [])
                        : undefined
                    )
                  }}
                />
              )}
            />
            {type === "enum" ? (
              <Controller
                name="options"
                control={form.control}
                render={({ field: optionsField, fieldState }) => (
                  <div className="flex flex-col gap-2">
                    <StringListField
                      label={t(`${DIALOG_KEY}.options.label`)}
                      description={t(`${DIALOG_KEY}.options.description`)}
                      placeholder={t(`${DIALOG_KEY}.options.placeholder`)}
                      value={optionsField.value ?? []}
                      readOnly={readOnly}
                      onChange={optionsField.onChange}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </div>
                )}
              />
            ) : null}
            <Controller
              name="description"
              control={form.control}
              render={({ field: descriptionField, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={descriptionField.name}>
                    {t(`${DIALOG_KEY}.field_description.label`)}
                  </FieldLabel>
                  <Textarea
                    {...descriptionField}
                    id={descriptionField.name}
                    rows={3}
                    placeholder={t(
                      `${DIALOG_KEY}.field_description.placeholder`
                    )}
                    readOnly={readOnly}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="nullable"
              control={form.control}
              render={({ field: nullableField }) => (
                <SwitchField
                  label={t(`${DIALOG_KEY}.nullable.label`)}
                  description={t(`${DIALOG_KEY}.nullable.description`)}
                  checked={nullableField.value}
                  readOnly={readOnly}
                  onCheckedChange={nullableField.onChange}
                />
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.actions.cancel")}
            </Button>
            <Button type="submit" disabled={readOnly}>
              {t("common.actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
