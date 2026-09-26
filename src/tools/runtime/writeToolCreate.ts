import type { Result } from "@adaptive-ds/result"
import { writeExecute } from "../actions/writeExecute.js"
import type { FileSystem } from "../filesystem/fileSystem.js"
import type { WriteToolInput } from "../schema/writeToolInputSchema.js"
import { writeToolInputSchema } from "../schema/writeToolInputSchema.js"
import type { WriteToolOutput } from "../schema/writeToolOutputSchema.js"
import { writeToolOutputSchema } from "../schema/writeToolOutputSchema.js"
import type { ToolDefinition } from "./toolDefinition.js"

export type WriteToolExecute = (
  input: WriteToolInput,
  options: {
    readonly fileSystem: FileSystem
    readonly outputLimit: number
    readonly projectRoot: string
    readonly signal: AbortSignal
    readonly timeoutMs: number | null
  },
) => Promise<Result<WriteToolOutput>>

export type WriteToolCreateOptions = {
  readonly execute?: WriteToolExecute
  readonly fileSystem: FileSystem
  readonly projectRoot: string
}

export type WriteToolDefinition = ToolDefinition<typeof writeToolInputSchema, typeof writeToolOutputSchema>

export type WriteToolCreate = (options: WriteToolCreateOptions) => WriteToolDefinition

export function writeToolCreate(options: WriteToolCreateOptions): WriteToolDefinition {
  const execute = options.execute ?? writeExecute
  return {
    execute: (context, input) =>
      execute(input, {
        fileSystem: options.fileSystem,
        outputLimit: context.outputLimit ?? 16_384,
        projectRoot: options.projectRoot,
        signal: context.signal,
        timeoutMs: context.timeoutMs === undefined ? 30_000 : context.timeoutMs,
      }),
    inputSchema: writeToolInputSchema,
    name: "write",
    outputSchema: writeToolOutputSchema,
  }
}
