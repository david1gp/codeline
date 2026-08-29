import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { type AnyTool, EventType, type ModelMessage, type StreamChunk } from "@tanstack/ai"
import { InternalLogger } from "@tanstack/ai/adapter-internals"
import type { sessionChatAdapterCreate } from "../../session/actions/sessionChatAdapterCreate.js"
import type { CliProxyApiSettings } from "./cliProxyApiSettingsParse.js"
import { providerOpenAiCompatibleTextAdapterCreate } from "./providerOpenAiCompatibleTextAdapterCreate.js"
import { secretReferenceResolve } from "./secretReferenceResolve.js"

export type CliProxyApiAdapterFailure = {
  atChunkIndex?: number
  code?: string
  failBeforeStart?: boolean
  message?: string
}

export type CliProxyApiAdapterOptions = {
  chunks?: readonly string[]
  environment: Readonly<Record<string, string | undefined>>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  failure?: CliProxyApiAdapterFailure
  label?: string
  settings: CliProxyApiSettings
  systemPrompt?: string
}

export type CliProxyApiAdapterInput = Parameters<typeof sessionChatAdapterCreate>[0] & {
  compaction?: boolean
  currentUserMessageIncluded?: boolean
  systemPrompt?: string
  tools?: Array<AnyTool>
}

export type CliProxyApiAdapter = (input: CliProxyApiAdapterInput) => AsyncIterable<StreamChunk>

export function cliProxyApiAdapterCreate(options: CliProxyApiAdapterOptions): CliProxyApiAdapter
export function cliProxyApiAdapterCreate(
  options: CliProxyApiAdapterOptions,
  input: CliProxyApiAdapterInput,
): AsyncIterable<StreamChunk>
export function cliProxyApiAdapterCreate(
  options: CliProxyApiAdapterOptions,
  input?: CliProxyApiAdapterInput,
): CliProxyApiAdapter | AsyncIterable<StreamChunk> {
  if (input !== undefined) {
    return cliProxyApiAdapterGenerate(options, input)
  }

  return (adapterInput) => cliProxyApiAdapterGenerate(options, adapterInput)
}

async function cliProxyApiAdapterWait(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false

  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(true), 0)
    const onAbort = () => finish(false)
    const finish = (ready: boolean) => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      resolve(ready)
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function cliProxyApiAdapterLoggerCreate(): InstanceType<typeof InternalLogger> {
  return new InternalLogger(
    { debug: () => undefined, error: () => undefined, info: () => undefined, warn: () => undefined },
    {
      agentLoop: false,
      config: false,
      errors: false,
      middleware: false,
      output: false,
      provider: false,
      request: false,
      sandbox: false,
      tools: false,
    },
  )
}

function cliProxyApiModelMessagesResolve(input: CliProxyApiAdapterInput): Array<ModelMessage> {
  const messages: Array<ModelMessage> = []
  let preparedUserMessageAdded = false
  for (const message of input.history as Array<{
    content: unknown
    id?: string
    role: string
    sequence?: number
    toolCallId?: string
    toolCalls?: ModelMessage["toolCalls"]
  }>) {
    if (message.role !== "system" && message.role !== "user" && message.role !== "assistant" && message.role !== "tool")
      continue
    if (
      input.preparedUserMessage !== undefined &&
      message.role === "user" &&
      (message.id === input.preparedUserMessage.id || message.sequence === input.preparedUserMessage.sequence)
    ) {
      if (preparedUserMessageAdded) continue
      preparedUserMessageAdded = true
    }
    const content =
      typeof message.content === "string" || message.content === null || Array.isArray(message.content)
        ? message.content
        : JSON.stringify(message.content)
    messages.push({
      content,
      role: message.role,
      ...(message.toolCallId === undefined ? {} : { toolCallId: message.toolCallId }),
      ...(message.toolCalls === undefined ? {} : { toolCalls: message.toolCalls }),
    } as ModelMessage)
  }

  const last = messages.at(-1)
  const preparedUserMessagePresent = input.history.some(
    (message) =>
      input.preparedUserMessage !== undefined &&
      message.role === "user" &&
      (message.id === input.preparedUserMessage.id || message.sequence === input.preparedUserMessage.sequence),
  )
  const currentUserMessagePresent =
    input.currentUserMessageIncluded === true ||
    preparedUserMessagePresent ||
    (last?.role === "user" && last.content === input.prompt)
  if (!currentUserMessagePresent) messages.push({ content: input.prompt, role: "user" })
  return messages
}

