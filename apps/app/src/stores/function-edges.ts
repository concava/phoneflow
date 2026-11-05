import type { EditorFlowEdge } from "@/components/flow/agent-config"

// An edge drawn before its function node had a tool has no result variable to
// branch on yet, so it gets one when the tool is chosen.
export function fillFunctionEdgeVariables<T extends EditorFlowEdge>(
  edges: T[],
  nodeId: string,
  variable: string
): T[] {
  return edges.map((edge) => {
    const condition = edge.data.condition

    if (
      edge.source !== nodeId ||
      condition.type !== "expression" ||
      !condition.conditions.some((row) => row.variable === "")
    ) {
      return edge
    }

    return {
      ...edge,
      data: {
        ...edge.data,
        condition: {
          ...condition,
          conditions: condition.conditions.map((row) =>
            row.variable === "" ? { ...row, variable } : row
          ),
        },
      },
    }
  })
}
