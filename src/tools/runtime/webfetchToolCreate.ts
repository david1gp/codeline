import type { Result } from "@adaptive-ds/result"
import { type WebfetchFetch, webfetchExecute } from "../actions/webfetchExecute.js"
import type { WebfetchToolInput } from "../schema/webfetchToolInputSchema.js"
import { webfetchToolInputSchema } from "../schema/webfetchToolInputSchema.js"
import type { WebfetchToolOutput } from "../schema/webfetchToolOutputSchema.js"
import { webfetchToolOutputSchema } from "../schema/webfetchToolOutputSchema.js"
import type { ToolDefinition } from "./toolDefinition.js"

export type WebfetchToolExecute = (
  input: WebfetchToolInput,
  options: {
    maxResponseBytes?: number
    outputLimit: number
    signal: AbortSignal
    timeoutMs: number | null
  },
) => Promise<Result<WebfetchToolOutput>>

export type WebfetchToolCreateOptions = {
  execute?: WebfetchToolExecute
  fetch?: WebfetchFetch
  maxResponseBytes?: number
}

export function webfetchToolCreate(
  options: WebfetchToolCreateOptions = {},
): ToolDefinition<typeof webfetchToolInputSchema, typeof webfetchToolOutputSchema> {
  const fetch = options.fetch
  const maxResponseBytes = options.maxResponseBytes
  const defaultExecute: WebfetchToolExecute = (input, executionOptions) =>
    webfetchExecute(input, { ...executionOptions, fetch })
  const execute = options.execute ?? defaultExecute
  return {
    execute: (context, input) =>
      execute(input, {
        ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
        outputLimit: context.outputLimit ?? 16_384,
        signal: context.signal,
        timeoutMs: context.timeoutMs === undefined ? 30_000 : context.timeoutMs,
      }),
    inputSchema: webfetchToolInputSchema,
    name: "webfetch",
    outputSchema: webfetchToolOutputSchema,
  }
}
