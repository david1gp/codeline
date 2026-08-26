import type { Result } from "@adaptive-ds/result"
import type * as v from "valibot"
import type { ToolName } from "../schema/toolNameSchema.js"
import type { RegisteredTool } from "./registeredTool.js"
import type { ToolDefinition } from "./toolDefinition.js"
import type { ToolExecutionContext } from "./toolExecutionContext.js"

type ToolSchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>

export type ToolRegistry = {
  execute: (name: unknown, rawInput: unknown, context: ToolExecutionContext) => Promise<Result<unknown>>
  get: (name: ToolName) => RegisteredTool | undefined
  list: () => readonly ToolName[]
  register: <TInputSchema extends ToolSchema, TOutputSchema extends ToolSchema>(
    definition: ToolDefinition<TInputSchema, TOutputSchema>,
  ) => Result<void>
}
