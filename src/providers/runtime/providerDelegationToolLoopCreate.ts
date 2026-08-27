import {
  type AnyTextAdapter,
  chat,
  EventType,
  type ModelMessage,
  type SchemaInput,
  type StreamChunk,
  toolDefinition,
} from "@tanstack/ai"
import * as v from "valibot"
import { agentInstructionsContentRender } from "../../instructions/actions/agentInstructionsContentRender.js"
import { agentInstructionsForPathResolve } from "../../instructions/actions/agentInstructionsForPathResolve.js"
import { skillDescriptionCatalogRender } from "../../skills/actions/skillDescriptionCatalogRender.js"
import { skillToolCreate } from "../../skills/runtime/skillToolCreate.js"
import type { SkillDescriptionCatalog } from "../../skills/schema/skillDescriptionCatalogSchema.js"
import { skillDescriptionCatalogSchema } from "../../skills/schema/skillDescriptionCatalogSchema.js"
import { type SkillSnapshot } from "../../skills/schema/skillSnapshotSchema.js"
import { skillToolInputSchema } from "../../skills/schema/skillToolInputSchema.js"
import { type BashToolCreateOptions, bashToolCreate } from "../../tools/runtime/bashToolCreate.js"
import { type DelegateTaskToolExecute, delegateTaskToolCreate } from "../../tools/runtime/delegateTaskToolCreate.js"
import type { ToolRegistry } from "../../tools/runtime/toolRegistry.js"
import { toolRegistryCreate } from "../../tools/runtime/toolRegistryCreate.js"
import { toolResultWorkingDirectoryResolve } from "../../tools/runtime/toolResultWorkingDirectoryResolve.js"
import { type WebfetchToolCreateOptions, webfetchToolCreate } from "../../tools/runtime/webfetchToolCreate.js"
import { bashToolInputSchema } from "../../tools/schema/bashToolInputSchema.js"
import { delegateTaskInputSchema } from "../../tools/schema/delegateTaskInputSchema.js"
import { type ToolName, toolNameSchema } from "../../tools/schema/toolNameSchema.js"
import { webfetchToolInputSchema } from "../../tools/schema/webfetchToolInputSchema.js"
import { providerExecutionEventFromStreamChunk } from "./providerExecutionEventFromStreamChunk.js"
import type { ProviderInstructionContext } from "./providerInstructionContext.js"

const DELEGATE_TASK_OUTPUT_LIMIT = 16_384
const BASH_OUTPUT_LIMIT = 16_384
const BASH_TIMEOUT_MS = 30_000
const WEBFETCH_OUTPUT_LIMIT = 16_384
const WEBFETCH_DEFAULT_TIMEOUT_MS = 30_000
const WEBFETCH_MAX_TIMEOUT_MS = 120_000
const SKILL_OUTPUT_LIMIT = 1_048_576

const delegateTaskProviderInputSchema: SchemaInput = {
  "~standard": {
    jsonSchema: {
      input: () => ({
        additionalProperties: false,
        properties: {
          agentId: { maxLength: 200, minLength: 1, type: "string" },
          task: { maxLength: 100_000, minLength: 1, type: "string" },
        },
        required: ["task"],
        type: "object",
      }),
    },
    validate: (input) => {
      const parsed = v.safeParse(delegateTaskInputSchema, input)
      return parsed.success ? { value: parsed.output } : { issues: parsed.issues }
    },
    vendor: "codeline",
    version: 1,
  },
}

