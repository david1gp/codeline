import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { toolErrorCodes } from "../../tools/runtime/toolErrorCodes.js"
import type { ToolRegistry } from "../../tools/runtime/toolRegistry.js"
import { bashToolInputSchema } from "../../tools/schema/bashToolInputSchema.js"
import { bashToolOutputSchema } from "../../tools/schema/bashToolOutputSchema.js"

export type CommandShellInterpolationResolveOptions = {
  outputLimit?: number
  registry: ToolRegistry
  signal: AbortSignal
  timeoutMs?: number | null
  workingDirectory?: string
}

function commandShellError(code: string, message: string) {
  return createResultErrorCode("commandShellInterpolationResolve", message, code)
}

function commandShellInterpolationOutputResolve(output: unknown): Result<string> {
  const parsed = v.safeParse(bashToolOutputSchema, output)
  if (!parsed.success) return commandShellError(toolErrorCodes.executionFailed, "The command shell output is invalid.")
  if (parsed.output.exitCode !== 0) {
    const detail = parsed.output.stderr.trim()
    return commandShellError(
      toolErrorCodes.executionFailed,
      detail.length === 0 ? `The interpolated bash command exited with code ${parsed.output.exitCode}.` : detail,
    )
  }
  return createResult(parsed.output.stdout.replace(/\s+$/u, ""))
}

export async function commandShellInterpolationResolve(
  text: string,
  options: CommandShellInterpolationResolveOptions,
): Promise<Result<string>> {
  const op = "commandShellInterpolationResolve"
  if (typeof text !== "string" || text.length > 100_000 || text.includes("\0"))
    return createResultErrorCode(op, "The command text is invalid.", toolErrorCodes.invalidInput)
  const interpolationPattern = /!`([\s\S]*?)`/gu
  const matches = [...text.matchAll(interpolationPattern)]
  if (matches.length === 0) return createResult(text)

  const bash = options.registry.get("bash")
  if (bash === undefined || !bash.enabled)
    return commandShellError(toolErrorCodes.disabled, "Command shell interpolation requires the enabled bash tool.")
  if (options.signal.aborted)
    return commandShellError(toolErrorCodes.aborted, "Command shell interpolation was aborted.")

  let expanded = ""
  let previous = 0
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    if (match === undefined || match.index === undefined) continue
    const command = match[1]
    if (command === undefined || command.trim().length === 0)
      return createResultErrorCode(op, "Interpolated bash commands must not be empty.", toolErrorCodes.invalidInput)
    const input = v.safeParse(bashToolInputSchema, {
      command,
      ...(options.workingDirectory === undefined ? {} : { workingDirectory: options.workingDirectory }),
    })
    if (!input.success)
      return commandShellError(toolErrorCodes.invalidInput, "The interpolated bash command is invalid.")
    const result = await options.registry.execute("bash", input.output, {
      outputLimit: options.outputLimit ?? 16_384,
      signal: options.signal,
      timeoutMs: options.timeoutMs === undefined ? 30_000 : options.timeoutMs,
      toolCallId: `command-shell-${index + 1}`,
    })
    if (!result.success) return result
    const output = commandShellInterpolationOutputResolve(result.data)
    if (!output.success) return output
    expanded += text.slice(previous, match.index) + output.data
    previous = match.index + match[0].length
  }
  expanded += text.slice(previous)
  if (expanded.length > 100_000)
    return commandShellError(toolErrorCodes.outputLimit, "The expanded command exceeds the maximum length.")
  return createResult(expanded)
}
