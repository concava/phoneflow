import {
  Agent,
  ChatContext,
  type ChatMessage,
  type JobContext,
  log,
  type ModelSettings,
  type ToolContext,
  tool,
  voice,
} from "@livekit/agents"
import { z } from "zod"

import type { ExtractVariablesTool } from "@workspace/shared/api/agent-config/types"
import type { CallSipConnection } from "@workspace/shared/api/calls/types"
import { evaluateExpression } from "@/flow/expression"
import {
  EXTRACT_INSTRUCTIONS,
  PLATFORM_INSTRUCTIONS,
  TRANSITION_INSTRUCTIONS,
} from "@/flow/prompts"
import { createSendDtmfTool } from "@/flow/tools/dtmf"
import { createTransferCallTool } from "@/flow/tools/transfer-call"
import { createWebhookTool, runFunctionNodeWebhook } from "@/flow/tools/webhook"
import type {
  FlowConversationNode,
  FlowFunctionNode,
  FlowGraph,
  FlowNode,
} from "@/flow/types"
import type { Variables } from "@/flow/variables"
import { endCall } from "@/lib/end-call"

const MAX_CONSECUTIVE_FUNCTION_NODES = 20

function buildNodeInstructions(
  graph: FlowGraph,
  node: FlowGraph["startNode"],
  variables: Variables
) {
  const parts = [PLATFORM_INSTRUCTIONS]

  if (graph.globalPrompt) {
    parts.push(variables.replace(graph.globalPrompt))
  }

  if (node.type === "function") {
    return parts.join("\n\n")
  }

  if (node.instructions.type === "prompt") {
    parts.push(variables.replace(node.instructions.text))
  }

  if (node.extractVariables) {
    parts.push(EXTRACT_INSTRUCTIONS)
  }

  if (node.outgoingEdges.some((edge) => edge.condition.type === "prompt")) {
    parts.push(TRANSITION_INSTRUCTIONS)
  }

  return parts.join("\n\n")
}

export class FlowAgent extends Agent {
  private readonly graph: FlowGraph
  private readonly variables: Variables
  private readonly sip: CallSipConnection | null
  private readonly callId: string
  private readonly room: JobContext["room"]
  private readonly exiting = new AbortController()
  private consecutiveFunctionNodes = 0

  constructor(
    graph: FlowGraph,
    variables: Variables,
    sip: CallSipConnection | null,
    callId: string,
    room: JobContext["room"]
  ) {
    super({
      instructions: buildNodeInstructions(graph, graph.startNode, variables),
    })

    this.graph = graph
    this.variables = variables
    this.sip = sip
    this.callId = callId
    this.room = room
  }

  get isRunningFunctionNode() {
    return this.consecutiveFunctionNodes > 0
  }

  private async publishActiveNode(node: FlowNode) {
    if (this.variables.get("direction") !== "web") return

    await this.room.localParticipant?.setAttributes({
      active_node_id: node.id,
    })
  }

  private buildNodeTools(node: FlowConversationNode) {
    const tools = []
    let conditionIndex = 0

    for (const edge of node.outgoingEdges) {
      if (edge.condition.type !== "prompt") {
        continue
      }

      conditionIndex++

      tools.push(
        tool({
          name: `notify_condition_${conditionIndex}_met`,
          description: `Call this tool when the following condition is met: ${this.variables.replace(edge.condition.prompt)}`,
          execute: async () => {
            await this.transitionTo(edge.targetNode)
          },
        })
      )
    }

    if (node.endCall) {
      const description = this.variables.replace(node.endCall.description)
      tools.push(
        tool({
          name: "end_call",
          description,
          execute: async (_args, { ctx }) => {
            await ctx.waitForPlayout()
            await endCall()
          },
        })
      )
    }

    if (node.ivrNavigation) {
      tools.push(createSendDtmfTool(node.ivrNavigation, this.variables))
    }

    if (node.extractVariables) {
      tools.push(this.buildExtractTool(node, node.extractVariables))
    }

    if (node.transferCall && this.sip) {
      tools.push(
        createTransferCallTool(
          node.transferCall,
          this.variables,
          this.sip,
          this.callId
        )
      )
    }

    for (const toolId of node.toolIds ?? []) {
      const definition = this.graph.tools.find((entry) => entry.id === toolId)
      if (definition?.type === "webhook") {
        tools.push(createWebhookTool(definition, this.variables))
      }
    }

    return tools
  }

