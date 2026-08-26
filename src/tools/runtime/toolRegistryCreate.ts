import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type ToolName, toolNameSchema } from "../schema/toolNameSchema.js"
import type { RegisteredTool } from "./registeredTool.js"
import type { ToolDefinition } from "./toolDefinition.js"
import { toolErrorCodes } from "./toolErrorCodes.js"
import type { ToolExecutionContext } from "./toolExecutionContext.js"
import type { ToolRegistry } from "./toolRegistry.js"

const DEFAULT_OUTPUT_LIMIT = 16_384
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_OUTPUT_LIMIT = 1_048_576
const MAX_TIMEOUT_MS = 120_000

const toolDefinitionShapeSchema = v.strictObject({
  enabled: v.optional(v.boolean()),
  execute: v.unknown(),
  inputSchema: v.unknown(),
  name: v.unknown(),
  outputSchema: v.unknown(),
})

const toolExecutionContextSchema = v.strictObject({
  outputLimit: v.optional(v.number()),
  signal: v.unknown(),
  timeoutMs: v.optional(v.nullable(v.number())),
  toolCallId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
})

const toolExecutionErrorSchema = v.strictObject({
  code: v.optional(v.string()),
  errorData: v.optional(v.nullable(v.string())),
  errorMessage: v.string(),
  op: v.string(),
  statusCode: v.optional(v.number()),
  success: v.literal(false),
})

type ToolSchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>

type ToolExecutionOutcome =
  | { type: "aborted" }
  | { type: "error" }
  | { type: "timeout" }
  | { result: Result<unknown>; type: "result" }

function toolRegistryError(code: string, message: string) {
  return createResultErrorCode("toolRegistry", message, code)
}

function toolRegistryIsAbortSignal(value: unknown): value is AbortSignal {
  if (typeof value !== "object" || value === null) return false
  if (!("aborted" in value) || typeof value.aborted !== "boolean") return false
  if (!("addEventListener" in value) || typeof value.addEventListener !== "function") return false
  return "removeEventListener" in value && typeof value.removeEventListener === "function"
}

function toolRegistryIsSchema(value: unknown): value is ToolSchema {
  if (typeof value !== "object" || value === null) return false
  if (!("kind" in value) || value.kind !== "schema") return false
  if (!("async" in value) || value.async !== false) return false
  return "~run" in value && typeof value["~run"] === "function"
}

function toolRegistryIsBoundedInteger(value: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= maximum
}

function toolRegistryOutputLength(output: unknown): number | null {
  if (typeof output === "string") return output.length

  try {
    const serialized = JSON.stringify(output)
    return serialized === undefined ? 0 : serialized.length
  } catch {
    return null
  }
}

function toolRegistryDefinitionParse(definition: unknown): Result<RegisteredTool> {
  const parsed = v.safeParse(toolDefinitionShapeSchema, definition)
  if (!parsed.success) return toolRegistryError(toolErrorCodes.invalidDefinition, "The tool definition is invalid.")

  const parsedName = v.safeParse(toolNameSchema, parsed.output.name)
  if (!parsedName.success) return toolRegistryError(toolErrorCodes.invalidDefinition, "The tool definition is invalid.")
  if (typeof parsed.output.execute !== "function")
    return toolRegistryError(toolErrorCodes.invalidDefinition, "The tool definition is invalid.")
  if (!toolRegistryIsSchema(parsed.output.inputSchema) || !toolRegistryIsSchema(parsed.output.outputSchema))
    return toolRegistryError(toolErrorCodes.invalidDefinition, "The tool definition is invalid.")
  if (parsed.output.enabled !== undefined && typeof parsed.output.enabled !== "boolean")
    return toolRegistryError(toolErrorCodes.invalidDefinition, "The tool definition is invalid.")

  return createResult({
    enabled: parsed.output.enabled ?? true,
    execute: parsed.output.execute as RegisteredTool["execute"],
    inputSchema: parsed.output.inputSchema,
    name: parsedName.output,
    outputSchema: parsed.output.outputSchema,
  })
}

function toolRegistryContextParse(context: unknown): Result<{
  outputLimit: number
  signal: AbortSignal
  timeoutMs: number | null
  toolCallId: string
}> {
  const parsed = v.safeParse(toolExecutionContextSchema, context)
  if (!parsed.success || !toolRegistryIsAbortSignal(parsed.output.signal))
    return toolRegistryError(toolErrorCodes.invalidContext, "The tool execution context is invalid.")

  const timeoutMs = parsed.output.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : parsed.output.timeoutMs
  if (timeoutMs !== null && !toolRegistryIsBoundedInteger(timeoutMs, MAX_TIMEOUT_MS))
    return toolRegistryError(toolErrorCodes.invalidContext, "The tool execution context is invalid.")

  const outputLimit = parsed.output.outputLimit ?? DEFAULT_OUTPUT_LIMIT
  if (!toolRegistryIsBoundedInteger(outputLimit, MAX_OUTPUT_LIMIT))
    return toolRegistryError(toolErrorCodes.invalidContext, "The tool execution context is invalid.")

  return createResult({
    outputLimit,
    signal: parsed.output.signal,
    timeoutMs,
    toolCallId: parsed.output.toolCallId,
  })
}

function toolRegistryInputParse(tool: RegisteredTool, rawInput: unknown): Result<unknown> {
  try {
    const parsed = v.safeParse(tool.inputSchema, rawInput)
    if (!parsed.success) return toolRegistryError(toolErrorCodes.invalidInput, `The ${tool.name} input is invalid.`)
    return createResult(parsed.output)
  } catch {
    return toolRegistryError(toolErrorCodes.invalidInput, `The ${tool.name} input is invalid.`)
  }
}

