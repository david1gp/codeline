import { EventType, type StreamChunk } from "@tanstack/ai"
import type { sessionChatAdapterCreate } from "../../session/actions/sessionChatAdapterCreate.js"
import type { CliProxyApiSettings } from "./cliProxyApiSettingsParse.js"
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
  failure?: CliProxyApiAdapterFailure
  settings: CliProxyApiSettings
}

export type CliProxyApiAdapterInput = Parameters<typeof sessionChatAdapterCreate>[0]

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

  const chunks = options.chunks ?? [`[CLIProxyAPI:${options.settings.model}] `, input.prompt]

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