  private buildExtractTool(
    node: FlowConversationNode,
    extractVariables: ExtractVariablesTool
  ) {
    const shape: Record<string, z.ZodType> = {}

    for (const variable of extractVariables.variables) {
      let field: z.ZodType =
        variable.type === "number"
          ? z.number()
          : variable.type === "boolean"
            ? z.boolean()
            : z.string()

      if (variable.description) {
        field = field.describe(this.variables.replace(variable.description))
      }

      shape[variable.key] = field.optional()
    }

    return tool({
      name: "extract_variables",
      description:
        "Call this tool when the user provides some of the requested values",
      parameters: z.object(shape),
      execute: async (args) => {
        for (const [key, value] of Object.entries(args)) {
          this.variables.set(key, String(value))
        }

        const target = this.matchedTarget(node)
        if (target) {
          await this.transitionTo(target)
        }
      },
    })
  }

  private matchedTarget(
    node: FlowConversationNode | FlowFunctionNode
  ): FlowNode | undefined {
    const edge =
      node.outgoingEdges.find(
        (candidate) =>
          candidate.condition.type === "expression" &&
          evaluateExpression(candidate.condition, this.variables)
      ) ??
      node.outgoingEdges.find(
        (candidate) => candidate.condition.type === "always"
      )
    return edge?.targetNode
  }

  private async transitionTo(node: FlowNode) {
    await this.publishActiveNode(node)

    if (node.type === "end") {
      await endCall()
      return
    }

    if (node.type === "function") {
      await this.runFunctionNode(node)
      return
    }

    await this.updateInstructions(
      buildNodeInstructions(this.graph, node, this.variables)
    )
    await this.updateTools(this.buildNodeTools(node))
    this.consecutiveFunctionNodes = 0
    await this.enterNode(node)
  }

  private async runFunctionNode(node: FlowFunctionNode) {
    const logger = log().child({ callId: this.callId, nodeId: node.id })

    this.consecutiveFunctionNodes += 1
    if (this.consecutiveFunctionNodes > MAX_CONSECUTIVE_FUNCTION_NODES) {
      logger.error("too many consecutive function nodes, ending the call")
      await endCall()
      return
    }

    const definition = this.graph.tools.find(
      (entry) => entry.id === node.toolId
    )
    if (!definition) {
      logger.error("function node tool not found, ending the call")
      await endCall()
      return
    }

    // The message plays while the webhook runs, so it adds no latency to it.
    const message = this.sayFunctionNodeMessage(node, logger)
    const result = await runFunctionNodeWebhook(
      definition,
      this.variables,
      this.exiting.signal
    )
    await message

    if (this.exiting.signal.aborted) {
      return
    }
    if (!result.ok) {
      // The output of an HTTP failure quotes the response body, which is not logged.
      logger.warn(
        result.status === undefined
          ? { reason: result.output }
          : { status: result.status },
        "function node webhook failed"
      )
    }

    const target = this.matchedTarget(node)
    if (!target) {
      logger.warn("no edge matched after function node, ending the call")
      await endCall()
      return
    }

    await this.transitionTo(target)
  }

  private async sayFunctionNodeMessage(
    node: FlowFunctionNode,
    logger: ReturnType<typeof log>
  ) {
    const text = node.message && this.variables.replace(node.message).trim()
    if (!text) {
      return
    }

    try {
      await this.session.say(text).waitForPlayout()
    } catch (error) {
      logger.warn({ error }, "could not play function node message")
    }
  }

  private async enterNode(node: FlowConversationNode) {
    const speech =
      node.instructions.type === "say"
        ? this.session.say(this.variables.replace(node.instructions.text))
        : this.session.generateReply()

    const target = this.matchedTarget(node)
    if (target) {
      await speech.waitForPlayout()
      await this.transitionTo(target)
    }
  }

  override async onEnter() {
    const startNode = this.graph.startNode
    if (startNode.type === "function") {
      await this.transitionTo(startNode)
      return
    }

    await this.publishActiveNode(startNode)
    await this.updateTools(this.buildNodeTools(startNode))

    if (startNode.startSpeaker === "agent") {
      await this.enterNode(startNode)
    }
  }

  override async onExit() {
    this.exiting.abort()
  }

  // A function node decides what comes next, so a turn that ends while one runs
  // gets no reply of its own. It is kept for the next conversation node to answer.
  override async onUserTurnCompleted(
    _chatCtx: ChatContext,
    newMessage: ChatMessage
  ) {
    if (!this.isRunningFunctionNode) {
      return
    }

    // LiveKit fills the metrics after this callback, but StopResponse skips that,
    // and the call transcript drops messages without a start time.
    newMessage.metrics = {
      ...newMessage.metrics,
      startedSpeakingAt: Date.now() / 1000,
    }
    this._chatCtx.insert(newMessage)
    this.session._conversationItemAdded(newMessage)
    throw new voice.StopResponse()
  }

  override llmNode(
    chatCtx: ChatContext,
    toolCtx: ToolContext,
    modelSettings: ModelSettings
  ) {
    const cleaned = new ChatContext(
      chatCtx.items.filter(
        (item) => !("name" in item && item.name.startsWith("notify_condition_"))
      )
    )

    return super.llmNode(cleaned, toolCtx, modelSettings)
  }
}
