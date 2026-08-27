import type { Result } from "@adaptive-ds/result"
import { bashExecute } from "../actions/bashExecute.js"
import type { BashToolInput } from "../schema/bashToolInputSchema.js"
import { bashToolInputSchema } from "../schema/bashToolInputSchema.js"
import type { BashToolOutput } from "../schema/bashToolOutputSchema.js"
import { bashToolOutputSchema } from "../schema/bashToolOutputSchema.js"
import type { ToolDefinition } from "./toolDefinition.js"

export type BashToolExecute = (
  input: BashToolInput,
  options: { outputLimit: number; projectRoot: string; signal: AbortSignal; timeoutMs: number | null },
) => Promise<Result<BashToolOutput>>

export type BashToolCreateOptions = {
  execute?: BashToolExecute
  projectRoot: string
}

export function bashToolCreate(
  options: BashToolCreateOptions,
): ToolDefinition<typeof bashToolInputSchema, typeof bashToolOutputSchema> {
  const execute = options.execute ?? bashExecute
  return {
    execute: (context, input) =>
      execute(input, {
        outputLimit: context.outputLimit ?? 16_384,
        projectRoot: options.projectRoot,
        signal: context.signal,
        timeoutMs: context.timeoutMs === undefined ? 30_000 : context.timeoutMs,
      }),
    inputSchema: bashToolInputSchema,
    name: "bash",
    outputSchema: bashToolOutputSchema,
  }
}
