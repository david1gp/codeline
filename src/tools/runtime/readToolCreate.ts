import type { Result } from "@adaptive-ds/result"
import { readExecute } from "../actions/readExecute.js"
import type { FileSystem } from "../filesystem/fileSystem.js"
import type { ReadToolInput } from "../schema/readToolInputSchema.js"
import { readToolInputSchema } from "../schema/readToolInputSchema.js"
import type { ReadToolOutput } from "../schema/readToolOutputSchema.js"
import { readToolOutputSchema } from "../schema/readToolOutputSchema.js"
import type { ToolDefinition } from "./toolDefinition.js"

export type ReadToolExecute = (
  input: ReadToolInput,
  options: {
    readonly fileSystem: FileSystem
    readonly outputLimit: number
    readonly projectRoot: string
    readonly signal: AbortSignal
    readonly timeoutMs: number | null
  },
) => Promise<Result<ReadToolOutput>>

export type ReadToolCreateOptions = {
  readonly execute?: ReadToolExecute
  readonly fileSystem: FileSystem
  readonly projectRoot: string
}

export type ReadToolDefinition = ToolDefinition<typeof readToolInputSchema, typeof readToolOutputSchema>

export type ReadToolCreate = (options: ReadToolCreateOptions) => ReadToolDefinition

export function readToolCreate(options: ReadToolCreateOptions): ReadToolDefinition {
  const execute = options.execute ?? readExecute
  return {
    execute: (context, input) =>
      execute(input, {
        fileSystem: options.fileSystem,
        outputLimit: context.outputLimit ?? 16_384,
        projectRoot: options.projectRoot,
        signal: context.signal,
        timeoutMs: context.timeoutMs === undefined ? 30_000 : context.timeoutMs,
      }),
    inputSchema: readToolInputSchema,
    name: "read" as unknown as ReadToolDefinition["name"],
    outputSchema: readToolOutputSchema,
  }
}
