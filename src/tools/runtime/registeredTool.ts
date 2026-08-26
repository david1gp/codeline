import type { Result } from "@adaptive-ds/result"
import type * as v from "valibot"
import type { ToolName } from "../schema/toolNameSchema.js"
import type { ToolExecutionContext } from "./toolExecutionContext.js"

type ToolSchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>

export type RegisteredTool = {
  enabled: boolean
  execute: (context: ToolExecutionContext, input: unknown) => Promise<Result<unknown>> | Result<unknown>
  inputSchema: ToolSchema
  name: ToolName
  outputSchema: ToolSchema
}
