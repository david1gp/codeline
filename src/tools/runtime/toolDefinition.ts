import type { Result } from "@adaptive-ds/result"
import type * as v from "valibot"
import type { ToolName } from "../schema/toolNameSchema.js"
import type { ToolExecutionContext } from "./toolExecutionContext.js"

type ToolSchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>

export type ToolDefinition<
  TInputSchema extends ToolSchema = ToolSchema,
  TOutputSchema extends ToolSchema = ToolSchema,
> = {
  enabled?: boolean
  execute: (
    context: ToolExecutionContext,
    input: v.InferOutput<TInputSchema>,
  ) => Promise<Result<v.InferOutput<TOutputSchema>>> | Result<v.InferOutput<TOutputSchema>>
  inputSchema: TInputSchema
  name: ToolName
  outputSchema: TOutputSchema
}