function cliProxyApiOptionSecretsResolve(
  value: unknown,
  environment: Readonly<Record<string, string | undefined>>,
): Result<unknown> {
  const op = "cliProxyApiOptionSecretsResolve"
  if (Array.isArray(value)) {
    const resolved: unknown[] = []
    for (const item of value) {
      const result = cliProxyApiOptionSecretsResolve(item, environment)
      if (!result.success) return result
      resolved.push(result.data)
    }
    return createResult(resolved)
  }
  if (value === null || typeof value !== "object") return createResult(value)

  const resolved: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if ((key === "apiKey" || key === "api_key") && typeof item === "string") {
      const secret = secretReferenceResolve(item, environment)
      if (!secret.success) return createResultError(op, secret.errorMessage)
      resolved[key] = secret.data.value
      continue
    }
    const result = cliProxyApiOptionSecretsResolve(item, environment)
    if (!result.success) return result
    resolved[key] = result.data
  }
  return createResult(resolved)
}

const cliProxyApiCatalogRequestOnlyOptionKeys = new Set([
  "blacklist",
  "include",
  "npm",
  "reasoningEffort",
  "reasoningSummary",
  "store",
  "textVerbosity",
])

function cliProxyApiModelOptionsFilter(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !cliProxyApiCatalogRequestOnlyOptionKeys.has(key)))
}

function cliProxyApiRecordResolve(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function cliProxyApiStringResolve(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function cliProxyApiCodexResponsesOptionsResolve(
  modelOptions: Record<string, unknown>,
  providerOptions: Record<string, unknown>,
  reasoningEffort: string | undefined,
): Record<string, unknown> {
  const request: Record<string, unknown> = {}
  const modelReasoning = cliProxyApiRecordResolve(modelOptions.reasoning)
  const modelText = cliProxyApiRecordResolve(modelOptions.text)
  const reasoning = modelReasoning === undefined ? {} : { ...modelReasoning }
  const text = modelText === undefined ? {} : { ...modelText }

  const selectedReasoningEffort =
    reasoningEffort ??
    cliProxyApiStringResolve(modelOptions.reasoningEffort) ??
    cliProxyApiStringResolve(providerOptions.reasoningEffort)
  const selectedReasoningSummary =
    cliProxyApiStringResolve(modelOptions.reasoningSummary) ??
    cliProxyApiStringResolve(providerOptions.reasoningSummary)
  const selectedTextVerbosity =
    cliProxyApiStringResolve(modelOptions.textVerbosity) ?? cliProxyApiStringResolve(providerOptions.textVerbosity)

  if (selectedReasoningEffort !== undefined) reasoning.effort = selectedReasoningEffort
  if (selectedReasoningSummary !== undefined) reasoning.summary = selectedReasoningSummary
  if (Object.keys(reasoning).length > 0) request.reasoning = reasoning

  if (selectedTextVerbosity !== undefined) text.verbosity = selectedTextVerbosity
  if (Object.keys(text).length > 0) request.text = text

  const include = modelOptions.include ?? providerOptions.include
  if (include !== undefined) request.include = include

  const store = modelOptions.store ?? providerOptions.store
  if (typeof store === "boolean") request.store = store

  return request
}

function cliProxyApiRequestModelOptionsResolve(options: {
  modelOptions: Record<string, unknown>
  provider: string | undefined
  providerOptions: Record<string, unknown>
  reasoningEffort: string | undefined
  temperature: number | undefined
  maxTokens: number | undefined
  transport: "openai/completions" | "openai/responses" | undefined
}): Record<string, unknown> {
  const modelOptions = cliProxyApiModelOptionsFilter(options.modelOptions)
  if (options.transport === "openai/responses") {
    return {
      ...modelOptions,
      ...(options.maxTokens === undefined ? {} : { max_output_tokens: options.maxTokens }),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.provider === "codex-lb"
        ? cliProxyApiCodexResponsesOptionsResolve(
            options.modelOptions,
            options.providerOptions,
            options.reasoningEffort,
          )
        : {}),
    }
  }

  return {
    ...modelOptions,
    ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.reasoningEffort === undefined ? {} : { reasoning_effort: options.reasoningEffort }),
  }
}

