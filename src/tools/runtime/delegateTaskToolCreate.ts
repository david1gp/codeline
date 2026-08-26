import { createResult, type Result } from "@adaptive-ds/result"
import { delegateTaskInputSchema } from "../schema/delegateTaskInputSchema.js"
import type { DelegateTaskOutput } from "../schema/delegateTaskOutputSchema.js"
import { delegateTaskOutputSchema } from "../schema/delegateTaskOutputSchema.js"
import type { ToolDefinition } from "./toolDefinition.js"

const delegateTaskOutputLimit = 16_384

export type DelegateTaskToolExecute = (input: {
  agentId?: string
  signal: AbortSignal
  task: string
  toolCallId: string
}) => Promise<string> | string

export function delegateTaskToolCreate(options: {
  execute: DelegateTaskToolExecute
}): ToolDefinition<typeof delegateTaskInputSchema, typeof delegateTaskOutputSchema> {
  return {
    execute: async (context, input): Promise<Result<DelegateTaskOutput>> => {
      const result = await options.execute({
        ...(input.agentId === undefined ? {} : { agentId: input.agentId }),
        signal: context.signal,
        task: input.task,
        toolCallId: context.toolCallId,
      })
      if (typeof result !== "string") {
        return {
          errorMessage: "The delegated task result must be text.",
          op: "delegateTaskToolCreate",
          success: false,
        }
      }
      return createResult(result.slice(0, delegateTaskOutputLimit))
    },
    inputSchema: delegateTaskInputSchema,
    name: "delegate_task",
    outputSchema: delegateTaskOutputSchema,
  }
}
