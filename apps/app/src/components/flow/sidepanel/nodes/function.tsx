import { PencilLine, Plus } from "lucide-react"
import { useState } from "react"

import { functionNodeResultVariables } from "@workspace/shared/api/agent-config/schemas"
import type {
  FlowFunctionNode,
  WebhookTool,
} from "@workspace/shared/api/agent-config/types"
import { Button } from "@workspace/ui/components/button"
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
import { SwitchField } from "@/components/flow/sidepanel/config/fields"
import {
  createWebhookToolDraft,
  WebhookToolDialog,
} from "@/components/flow/sidepanel/tools/webhook-dialog"
import { VariableTextField } from "@/components/flow/variables/variable-text-field"
import { useTranslation } from "@/lib/i18n"
import { useAgentStore } from "@/stores/agent"
import { FlowSidePanelBase } from "../base"

type FunctionNodePanelProps = {
  node: FlowFunctionNode
}

export function FunctionNodePanel({ node }: FunctionNodePanelProps) {
  const { t } = useTranslation()
  const readOnly = useAgentStore((state) => state.readOnly)
  const tools = useAgentStore((state) => state.config.tools)
  const errors = useAgentStore((state) => state.flowErrors.byNodeId[node.id])
  const setNode = useAgentStore((state) => state.setNode)
  const createTool = useAgentStore((state) => state.createTool)
  const editTool = useAgentStore((state) => state.editTool)

  const [webhookDialog, setWebhookDialog] = useState<{
    tool: WebhookTool
    mode: "create" | "edit"
  } | null>(null)

  const tool = tools.find((entry) => entry.id === node.data.toolId)
  const results = tool ? functionNodeResultVariables(tool.name) : null

  function setMessage(message: string) {
    const { message: _removed, ...data } = node.data
    setNode({ ...node, data: message ? { ...data, message } : data })
  }

  function setStart(isStart: boolean) {
    const { isStart: _removed, ...data } = node.data
    setNode({ ...node, data: isStart ? { ...data, isStart } : data })
  }

  return (
    <FlowSidePanelBase
      title={
        node.data.isStart
          ? t("components.flow.sidepanel.nodes.function.title_start")
          : t("components.flow.sidepanel.nodes.function.title")
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel>
            {t("components.flow.sidepanel.nodes.function.name.label")}
          </FieldLabel>
          <Input
            value={node.data.name}
            readOnly={readOnly}
            onChange={(event) =>
              setNode({
                ...node,
                data: { ...node.data, name: event.target.value },
              })
            }
          />
        </Field>

        <Field>
          <FieldLabel>
            {t("components.flow.sidepanel.nodes.function.tool.label")}
          </FieldLabel>
          <Select
            value={node.data.toolId}
            readOnly={readOnly}
            onValueChange={(toolId) => {
              if (toolId) {
                setNode({ ...node, data: { ...node.data, toolId } })
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {tool?.name ??
                  t(
                    "components.flow.sidepanel.nodes.function.tool.placeholder"
                  )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {tools.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            {tool ? (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setWebhookDialog({ tool, mode: "edit" })}
              >
                <PencilLine />
                {t("components.flow.sidepanel.nodes.function.tool.edit")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={readOnly}
              onClick={() =>
                setWebhookDialog({
                  tool: createWebhookToolDraft(),
                  mode: "create",
                })
              }
            >
              <Plus />
              {t("components.flow.sidepanel.nodes.function.tool.new_webhook")}
            </Button>
          </div>
          <FieldDescription>
            {results
              ? t("components.flow.sidepanel.nodes.function.tool.results", {
                  ok: `{{${results.ok}}}`,
                  status: `{{${results.status}}}`,
                })
              : t("components.flow.sidepanel.nodes.function.tool.description")}
          </FieldDescription>
          {errors?.map((error) => (
            <FieldError key={error}>{error}</FieldError>
          ))}
        </Field>

        <Field>
          <FieldLabel>
            {t("components.flow.sidepanel.nodes.function.message.label")}
          </FieldLabel>
          <VariableTextField
            multiline
            rows={3}
            placeholder={t(
              "components.flow.sidepanel.nodes.function.message.placeholder"
            )}
            value={node.data.message ?? ""}
            readOnly={readOnly}
            onChange={setMessage}
          />
          <FieldDescription>
            {t("components.flow.sidepanel.nodes.function.message.description")}
          </FieldDescription>
        </Field>

        <SwitchField
          label={t("components.flow.sidepanel.nodes.function.start.label")}
          description={t(
            "components.flow.sidepanel.nodes.function.start.description"
          )}
          checked={node.data.isStart === true}
          readOnly={readOnly}
          onCheckedChange={setStart}
        />

        <p className="text-sm text-muted-foreground">
          {t("components.flow.sidepanel.nodes.function.edges_description")}
        </p>
      </FieldGroup>

      {webhookDialog ? (
        <WebhookToolDialog
          open
          tool={webhookDialog.tool}
          readOnly={readOnly}
          onOpenChange={(open) => {
            if (!open) {
              setWebhookDialog(null)
            }
          }}
          onSave={(saved) => {
            if (webhookDialog.mode === "create") {
              createTool(saved, node.id)
            } else {
              editTool(saved)
            }
            setWebhookDialog(null)
          }}
        />
      ) : null}
    </FlowSidePanelBase>
  )
}
