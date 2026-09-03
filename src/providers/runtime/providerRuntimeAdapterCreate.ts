import { EventType, type StreamChunk } from "@tanstack/ai"
import type { AgentConfiguration } from "../../agents/schema/agentConfigurationSchema.js"
import {
  type CliProxyApiAdapter,
  type CliProxyApiAdapterFailure,
  type CliProxyApiAdapterInput,
  cliProxyApiAdapterCreate,
} from "./cliProxyApiAdapterCreate.js"
import { providerDeterministicScenarioResolve } from "./providerDeterministicScenarioResolve.js"

export type ProviderRuntimeAdapterOptions = {
  chunks?: readonly string[]
  configuration: AgentConfiguration
  environment: Readonly<Record<string, string | undefined>>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  failure?: CliProxyApiAdapterFailure
  systemPrompt?: string
}

export function providerRuntimeAdapterCreate(options: ProviderRuntimeAdapterOptions): CliProxyApiAdapter {
  if (options.configuration.provider === "deterministic") {
    return (input) => providerRuntimeDeterministicGenerate(options, input)
  }

  const transport = options.configuration.modelMetadata?.connection.transport
  return cliProxyApiAdapterCreate({
    chunks: options.chunks,
    environment: options.environment,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    failure: options.failure,
    label: options.configuration.provider === "codex-lb" ? "Codex-LB" : "CLIProxyAPI",
    settings: {
      apiKey: options.configuration.apiKey,
      baseUrl: options.configuration.baseUrl,
      ...(options.configuration.generation?.maxTokens === undefined
        ? {}
        : { maxTokens: options.configuration.generation.maxTokens }),
      model: options.configuration.model,
      ...(options.configuration.modelOptions === undefined ? {} : { modelOptions: options.configuration.modelOptions }),
      ...(options.configuration.providerOptions === undefined
        ? {}
        : { providerOptions: options.configuration.providerOptions }),
      ...(options.configuration.generation?.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: options.configuration.generation.reasoningEffort }),
      ...(options.configuration.generation?.temperature === undefined
        ? {}
        : { temperature: options.configuration.generation.temperature }),
      ...(transport === "openai/completions" || transport === "openai/responses" ? { transport } : {}),
    },
    ...(options.systemPrompt === undefined ? {} : { systemPrompt: options.systemPrompt }),
  })
}

async function providerRuntimeAdapterWait(signal: AbortSignal, delayMs = 0): Promise<boolean> {
  if (signal.aborted) return false

  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(true), delayMs)
    const onAbort = () => finish(false)
    const finish = (ready: boolean) => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      resolve(ready)
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function providerRuntimeDelegationTasksResolve(
  prompt: string,
  history: Array<{ role: string }>,
  tools: Array<{ name: string }> | undefined,
): Array<string> | null {
  if (!tools?.some((tool) => tool.name === "delegate_task")) return null
  if (history.some((message) => message.role === "tool")) return null

  const trimmed = prompt.trim()
  if (trimmed.startsWith("delegate-twice:")) {
    const tasks = trimmed
      .slice("delegate-twice:".length)
      .split("|")
      .map((task) => task.trim())
      .filter((task) => task.length > 0)
    return tasks.length > 0 ? tasks.slice(0, 2) : [trimmed]
  }
  if (!trimmed.startsWith("delegate:")) return null
  const task = trimmed.slice("delegate:".length).trim()
  return [task.length > 0 ? task : trimmed]
}

