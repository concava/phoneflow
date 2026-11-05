import { Binary, Hash, List, Plus, Type } from "lucide-react"
import { useState } from "react"

import type { ExtractionField } from "@workspace/shared/api/agent-config/types"
import { Button } from "@workspace/ui/components/button"
import {
  createExtractionFieldDraft,
  ExtractionFieldDialog,
} from "@/components/flow/sidepanel/extraction-field-dialog"
import { ExtractionTest } from "@/components/flow/sidepanel/extraction-test"
import { ToolRow } from "@/components/flow/sidepanel/tools/tool-row"
import { useTranslation } from "@/lib/i18n"
import { useAgentStore } from "@/stores/agent"
import { FlowSidePanelBase } from "./base"

const MAX_FIELDS = 30

const fieldIcons = {
  string: Type,
  number: Hash,
  boolean: Binary,
  enum: List,
} satisfies Record<ExtractionField["type"], unknown>

export function ExtractionPanel() {
  const { t } = useTranslation()
  const readOnly = useAgentStore((state) => state.readOnly)
  const config = useAgentStore((state) => state.config)
  const setConfig = useAgentStore((state) => state.setConfig)
  const fields = config.postCallExtraction?.fields ?? []
  const [editing, setEditing] = useState<{
    index: number | null
    field: ExtractionField
  } | null>(null)

  function saveFields(next: ExtractionField[]) {
    const { postCallExtraction: _, ...rest } = config
    setConfig(
      next.length > 0 ? { ...rest, postCallExtraction: { fields: next } } : rest
    )
  }

  function handleSave(field: ExtractionField) {
    if (!editing) {
      return
    }
    saveFields(
      editing.index === null
        ? [...fields, field]
        : fields.map((current, index) =>
            index === editing.index ? field : current
          )
    )
    setEditing(null)
  }

  return (
    <FlowSidePanelBase title={t("components.flow.sidepanel.extraction.title")}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t("components.flow.sidepanel.extraction.description")}
        </p>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("components.flow.sidepanel.extraction.empty")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {fields.map((field, index) => (
              <ToolRow
                key={field.key}
                icon={fieldIcons[field.type]}
                title={field.key}
                summary={field.description}
                editLabel={t("components.flow.sidepanel.extraction.edit_field")}
                removeLabel={t(
                  "components.flow.sidepanel.extraction.remove_field"
                )}
                readOnly={readOnly}
                onEdit={() => setEditing({ index, field })}
                onRemove={() =>
                  saveFields(fields.filter((_, other) => other !== index))
                }
              />
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={readOnly || fields.length >= MAX_FIELDS}
          onClick={() =>
            setEditing({ index: null, field: createExtractionFieldDraft() })
          }
        >
          <Plus />
          {t("components.flow.sidepanel.extraction.add_field")}
        </Button>
        {fields.length > 0 ? <ExtractionTest fields={fields} /> : null}
      </div>
      {editing ? (
        <ExtractionFieldDialog
          open
          isNew={editing.index === null}
          field={editing.field}
          otherKeys={fields
            .filter((_, index) => index !== editing.index)
            .map((field) => field.key)}
          readOnly={readOnly}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          onSave={handleSave}
        />
      ) : null}
    </FlowSidePanelBase>
  )
}
