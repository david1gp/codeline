import type { Result } from "@adaptive-ds/result"
import { editExecute } from "../actions/editExecute.js"
import type { FileSystem } from "../filesystem/fileSystem.js"
import type { EditToolInput } from "../schema/editToolInputSchema.js"
import { editToolInputSchema } from "../schema/editToolInputSchema.js"
import type { EditToolOutput } from "../schema/editToolOutputSchema.js"
import { editToolOutputSchema } from "../schema/editToolOutputSchema.js"
import type { ToolDefinition } from "./toolDefinition.js"

export type EditToolExecute = (
  input: EditToolInput,
  options: {
    readonly fileSystem: FileSystem
    readonly outputLimit: number
    readonly projectRoot: string
    readonly signal: AbortSignal
    readonly timeoutMs: number | null
  },
) => Promise<Result<EditToolOutput>>

export type EditToolCreateOptions = {
  readonly execute?: EditToolExecute
  readonly fileSystem: FileSystem
  readonly projectRoot: string
}

export type EditToolDefinition = ToolDefinition<typeof editToolInputSchema, typeof editToolOutputSchema>

export type EditToolCreate = (options: EditToolCreateOptions) => EditToolDefinition

export function editToolCreate(options: EditToolCreateOptions): EditToolDefinition {
  const execute = options.execute ?? editExecute
  return {
    execute: (context, input) =>
      execute(input, {
        fileSystem: options.fileSystem,
        outputLimit: context.outputLimit ?? 16_384,
        projectRoot: options.projectRoot,
        signal: context.signal,
        timeoutMs: context.timeoutMs === undefined ? 30_000 : context.timeoutMs,
      }),
    inputSchema: editToolInputSchema,
    name: "edit",
    outputSchema: editToolOutputSchema,
  }
}