async function* providerRuntimeDeterministicGenerate(
  options: ProviderRuntimeAdapterOptions,
  input: CliProxyApiAdapterInput,
): AsyncGenerator<StreamChunk> {
  if (input.signal.aborted) return

  const scenario = providerDeterministicScenarioResolve(options.configuration.model)
  if (scenario !== null) {
    yield* providerRuntimeDeterministicScenarioGenerate(scenario, input)
    return
  }

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

  const delegationTasks = providerRuntimeDelegationTasksResolve(input.prompt, input.history, input.tools)
  if (delegationTasks !== null) {
    if (!(await providerRuntimeAdapterWait(input.signal))) return
    for (const [index, task] of delegationTasks.entries()) {
      const toolCallId = `${input.runId}:delegate:${index + 1}`
      yield {
        timestamp: Date.now(),
        toolCallId,
        toolCallName: "delegate_task",
        toolName: "delegate_task",
        type: EventType.TOOL_CALL_START,
      }
      yield {
        delta: JSON.stringify({ task }),
        timestamp: Date.now(),
        toolCallId,
        type: EventType.TOOL_CALL_ARGS,
      }
    }
    yield {
      finishReason: "tool_calls",
      outcome: { type: "success" },
      runId: input.runId,
      threadId: input.sessionId,
      timestamp: Date.now(),
      type: EventType.RUN_FINISHED,
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

async function* providerRuntimeDeterministicScenarioGenerate(
  scenario: NonNullable<ReturnType<typeof providerDeterministicScenarioResolve>>,
  input: CliProxyApiAdapterInput,
): AsyncGenerator<StreamChunk> {
  if (input.signal.aborted) return

  yield {
    type: EventType.RUN_STARTED,
    threadId: input.sessionId,
    runId: input.runId,
    timestamp: Date.now(),
  }

  const attemptOrdinal = input.attemptOrdinal ?? 1
  const attempt = scenario.attempts.find(({ ordinal }) => ordinal === attemptOrdinal) ?? scenario.attempts.at(-1)
  if (attempt === undefined) return

  const delegation = "delegation" in scenario ? scenario.delegation : undefined
  const prompt = input.prompt.trim()
  const delegationContinuation = delegation !== undefined && input.history.some((message) => message.role === "tool")
  if (delegation !== undefined && !delegationContinuation && prompt.startsWith(delegation.promptPrefix)) {
    const task = prompt.slice(delegation.promptPrefix.length).trim()
    if (!(await providerRuntimeAdapterWait(input.signal))) return
    const toolCallId = `${input.runId}:delegate:1`
    yield {
      timestamp: Date.now(),
      toolCallId,
      toolCallName: "delegate_task",
      toolName: "delegate_task",
      type: EventType.TOOL_CALL_START,
    }
    yield {
      delta: JSON.stringify({ task: task.length === 0 ? prompt : task }),
      timestamp: Date.now(),
      toolCallId,
      type: EventType.TOOL_CALL_ARGS,
    }
    yield {
      finishReason: "tool_calls",
      outcome: { type: "success" },
      runId: input.runId,
      threadId: input.sessionId,
      timestamp: Date.now(),
      type: EventType.RUN_FINISHED,
    }
    return
  }

  const messageId = `assistant-${input.runId}`
  let messageStarted = false
  let messageEnded = false

  const steps = delegationContinuation ? (delegation?.continuationSteps ?? attempt.steps) : attempt.steps
  for (const step of steps) {
    if (!(await providerRuntimeAdapterWait(input.signal, step.delayMs))) return

    const event = step.event
    if (event.eventType === "text_delta") {
      if (!messageStarted) {
        messageStarted = true
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: "assistant",
          timestamp: Date.now(),
        }
      }
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: event.payload.delta,
        timestamp: Date.now(),
      }
      continue
    }

    if (event.eventType === "thinking_status") {
      yield {
        type: event.payload.status === "started" ? EventType.REASONING_START : EventType.REASONING_END,
        messageId,
        timestamp: Date.now(),
      }
      continue
    }

    if (event.eventType === "tool_start") {
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId: event.payload.toolCallId,
        toolCallName: event.payload.toolName,
        toolName: event.payload.toolName,
        timestamp: Date.now(),
      }
      continue
    }

    if (event.eventType === "tool_output") {
      yield {
        type: EventType.TOOL_CALL_END,
        output: event.payload.output,
        toolCallId: event.payload.toolCallId,
        timestamp: Date.now(),
      }
      continue
    }

    if (event.eventType === "tool_result") {
      yield {
        content: event.payload.result,
        messageId,
        state: event.payload.outcome === "success" ? "output-available" : "output-error",
        toolCallId: event.payload.toolCallId,
        type: EventType.TOOL_CALL_RESULT,
        timestamp: Date.now(),
      }
      continue
    }

    if (event.eventType !== "terminal") continue
    if (event.payload.status === "error") {
      yield {
        code: event.payload.code,
        message: event.payload.message,
        timestamp: Date.now(),
        type: EventType.RUN_ERROR,
      }
      return
    }
    if (messageStarted && !messageEnded) {
      messageEnded = true
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
        timestamp: Date.now(),
      }
    }
    yield {
      finishReason: "stop",
      outcome: { type: "success" },
      runId: input.runId,
      threadId: input.sessionId,
      timestamp: Date.now(),
      type: EventType.RUN_FINISHED,
    }
    return
  }
}