async function* cliProxyApiAdapterProviderGenerate(
  options: CliProxyApiAdapterOptions,
  input: CliProxyApiAdapterInput,
  secret: string,
): AsyncGenerator<StreamChunk> {
  if (options.fetch === undefined) return

  const modelOptions = cliProxyApiOptionSecretsResolve(options.settings.modelOptions ?? {}, options.environment)
  if (!modelOptions.success) {
    yield {
      code: modelOptions.op,
      message: modelOptions.errorMessage,
      timestamp: Date.now(),
      type: EventType.RUN_ERROR,
    }
    return
  }
  const providerOptions = cliProxyApiOptionSecretsResolve(options.settings.providerOptions ?? {}, options.environment)
  if (!providerOptions.success) {
    yield {
      code: providerOptions.op,
      message: providerOptions.errorMessage,
      timestamp: Date.now(),
      type: EventType.RUN_ERROR,
    }
    return
  }

  const adapter = providerOpenAiCompatibleTextAdapterCreate({
    baseUrl: options.settings.baseUrl,
    fetch: options.fetch,
    model: options.settings.model,
    provider: options.label === "Codex-LB" ? "codex-lb" : "cliproxyapi",
    resolvedBearerSecret: secret,
    ...(options.settings.transport === undefined ? {} : { transport: options.settings.transport }),
  })
  const systemPrompt = input.systemPrompt ?? options.systemPrompt
  const stream = adapter.chatStream({
    logger: cliProxyApiAdapterLoggerCreate(),
    messages: cliProxyApiModelMessagesResolve({ ...input, systemPrompt }),
    model: options.settings.model,
    modelOptions: {
      ...cliProxyApiRequestModelOptionsResolve({
        maxTokens: options.settings.maxTokens,
        modelOptions: modelOptions.data as Record<string, unknown>,
        provider: options.label === "Codex-LB" ? "codex-lb" : "cliproxyapi",
        providerOptions: providerOptions.data as Record<string, unknown>,
        reasoningEffort: options.settings.reasoningEffort,
        temperature: options.settings.temperature,
        transport: options.settings.transport,
      }),
      ...(input.tools !== undefined && input.tools.length > 0 ? { parallel_tool_calls: false } : {}),
    },
    request: { signal: input.signal },
    ...(systemPrompt === undefined ? {} : { systemPrompts: [systemPrompt] }),
    runId: input.runId,
    threadId: input.sessionId,
    ...(input.tools === undefined ? {} : { tools: input.tools }),
  })
  for await (const chunk of stream) yield chunk
}

async function* cliProxyApiAdapterGenerate(
  options: CliProxyApiAdapterOptions,
  input: CliProxyApiAdapterInput,
): AsyncGenerator<StreamChunk> {
  if (input.signal.aborted) return

  yield {
    type: EventType.RUN_STARTED,
    threadId: input.sessionId,
    runId: input.runId,
    timestamp: Date.now(),
  }

  if (input.signal.aborted) return

  const secretResult = secretReferenceResolve(options.settings.apiKey, options.environment)
  if (!secretResult.success) {
    yield {
      type: EventType.RUN_ERROR,
      code: secretResult.op,
      message: secretResult.errorMessage,
      timestamp: Date.now(),
    }
    return
  }

  if (options.fetch !== undefined) {
    yield* cliProxyApiAdapterProviderGenerate(options, input, secretResult.data.value)
    return
  }

  if (
    options.failure?.failBeforeStart === true ||
    (options.failure !== undefined &&
      options.failure.failBeforeStart !== false &&
      options.failure.atChunkIndex === undefined)
  ) {
    yield {
      type: EventType.RUN_ERROR,
      code: options.failure.code ?? "cli_proxy_api_injected_failure",
      message: options.failure.message ?? "CLIProxyAPI adapter injected failure.",
      timestamp: Date.now(),
    }
    return
  }

  if (!(await cliProxyApiAdapterWait(input.signal))) return

  const messageId = `assistant-${input.runId}`

  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: "assistant",
    timestamp: Date.now(),
  }

  if (!(await cliProxyApiAdapterWait(input.signal))) return

  const chunks = options.chunks ?? [`[${options.label ?? "CLIProxyAPI"}:${options.settings.model}] `, input.prompt]

  for (let i = 0; i < chunks.length; i += 1) {
    if (options.failure?.atChunkIndex === i) {
      yield {
        type: EventType.RUN_ERROR,
        code: options.failure.code ?? "cli_proxy_api_injected_failure",
        message: options.failure.message ?? "CLIProxyAPI adapter injected failure.",
        timestamp: Date.now(),
      }
      return
    }

    const delta = chunks[i]
    if (delta === undefined) continue

    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta,
      messageId,
      timestamp: Date.now(),
    }

    if (!(await cliProxyApiAdapterWait(input.signal))) return
  }

  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    timestamp: Date.now(),
  }

  if (input.signal.aborted) return

  yield {
    type: EventType.RUN_FINISHED,
    threadId: input.sessionId,
    runId: input.runId,
    outcome: { type: "success" },
    finishReason: "stop",
    timestamp: Date.now(),
  }
}