const skillToolProviderInputSchema: SchemaInput = {
  "~standard": {
    jsonSchema: {
      input: () => ({
        additionalProperties: false,
        properties: {
          name: { maxLength: 200, minLength: 1, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", type: "string" },
          path: { maxLength: 4_096, minLength: 1, type: "string" },
          resourcePath: { maxLength: 4_096, minLength: 1, type: "string" },
        },
        required: ["name"],
        type: "object",
      }),
    },
    validate: (input) => {
      const parsed = v.safeParse(skillToolInputSchema, input)
      return parsed.success ? { value: parsed.output } : { issues: parsed.issues }
    },
    vendor: "codeline",
    version: 1,
  },
}

const bashToolProviderInputSchema: SchemaInput = {
  "~standard": {
    jsonSchema: {
      input: () => ({
        additionalProperties: false,
        properties: {
          command: { maxLength: 100_000, minLength: 1, type: "string" },
          workingDirectory: { maxLength: 4_096, minLength: 1, type: "string" },
        },
        required: ["command"],
        type: "object",
      }),
    },
    validate: (input) => {
      const parsed = v.safeParse(bashToolInputSchema, input)
      return parsed.success ? { value: parsed.output } : { issues: parsed.issues }
    },
    vendor: "codeline",
    version: 1,
  },
}

const webfetchToolProviderInputSchema: SchemaInput = {
  "~standard": {
    jsonSchema: {
      input: () => ({
        additionalProperties: false,
        properties: {
          format: { default: "markdown", enum: ["text", "markdown", "html"], type: "string" },
          timeout: { maximum: 120, minimum: 0.001, type: "number" },
          url: { maxLength: 8_192, minLength: 1, type: "string" },
        },
        required: ["url"],
        type: "object",
      }),
    },
    validate: (input) => {
      const parsed = v.safeParse(webfetchToolInputSchema, input)
      return parsed.success ? { value: parsed.output } : { issues: parsed.issues }
    },
    vendor: "codeline",
    version: 1,
  },
}

function providerDelegationStreamChunkJsonSafe(chunk: StreamChunk): StreamChunk {
  return Object.fromEntries(Object.entries(chunk).filter(([, value]) => value !== undefined)) as StreamChunk
}

export type ProviderDelegationToolLoopInput = {
  messages: Array<ModelMessage>
  runId: string
  signal: AbortSignal
  threadId: string
}

export type ProviderDelegationToolLoopOptions = {
  adapter: AnyTextAdapter
  bash?: BashToolCreateOptions
  delegateTask?: DelegateTaskToolExecute
  enabledTools?: readonly ToolName[]
  instructionContext?: ProviderInstructionContext
  skillDescriptionCatalog?: SkillDescriptionCatalog
  skillSnapshots?: readonly SkillSnapshot[]
  systemPrompt?: string
  toolRegistry?: ToolRegistry
  webfetch?: WebfetchToolCreateOptions
}

export type ProviderDelegationToolLoop = (input: ProviderDelegationToolLoopInput) => AsyncIterable<StreamChunk>

function providerDelegationToolRegistryResolve(options: ProviderDelegationToolLoopOptions): ToolRegistry {
  let registry = options.toolRegistry ?? toolRegistryCreate()
  const enabledTools = options.enabledTools === undefined ? undefined : new Set(options.enabledTools)
  if (enabledTools !== undefined) {
    const snapshotRegistry = toolRegistryCreate()
    for (const name of toolNameSchema.options) {
      const tool = registry.get(name)
      if (tool !== undefined) snapshotRegistry.register({ ...tool, enabled: enabledTools.has(name) })
    }
    registry = snapshotRegistry
  }
  if (options.bash !== undefined && registry.get("bash") === undefined)
    registry.register({
      ...bashToolCreate(options.bash),
      enabled: enabledTools?.has("bash") === true,
    })
  if (
    (options.webfetch !== undefined || enabledTools?.has("webfetch") === true) &&
    registry.get("webfetch") === undefined
  )
    registry.register({
      ...webfetchToolCreate(options.webfetch ?? {}),
      enabled: enabledTools?.has("webfetch") === true,
    })
  if (options.skillSnapshots !== undefined && registry.get("skill") !== undefined) {
    const snapshotRegistry = toolRegistryCreate()
    for (const name of toolNameSchema.options) {
      if (name === "skill") continue
      const tool = registry.get(name)
      if (tool !== undefined) snapshotRegistry.register(tool)
    }
    const skill = skillToolCreate({ activeSkills: options.skillSnapshots })
    snapshotRegistry.register({ ...skill, enabled: registry.get("skill")?.enabled })
    registry = snapshotRegistry
  }
  if (options.delegateTask !== undefined && registry.get("delegate_task") === undefined)
    registry.register({
      ...delegateTaskToolCreate({ execute: options.delegateTask }),
      ...(enabledTools === undefined ? {} : { enabled: enabledTools.has("delegate_task") }),
    })
  if (options.skillSnapshots !== undefined && registry.get("skill") === undefined)
    registry.register({
      ...skillToolCreate({ activeSkills: options.skillSnapshots }),
      ...(enabledTools === undefined ? {} : { enabled: enabledTools.has("skill") }),
    })
  return registry
}

function providerDelegationSkillDescriptionCatalogResolve(
  snapshots: readonly SkillSnapshot[] | undefined,
  catalog: SkillDescriptionCatalog | undefined,
): string | undefined {
  if (snapshots === undefined) return undefined
  const rendered = skillDescriptionCatalogRender(snapshots)
  if (!rendered.success) return undefined
  if (catalog !== undefined) {
    const parsed = v.safeParse(skillDescriptionCatalogSchema, catalog)
    if (parsed.success && parsed.output.content === rendered.data.content) return parsed.output.content
  }
  return rendered.data.content.trim().length === 0 ? undefined : rendered.data.content
}

type ProviderDelegationWorkingDirectories = Map<string, Map<string, string>>

function providerDelegationInstructionSystemPromptResolve(options: {
  declaredWorkingDirectories: ReadonlyMap<string, string>
  instructionContext?: ProviderInstructionContext
  messages: Array<ModelMessage>
  skillDescriptionCatalog?: string
  systemPrompt?: string
}): string | undefined {
  const prompts = [options.systemPrompt, options.skillDescriptionCatalog]
  if (options.instructionContext !== undefined) {
    const rootInstructions = agentInstructionsForPathResolve({
      projectRoot: options.instructionContext.projectRoot,
      snapshot: options.instructionContext.snapshot,
      workingDirectory: options.instructionContext.projectRoot,
    })
    if (rootInstructions.success) {
      prompts.push(rootInstructions.data.baseline)
      const workingDirectories = new Set(options.declaredWorkingDirectories.values())
      for (const message of options.messages) {
        if (message.role !== "tool") continue
        const workingDirectory = toolResultWorkingDirectoryResolve(message.content)
        if (workingDirectory !== undefined) workingDirectories.add(workingDirectory)
      }
      const overlayPaths = new Set<string>()
      for (const workingDirectory of workingDirectories) {
        const pathInstructions = agentInstructionsForPathResolve({
          projectRoot: options.instructionContext.projectRoot,
          snapshot: options.instructionContext.snapshot,
          workingDirectory,
        })
        if (!pathInstructions.success) continue
        for (const overlay of pathInstructions.data.overlays) overlayPaths.add(overlay.canonicalPath)
      }
      prompts.push(
        agentInstructionsContentRender(
          options.instructionContext.snapshot.snapshots.filter(({ canonicalPath }) => overlayPaths.has(canonicalPath)),
        ),
      )
    }
  }

  const resolved = prompts.filter((prompt): prompt is string => prompt !== undefined && prompt.trim().length > 0)
  return resolved.length === 0 ? undefined : resolved.join("\n\n")
}

function providerDelegationInstructionAdapterCreate(options: {
  adapter: AnyTextAdapter
  declaredWorkingDirectoriesByRun: ProviderDelegationWorkingDirectories
  instructionContext?: ProviderInstructionContext
  skillDescriptionCatalogContent?: string
  systemPrompt?: string
}): AnyTextAdapter {
  const adapter = Object.create(options.adapter) as AnyTextAdapter
  adapter.chatStream = (input: Parameters<AnyTextAdapter["chatStream"]>[0]) => {
    const runKey = input.runId ?? input.threadId ?? "delegation-run"
    const declaredWorkingDirectories = options.declaredWorkingDirectoriesByRun.get(runKey) ?? new Map<string, string>()
    if (!input.messages.some((message) => message.role === "tool")) declaredWorkingDirectories.clear()
    options.declaredWorkingDirectoriesByRun.set(runKey, declaredWorkingDirectories)
    const systemPrompt = providerDelegationInstructionSystemPromptResolve({
      declaredWorkingDirectories,
      instructionContext: options.instructionContext,
      messages: input.messages,
      skillDescriptionCatalog: options.skillDescriptionCatalogContent,
      systemPrompt: options.systemPrompt,
    })
    return options.adapter.chatStream({
      ...input,
      ...(systemPrompt === undefined ? {} : { systemPrompts: [systemPrompt] }),
    })
  }
  return adapter
}

function providerDelegationToolCreate(registry: ToolRegistry, signal: AbortSignal) {
  return toolDefinition({
    description: "Run one synchronous delegated coding task and return its text result.",
    inputSchema: delegateTaskProviderInputSchema,
    name: "delegate_task",
  }).server(async (rawInput, context) => {
    const toolCallId = context?.toolCallId
    if (toolCallId === undefined || toolCallId === "") throw new Error("The delegation tool call ID is required.")

    const executionSignal = context?.abortSignal ?? signal
    if (executionSignal.aborted) throw new Error("The delegated task was cancelled.")

    const result = await registry.execute("delegate_task", rawInput, {
      outputLimit: DELEGATE_TASK_OUTPUT_LIMIT,
      signal: executionSignal,
      timeoutMs: null,
      toolCallId,
    })
    if (!result.success) throw new Error(result.errorMessage)
    return result.data
  })
}

function providerDelegationSkillToolCreate(registry: ToolRegistry, signal: AbortSignal) {
  return toolDefinition({
    description:
      "Load an active snapshotted skill's instructions and an optional bundle-relative resource from the available skills list.",
    inputSchema: skillToolProviderInputSchema,
    name: "skill",
  }).server(async (rawInput, context) => {
    const toolCallId = context?.toolCallId
    if (toolCallId === undefined || toolCallId === "") throw new Error("The skill tool call ID is required.")

    const executionSignal = context?.abortSignal ?? signal
    if (executionSignal.aborted) throw new Error("The skill load was cancelled.")

    const result = await registry.execute("skill", rawInput, {
      outputLimit: SKILL_OUTPUT_LIMIT,
      signal: executionSignal,
      timeoutMs: null,
      toolCallId,
    })
    if (!result.success) throw new Error(result.errorMessage)
    return result.data
  })
}

function providerDelegationBashToolCreate(registry: ToolRegistry, signal: AbortSignal) {
  return toolDefinition({
    description: "Run a bounded bash command in the project or one of its descendant directories.",
    inputSchema: bashToolProviderInputSchema,
    name: "bash",
  }).server(async (rawInput, context) => {
    const toolCallId = context?.toolCallId
    if (toolCallId === undefined || toolCallId === "") throw new Error("The bash tool call ID is required.")

    const executionSignal = context?.abortSignal ?? signal
    if (executionSignal.aborted) throw new Error("The bash command was cancelled.")

    const result = await registry.execute("bash", rawInput, {
      outputLimit: BASH_OUTPUT_LIMIT,
      signal: executionSignal,
      timeoutMs: BASH_TIMEOUT_MS,
      toolCallId,
    })
    if (!result.success) throw new Error(result.errorMessage)
    return result.data
  })
}

function providerDelegationWebfetchTimeoutResolve(rawInput: unknown): number {
  const parsed = v.safeParse(webfetchToolInputSchema, rawInput)
  if (!parsed.success || parsed.output.timeout === undefined) return WEBFETCH_DEFAULT_TIMEOUT_MS
  return Math.min(WEBFETCH_MAX_TIMEOUT_MS, Math.max(1, Math.ceil(parsed.output.timeout * 1_000)))
}

function providerDelegationWebfetchToolCreate(registry: ToolRegistry, signal: AbortSignal) {
  return toolDefinition({
    description: "Fetch bounded textual content from an HTTP or HTTPS URL as text, Markdown, or HTML.",
    inputSchema: webfetchToolProviderInputSchema,
    name: "webfetch",
  }).server(async (rawInput, context) => {
    const toolCallId = context?.toolCallId
    if (toolCallId === undefined || toolCallId === "") throw new Error("The webfetch tool call ID is required.")

    const executionSignal = context?.abortSignal ?? signal
    if (executionSignal.aborted) throw new Error("The webfetch request was cancelled.")

    const result = await registry.execute("webfetch", rawInput, {
      outputLimit: WEBFETCH_OUTPUT_LIMIT,
      signal: executionSignal,
      timeoutMs: providerDelegationWebfetchTimeoutResolve(rawInput),
      toolCallId,
    })
    if (!result.success) throw new Error(result.errorMessage)
    return result.data
  })
}

export function providerDelegationToolLoopCreate(
  options: ProviderDelegationToolLoopOptions,
): ProviderDelegationToolLoop {
  const toolRegistry = providerDelegationToolRegistryResolve(options)
  const enabledTools = options.enabledTools === undefined ? undefined : new Set(options.enabledTools)
  const declaredWorkingDirectoriesByRun: ProviderDelegationWorkingDirectories = new Map()
  const adapter = providerDelegationInstructionAdapterCreate({
    adapter: options.adapter,
    declaredWorkingDirectoriesByRun,
    instructionContext: options.instructionContext,
    skillDescriptionCatalogContent: providerDelegationSkillDescriptionCatalogResolve(
      options.skillSnapshots,
      options.skillDescriptionCatalog,
    ),
    systemPrompt: options.systemPrompt,
  })
  return (input) =>
    providerDelegationToolLoopGenerate(
      {
        adapter,
        bashEnabled: enabledTools?.has("bash") === true,
        webfetchEnabled: enabledTools?.has("webfetch") === true,
        declaredWorkingDirectoriesByRun,
        toolRegistry,
      },
      input,
    )
}

async function* providerDelegationToolLoopGenerate(
  options: {
    adapter: AnyTextAdapter
    bashEnabled: boolean
    declaredWorkingDirectoriesByRun: ProviderDelegationWorkingDirectories
    toolRegistry: ToolRegistry
    webfetchEnabled: boolean
  },
  input: ProviderDelegationToolLoopInput,
): AsyncGenerator<StreamChunk> {
  if (input.signal.aborted) return

  const abortController = new AbortController()
  const abort = () => abortController.abort(input.signal.reason)
  input.signal.addEventListener("abort", abort, { once: true })
  if (input.signal.aborted) abort()

  const delegateTask = providerDelegationToolCreate(options.toolRegistry, abortController.signal)
  const bash = providerDelegationBashToolCreate(options.toolRegistry, abortController.signal)
  const webfetch = providerDelegationWebfetchToolCreate(options.toolRegistry, abortController.signal)
  const skill = providerDelegationSkillToolCreate(options.toolRegistry, abortController.signal)
  const tools = [
    ...(options.bashEnabled && options.toolRegistry.get("bash")?.enabled === true ? [bash] : []),
    ...(options.webfetchEnabled && options.toolRegistry.get("webfetch")?.enabled === true ? [webfetch] : []),
    ...(options.toolRegistry.get("skill")?.enabled === true ? [skill] : []),
    ...(options.toolRegistry.get("delegate_task")?.enabled === true ? [delegateTask] : []),
  ]

  let finalChunk: Extract<StreamChunk, { type: "RUN_FINISHED" }> | undefined
  let emittedError = false
  let continuationText = ""
  let currentRoundHasToolCalls = false
  let currentRoundHasToolResult = false
  let delegatedResultRoundHasError = false
  let hasDelegatedResultRound = false
  const delegatedResultEventIds = new Set<string>()
  const toolCallNames = new Map<string, string>()
  const delegatedResults = new Map<string, string>()

  try {
    yield {
      type: EventType.RUN_STARTED,
      runId: input.runId,
      threadId: input.threadId,
      timestamp: Date.now(),
    }

    for await (const chunk of chat({
      abortController,
      adapter: options.adapter,
      messages: input.messages,
      runId: input.runId,
      threadId: input.threadId,
      tools,
    })) {
      if (chunk.type === EventType.RUN_STARTED) {
        currentRoundHasToolCalls = false
        currentRoundHasToolResult = false
        continuationText = ""
        continue
      }
      if (chunk.type === EventType.RUN_FINISHED) {
        finalChunk = chunk
        continue
      }
      if (chunk.type === EventType.RUN_ERROR) emittedError = true
      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) continuationText += chunk.delta
      if (chunk.type === EventType.TOOL_CALL_START) {
        if (hasDelegatedResultRound && (!currentRoundHasToolCalls || currentRoundHasToolResult)) {
          delegatedResults.clear()
          delegatedResultRoundHasError = false
          hasDelegatedResultRound = false
          continuationText = ""
        }
        currentRoundHasToolCalls = true
        delegatedResultEventIds.delete(chunk.toolCallId)
        const providerEvent = providerExecutionEventFromStreamChunk(chunk)
        if (providerEvent.success && providerEvent.data?.type === "tool_start")
          toolCallNames.set(providerEvent.data.toolCallId, providerEvent.data.toolName)
      }
      if (chunk.type === EventType.TOOL_CALL_RESULT) {
        const providerEvent = providerExecutionEventFromStreamChunk(chunk)
        if (providerEvent.success && providerEvent.data?.type === "tool_result") {
          if (
            toolCallNames.get(providerEvent.data.toolCallId) === "bash" &&
            providerEvent.data.workingDirectory !== undefined
          ) {
            const declaredWorkingDirectories =
              options.declaredWorkingDirectoriesByRun.get(input.runId) ?? new Map<string, string>()
            declaredWorkingDirectories.set(providerEvent.data.toolCallId, providerEvent.data.workingDirectory)
            options.declaredWorkingDirectoriesByRun.set(input.runId, declaredWorkingDirectories)
          }
          if (currentRoundHasToolCalls && !currentRoundHasToolResult) {
            delegatedResults.clear()
            delegatedResultRoundHasError = false
            hasDelegatedResultRound = true
            currentRoundHasToolResult = true
            continuationText = ""
          }

          if (delegatedResultEventIds.has(providerEvent.data.toolCallId)) continue
          delegatedResultEventIds.add(providerEvent.data.toolCallId)

          if (providerEvent.data.outcome === "error") {
            delegatedResultRoundHasError = true
          } else if (
            toolCallNames.get(providerEvent.data.toolCallId) === "delegate_task" &&
            typeof providerEvent.data.result === "string" &&
            providerEvent.data.result.trim().length > 0
          ) {
            delegatedResults.set(providerEvent.data.toolCallId, providerEvent.data.result)
          }
        }
      }
      yield providerDelegationStreamChunkJsonSafe(chunk)
    }
  } catch {
    if (!input.signal.aborted) {
      emittedError = true
      yield {
        code: "provider_delegation_tool_loop_error",
        message: "The provider delegation tool loop failed.",
        timestamp: Date.now(),
        type: EventType.RUN_ERROR,
      }
    }
  } finally {
    input.signal.removeEventListener("abort", abort)
    options.declaredWorkingDirectoriesByRun.delete(input.runId)
  }

  if (input.signal.aborted || abortController.signal.aborted) {
    yield {
      finishReason: "stop",
      outcome: { type: "interrupt", interrupts: [] },
      runId: input.runId,
      threadId: input.threadId,
      timestamp: Date.now(),
      type: EventType.RUN_FINISHED,
    }
    return
  }

  if (emittedError) return

  if (
    (finalChunk === undefined || finalChunk.outcome?.type === "success") &&
    continuationText.trim().length === 0 &&
    !delegatedResultRoundHasError &&
    delegatedResults.size > 0
  ) {
    const messageId = `${input.runId}:delegated-result`
    yield {
      messageId,
      role: "assistant",
      timestamp: Date.now(),
      type: EventType.TEXT_MESSAGE_START,
    }
    yield {
      delta: [...delegatedResults.values()].join("\n").slice(0, DELEGATE_TASK_OUTPUT_LIMIT),
      messageId,
      timestamp: Date.now(),
      type: EventType.TEXT_MESSAGE_CONTENT,
    }
    yield {
      messageId,
      timestamp: Date.now(),
      type: EventType.TEXT_MESSAGE_END,
    }
  }

  yield providerDelegationStreamChunkJsonSafe({
    ...(finalChunk ?? {}),
    finishReason: finalChunk?.finishReason ?? "stop",
    outcome: finalChunk?.outcome ?? { type: "success" },
    runId: input.runId,
    threadId: input.threadId,
    timestamp: Date.now(),
    type: EventType.RUN_FINISHED,
  })
}
