import { EventType, type StreamChunk } from "@tanstack/ai"
import type { AgentConfiguration } from "../../agents/schema/agentConfigurationSchema.js"
import {
  type CliProxyApiAdapter,
  type CliProxyApiAdapterFailure,
  type CliProxyApiAdapterInput,
  cliProxyApiAdapterCreate,
} from "./cliProxyApiAdapterCreate.js"

export type ProviderRuntimeAdapterOptions = {
  chunks?: readonly string[]
  configuration: AgentConfiguration
  environment: Readonly<Record<string, string | undefined>>
  failure?: CliProxyApiAdapterFailure
}

export function providerRuntimeAdapterCreate(options: ProviderRuntimeAdapterOptions): CliProxyApiAdapter {
  if (options.configuration.provider === "deterministic") {
    return (input) => providerRuntimeDeterministicGenerate(options, input)
  }

  return cliProxyApiAdapterCreate({
    chunks: options.chunks,
    environment: options.environment,
    failure: options.failure,
    label: options.configuration.provider === "codex-lb" ? "Codex-LB" : "CLIProxyAPI",
    settings: {
      apiKey: options.configuration.apiKey,
      baseUrl: options.configuration.baseUrl,
      maxTokens: options.configuration.generation?.maxTokens ?? 4096,
      model: options.configuration.model,
      temperature: options.configuration.generation?.temperature ?? 0.7,
    },
  })
}

async function providerRuntimeAdapterWait(signal: AbortSignal): Promise<boolean> {
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

async function* providerRuntimeDeterministicGenerate(
  options: ProviderRuntimeAdapterOptions,
  input: CliProxyApiAdapterInput,
): AsyncGenerator<StreamChunk> {
  if (input.signal.aborted) return

  yield {
    type: EventType.RUN_STARTED,
    threadId: input.sessionId,
    runId: input.runId,
    timestamp: Date.now(),
  }
  const failure = options.failure
  if (
    failure?.failBeforeStart === true ||
    (failure !== undefined && failure.failBeforeStart !== false && failure.atChunkIndex === undefined)
  ) {
    yield {
      type: EventType.RUN_ERROR,
      code: failure.code ?? "provider_runtime_injected_failure",
      message: failure.message ?? "Provider runtime adapter injected failure.",
      timestamp: Date.now(),
    }
    return
  }

  if (!(await providerRuntimeAdapterWait(input.signal))) return

  const messageId = `assistant-${input.runId}`
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: "assistant",
    timestamp: Date.now(),
  }
  if (!(await providerRuntimeAdapterWait(input.signal))) return

  const chunks = options.chunks ?? ["Deterministic response: ", input.prompt]
  for (let i = 0; i < chunks.length; i += 1) {
    if (failure?.atChunkIndex === i) {
      yield {
        type: EventType.RUN_ERROR,
        code: failure.code ?? "provider_runtime_injected_failure",
        message: failure.message ?? "Provider runtime adapter injected failure.",
        timestamp: Date.now(),
      }
      return
    }

    const delta = chunks[i]
    if (delta === undefined) continue

    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta,
      timestamp: Date.now(),
    }
    if (!(await providerRuntimeAdapterWait(input.signal))) return
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
