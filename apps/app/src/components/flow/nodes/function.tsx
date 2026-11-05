import { Handle, type Node, type NodeProps, Position } from "@xyflow/react"
import { Play, Webhook } from "lucide-react"

import type { FlowFunctionNode } from "@workspace/shared/api/agent-config/types"
import { useTranslation } from "@/lib/i18n"
import { useAgentStore } from "@/stores/agent"
import { FlowNodeBase } from "./base"

type FunctionNodeType = Node<FlowFunctionNode["data"], "function">

export function FunctionNode({
  id,
  data,
  selected,
}: NodeProps<FunctionNodeType>) {
  const { t } = useTranslation()
  const tool = useAgentStore((state) =>
    state.config.tools.find((entry) => entry.id === data.toolId)
  )

  return (
    <FlowNodeBase id={id} selected={selected}>
      <Handle
        type="target"
        position={Position.Top}
        className="size-2! rounded-full! border-2! border-muted-foreground! bg-popover!"
      />
      <div className="mx-3 my-3 flex items-center space-x-2">
        <span className="flex h-6 w-6 items-center justify-center rounded border border-border">
          {data.isStart ? (
            <Play className="h-4 w-4 text-green-600" />
          ) : (
            <Webhook className="h-4 w-4 text-amber-600" />
          )}
        </span>
        <span className="text-sm font-medium text-foreground">{data.name}</span>
      </div>
      <div className="border-t border-border" />
      <div className="p-3 pb-1 text-xs text-foreground">
        {t("components.flow.nodes.function.webhook")}
      </div>
      <div className="truncate p-3 pt-0 text-xs text-muted-foreground">
        {tool?.name ?? t("components.flow.nodes.function.no_tool")}
      </div>
      {data.message ? (
        <>
          <div className="px-3 text-xs text-foreground">
            {t("components.flow.nodes.function.message")}
          </div>
          <div className="p-3 pt-1">
            <div className="line-clamp-4 whitespace-pre-wrap wrap-break-word text-xs text-muted-foreground">
              {data.message}
            </div>
          </div>
        </>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="size-2! rounded-full! border-2! border-muted-foreground! bg-popover!"
      />
    </FlowNodeBase>
  )
}
