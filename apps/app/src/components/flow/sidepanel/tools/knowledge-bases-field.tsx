import { useQuery } from "@tanstack/react-query"
import { BookOpenText, Plus } from "lucide-react"
import { useState } from "react"

import type { FlowConversationNode } from "@workspace/shared/api/agent-config/types"
import type { KnowledgeBaseListResponse } from "@workspace/shared/api/knowledge-bases/types"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { api } from "@/lib/api"
import { useTranslation } from "@/lib/i18n"
import { useAgentStore } from "@/stores/agent"
import { ToolPickerItem, ToolRow } from "./tool-row"

export function KnowledgeBasesField({ node }: { node: FlowConversationNode }) {
  const { t } = useTranslation()
  const readOnly = useAgentStore((state) => state.readOnly)
  const setNode = useAgentStore((state) => state.setNode)
  const [pickerOpen, setPickerOpen] = useState(false)

  const { data: knowledgeBases = [], isSuccess } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: () => api.get<KnowledgeBaseListResponse>("/knowledge-bases"),
  })

  const selectedIds = node.data.knowledgeBaseIds ?? []
  const available = knowledgeBases.filter(
    (knowledgeBase) => !selectedIds.includes(knowledgeBase.id)
  )

  function setSelectedIds(knowledgeBaseIds: string[]) {
    setNode({ ...node, data: { ...node.data, knowledgeBaseIds } })
  }

  return (
    <Field>
      <FieldLabel>
        {t("components.flow.sidepanel.tools.knowledge_bases.label")}
      </FieldLabel>
      {selectedIds.map((id) => {
        const knowledgeBase = knowledgeBases.find((entry) => entry.id === id)
        return (
          <ToolRow
            key={id}
            icon={BookOpenText}
            title={
              knowledgeBase?.name ??
              (isSuccess
                ? t("components.flow.sidepanel.tools.knowledge_bases.deleted")
                : t("common.states.loading"))
            }
            removeLabel={t(
              "components.flow.sidepanel.tools.knowledge_bases.remove"
            )}
            readOnly={readOnly}
            onRemove={() =>
              setSelectedIds(selectedIds.filter((entry) => entry !== id))
            }
          />
        )
      })}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={readOnly}
            />
          }
        >
          <Plus />
          {t("components.flow.sidepanel.tools.knowledge_bases.add")}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--anchor-width)! gap-1 p-2">
          {available.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              {t("components.flow.sidepanel.tools.knowledge_bases.none")}
            </p>
          ) : (
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {available.map((knowledgeBase) => (
                <ToolPickerItem
                  key={knowledgeBase.id}
                  icon={BookOpenText}
                  title={knowledgeBase.name}
                  onSelect={() => {
                    setSelectedIds([...selectedIds, knowledgeBase.id])
                    setPickerOpen(false)
                  }}
                />
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </Field>
  )
}