function toolRegistryOutputParse(tool: RegisteredTool, output: unknown, outputLimit: number): Result<unknown> {
  let parsed: v.SafeParseResult<ToolSchema>
  try {
    parsed = v.safeParse(tool.outputSchema, output)
  } catch {
    return toolRegistryError(toolErrorCodes.invalidOutput, `The ${tool.name} output is invalid.`)
  }
  if (!parsed.success) return toolRegistryError(toolErrorCodes.invalidOutput, `The ${tool.name} output is invalid.`)

  const outputLength = toolRegistryOutputLength(parsed.output)
  if (outputLength === null)
    return toolRegistryError(toolErrorCodes.invalidOutput, `The ${tool.name} output is invalid.`)
  if (outputLength > outputLimit)
    return toolRegistryError(toolErrorCodes.outputLimit, `The ${tool.name} output exceeded the limit.`)
  return createResult(parsed.output)
}

async function toolRegistryExecutionRun(
  tool: RegisteredTool,
  input: unknown,
  context: {
    outputLimit: number
    signal: AbortSignal
    timeoutMs: number | null
    toolCallId: string
  },
): Promise<Result<unknown>> {
  if (context.signal.aborted)
    return toolRegistryError(toolErrorCodes.aborted, `The ${tool.name} execution was aborted.`)

  const executionController = new AbortController()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  let settled = false
  let resolveOutcome: ((outcome: ToolExecutionOutcome) => void) | undefined
  const outcomePromise = new Promise<ToolExecutionOutcome>((resolve) => {
    resolveOutcome = resolve
  })
  const settle = (outcome: ToolExecutionOutcome) => {
    if (settled) return
    settled = true
    resolveOutcome?.(outcome)
  }
  const abortFromParent = () => {
    executionController.abort(context.signal.reason)
    settle({ type: "aborted" })
  }

  context.signal.addEventListener("abort", abortFromParent, { once: true })
  if (context.signal.aborted) {
    abortFromParent()
  } else {
    if (context.timeoutMs !== null) {
      timeoutHandle = setTimeout(() => {
        executionController.abort("tool-timeout")
        settle({ type: "timeout" })
      }, context.timeoutMs)
    }

    Promise.resolve()
      .then(() =>
        tool.execute(
          {
            outputLimit: context.outputLimit,
            signal: executionController.signal,
            ...(context.timeoutMs === null ? {} : { timeoutMs: context.timeoutMs }),
            toolCallId: context.toolCallId,
          },
          input,
        ),
      )
      .then(
        (result) => {
          if (context.signal.aborted) {
            abortFromParent()
            return
          }
          if (typeof result !== "object" || result === null || typeof result.success !== "boolean") {
            settle({ type: "error" })
            return
          }
          settle({ result, type: "result" })
        },
        () => settle({ type: "error" }),
      )
  }

  const outcome = await outcomePromise
  context.signal.removeEventListener("abort", abortFromParent)
  if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)

  if (outcome.type === "aborted")
    return toolRegistryError(toolErrorCodes.aborted, `The ${tool.name} execution was aborted.`)
  if (outcome.type === "timeout")
    return toolRegistryError(toolErrorCodes.timeout, `The ${tool.name} execution timed out.`)
  if (outcome.type === "error")
    return toolRegistryError(toolErrorCodes.executionFailed, `The ${tool.name} execution failed.`)
  if (!outcome.result.success) {
    const parsedError = v.safeParse(toolExecutionErrorSchema, outcome.result)
    if (!parsedError.success)
      return toolRegistryError(toolErrorCodes.executionFailed, `The ${tool.name} execution failed.`)
    return outcome.result
  }
  return toolRegistryOutputParse(tool, outcome.result.data, context.outputLimit)
}

export function toolRegistryCreate(): ToolRegistry {
  const tools = new Map<ToolName, RegisteredTool>()

  const register = <TInputSchema extends ToolSchema, TOutputSchema extends ToolSchema>(
    definition: ToolDefinition<TInputSchema, TOutputSchema>,
  ): Result<void> => {
    const parsed = toolRegistryDefinitionParse(definition)
    if (!parsed.success) return parsed
    if (tools.has(parsed.data.name))
      return toolRegistryError(
        toolErrorCodes.registrationConflict,
        `The ${parsed.data.name} tool is already registered.`,
      )
    tools.set(parsed.data.name, parsed.data)
    return createResult(undefined)
  }

  const get = (name: ToolName): RegisteredTool | undefined => tools.get(name)

  const list = (): readonly ToolName[] => {
    const enabledNames = new Set([...tools.values()].filter((tool) => tool.enabled).map((tool) => tool.name))
    return Object.freeze(toolNameSchema.options.filter((name) => enabledNames.has(name)))
  }

  const execute = async (name: unknown, rawInput: unknown, context: ToolExecutionContext): Promise<Result<unknown>> => {
    const parsedName = v.safeParse(toolNameSchema, name)
    if (!parsedName.success) return toolRegistryError(toolErrorCodes.invalidName, "The tool name is invalid.")

    const tool = tools.get(parsedName.output)
    if (tool === undefined)
      return toolRegistryError(toolErrorCodes.unknown, `The ${parsedName.output} tool is not registered.`)
    if (!tool.enabled) return toolRegistryError(toolErrorCodes.disabled, `The ${parsedName.output} tool is disabled.`)

    const parsedContext = toolRegistryContextParse(context)
    if (!parsedContext.success) return parsedContext
    const parsedInput = toolRegistryInputParse(tool, rawInput)
    if (!parsedInput.success) return parsedInput
    return toolRegistryExecutionRun(tool, parsedInput.data, parsedContext.data)
  }

  return { execute, get, list, register }
}
