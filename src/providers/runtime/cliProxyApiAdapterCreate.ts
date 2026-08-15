import { EventType, type AnyTool, type ModelMessage, type StreamChunk } from "@tanstack/ai"
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
}

export type CliProxyApiAdapterInput = Parameters<typeof sessionChatAdapterCreate>[0] & {
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
  for (const message of input.history as Array<{
    content: unknown
    role: string
    toolCallId?: string
    toolCalls?: ModelMessage["toolCalls"]
  }>) {
    if (message.role !== "user" && message.role !== "assistant" && message.role !== "tool") continue
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
  if (last?.role !== "user" || last.content !== input.prompt) {
    messages.push({ content: input.prompt, role: "user" })
  }
  return messages
}

async function* cliProxyApiAdapterProviderGenerate(
  options: CliProxyApiAdapterOptions,
  input: CliProxyApiAdapterInput,
  secret: string,
): AsyncGenerator<StreamChunk> {
  if (options.fetch === undefined) return

  const adapter = providerOpenAiCompatibleTextAdapterCreate({
    baseUrl: options.settings.baseUrl,
    fetch: options.fetch,
    model: options.settings.model,
    provider: options.label === "Codex-LB" ? "codex-lb" : "cliproxyapi",
    resolvedBearerSecret: secret,
  })
  const stream = adapter.chatStream({
    logger: cliProxyApiAdapterLoggerCreate(),
    messages: cliProxyApiModelMessagesResolve(input),
    model: options.settings.model,
    modelOptions: {
      max_tokens: options.settings.maxTokens,
      temperature: options.settings.temperature,
      ...(options.settings.reasoningEffort === undefined ? {} : { reasoning_effort: options.settings.reasoningEffort }),
      ...(input.tools !== undefined && input.tools.length > 0 ? { parallel_tool_calls: false } : {}),
    },
    request: { signal: input.signal },
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
