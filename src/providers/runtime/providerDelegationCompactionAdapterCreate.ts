import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { type AnyTextAdapter, EventType, type ModelMessage, type StreamChunk } from "@tanstack/ai"
import { compactionContextSelect } from "../../compaction/compactionContextSelect.js"
import { compactionContextSerialize } from "../../compaction/compactionContextSerialize.js"
import type { CompactionMessage } from "../../compaction/compactionMessage.js"
import type { CompactionPolicy } from "../../compaction/compactionPolicy.js"
import { compactionContextUsageResolve } from "../../compaction/compactionContextUsageResolve.js"
import { compactionPressureResolve } from "../../compaction/compactionPressureResolve.js"
import { compactionSummaryPromptCreate } from "../../compaction/compactionSummaryPromptCreate.js"
import { compactionTokenEstimate } from "../../compaction/compactionTokenEstimate.js"
import type { CompactionTokenUsage } from "../../compaction/compactionTokenUsage.js"
import { compactionTokenUsageResolve } from "../../compaction/compactionTokenUsageResolve.js"

type ProviderDelegationCompactionState = {
  projectedMessages: Array<ModelMessage>
  sourceMessages: Array<ModelMessage>
  summaryAttempted?: boolean
  summary?: string
  reportedUsage?: CompactionTokenUsage
  reportedUsageMessageCount?: number
}

type ProviderDelegationSummaryState = {
  completed: boolean
  text: string
}

const DEFAULT_PROVIDER_DELEGATION_MAX_OVERFLOW_RETRIES = 1

function providerDelegationCompactionToolCallIds(message: CompactionMessage): Array<string> {
  if (message.role !== "assistant") return []
  const ids: Array<string> = []
  for (const toolCall of message.toolCalls ?? []) {
    const id = toolCall.toolCallId ?? toolCall.id
    if (id !== undefined) ids.push(id)
  }
  return ids
}

function providerDelegationCompactionToolResultId(message: CompactionMessage): string | undefined {
  if (message.role !== "tool") return undefined
  if (message.toolCallId !== undefined) return message.toolCallId
  if (typeof message.metadata !== "object" || message.metadata === null) return undefined
  const toolCallId = (message.metadata as Record<string, unknown>).toolCallId
  return typeof toolCallId === "string" ? toolCallId : undefined
}

function providerDelegationCompactionLifecycleComplete(messages: readonly ModelMessage[]): boolean {
  const pendingToolCallIds = new Set<string>()
  let lifecycleFound = false
  for (const message of messages as readonly CompactionMessage[]) {
    const toolCallIds = providerDelegationCompactionToolCallIds(message)
    if (message.role === "assistant" && (message.toolCalls?.length ?? 0) > 0) {
      lifecycleFound = true
      if (toolCallIds.length !== message.toolCalls?.length || toolCallIds.some((toolCallId) => toolCallId.length === 0))
        return false
      for (const toolCallId of toolCallIds) {
        if (pendingToolCallIds.has(toolCallId)) return false
        pendingToolCallIds.add(toolCallId)
      }
    }
    if (message.role !== "tool") continue
    lifecycleFound = true
    const toolCallId = providerDelegationCompactionToolResultId(message)
    if (toolCallId === undefined || !pendingToolCallIds.delete(toolCallId)) return false
  }
  return !lifecycleFound || pendingToolCallIds.size === 0
}

function providerDelegationCompactionMessagesEqual(
  left: ModelMessage,
  right: ModelMessage,
  maxToolOutputChars: number,
): boolean {
  if (left === right) return true
  const leftSerialized = compactionContextSerialize([left as unknown as CompactionMessage], { maxToolOutputChars })
  const rightSerialized = compactionContextSerialize([right as unknown as CompactionMessage], { maxToolOutputChars })
  return leftSerialized.success && rightSerialized.success && leftSerialized.data === rightSerialized.data
}

function providerDelegationCompactionProjectionResolve(
  state: ProviderDelegationCompactionState | undefined,
  messages: Array<ModelMessage>,
  policy: CompactionPolicy,
): { state: ProviderDelegationCompactionState; messages: Array<ModelMessage> } {
  if (
    state === undefined ||
    state.sourceMessages.length > messages.length ||
    state.sourceMessages.some(
      (sourceMessage, index) =>
        messages[index] === undefined ||
        !providerDelegationCompactionMessagesEqual(
          sourceMessage,
          messages[index] as ModelMessage,
          policy.maxToolOutputChars,
        ),
    )
  ) {
    return {
      state: { projectedMessages: messages, sourceMessages: messages },
      messages,
    }
  }

  const suffix = messages.slice(state.sourceMessages.length)
  const projectedMessages = state.summary === undefined ? messages : [...state.projectedMessages, ...suffix]
  return {
    state: {
      projectedMessages,
      sourceMessages: messages,
      ...(state.summary === undefined ? {} : { summary: state.summary }),
    },
    messages: projectedMessages,
  }
}

function providerDelegationCompactionSystemPromptResolve(input: Parameters<AnyTextAdapter["chatStream"]>[0]): string {
  return (input.systemPrompts ?? [])
    .map((prompt) => (typeof prompt === "string" ? prompt : prompt.content))
    .join("\n\n")
}

function providerDelegationCompactionSummaryChunkConsume(
  state: ProviderDelegationSummaryState,
  chunk: StreamChunk,
  maxSummaryChars: number,
): Result<void> {
  const op = "providerDelegationCompactionSummaryChunkConsume"
  if (state.completed) return createResultError(op, "The compaction provider emitted data after completion.")
  if (chunk.type.startsWith("TOOL_CALL_"))
    return createResultError(op, "The compaction provider attempted to use a tool.")
  if (chunk.type === EventType.RUN_ERROR)
    return createResultError(op, chunk.message ?? chunk.error?.message ?? "The compaction provider reported an error.")
  if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
    if (state.text.length + chunk.delta.length > maxSummaryChars)
      return createResultError(op, "The compaction summary exceeded its output bound.")
    state.text += chunk.delta
    return createResult(undefined)
  }
  if (chunk.type !== EventType.RUN_FINISHED) return createResult(undefined)
  if (chunk.outcome?.type !== "success")
    return createResultError(op, "The compaction provider did not complete successfully.")
  const finishReason: string | null | undefined = chunk.finishReason
  if (finishReason !== undefined && finishReason !== null && finishReason !== "stop")
    return createResultError(
      op,
      finishReason === "length"
        ? "The compaction provider truncated the summary at its output limit."
        : finishReason === "tool_calls"
          ? "The compaction provider attempted to use a tool."
          : "The compaction provider returned an incomplete result.",
    )
  state.completed = true
  return createResult(undefined)
}

async function providerDelegationCompactionSummaryGenerate(
  summaryAdapter: AnyTextAdapter,
  input: Parameters<AnyTextAdapter["chatStream"]>[0],
  previousSummary: string | undefined,
  transcript: string,
  maxSummaryChars: number,
): Promise<Result<string>> {
  const op = "providerDelegationCompactionSummaryGenerate"
  const prompt = compactionSummaryPromptCreate({
    criticalContext: providerDelegationCompactionSystemPromptResolve(input),
    previousSummary,
    transcript,
  })
  if (!prompt.success) return createResultError(op, prompt.errorMessage)

  const state: ProviderDelegationSummaryState = { completed: false, text: "" }
  try {
    for await (const chunk of summaryAdapter.chatStream({
      ...input,
      messages: [{ content: prompt.data, role: "user" }],
      systemPrompts: [],
      tools: [],
    })) {
      if (input.request?.signal?.aborted) return createResultError(op, "The compaction was aborted.")
      const consumed = providerDelegationCompactionSummaryChunkConsume(state, chunk, maxSummaryChars)
      if (!consumed.success) return consumed
    }
  } catch (error) {
    if (input.request?.signal?.aborted) return createResultError(op, "The compaction was aborted.")
    return createResultError(op, error instanceof Error ? error.message : "The compaction provider failed.")
  }
  if (input.request?.signal?.aborted) return createResultError(op, "The compaction was aborted.")
  if (!state.completed) return createResultError(op, "The compaction provider ended before completion.")
  const summary = state.text.trim()
  return summary.length === 0
    ? createResultError(op, "The compaction provider returned empty text.")
    : createResult(summary)
}

async function providerDelegationCompactionMessagesResolve(
  state: ProviderDelegationCompactionState,
  options: {
    force?: boolean
    input: Parameters<AnyTextAdapter["chatStream"]>[0]
    policy: CompactionPolicy
    summaryAdapter: AnyTextAdapter
  },
): Promise<{
  compacted: boolean
  state: ProviderDelegationCompactionState
  messages: Array<ModelMessage>
}> {
  const originalMessages = options.input.messages
  const force = options.force === true
  if (!providerDelegationCompactionLifecycleComplete(state.projectedMessages))
    return { compacted: false, state: { ...state, projectedMessages: originalMessages }, messages: originalMessages }
  if (state.summaryAttempted && state.summary === undefined)
    return { compacted: false, state: { ...state, projectedMessages: originalMessages }, messages: originalMessages }
  const estimate = compactionTokenEstimate({
    messages: state.projectedMessages,
    systemPrompt: options.input.systemPrompts,
    tools: options.input.tools,
  })
  if (!estimate.success)
    return { compacted: false, state: { ...state, projectedMessages: originalMessages }, messages: originalMessages }

  const pressure = compactionPressureResolve({
    contextLimitTokens: options.policy.contextLimitTokens,
    estimatedInputTokens: estimate.data,
    ...compactionContextUsageResolve({
      messages: state.projectedMessages as unknown as Array<CompactionMessage>,
      ...(state.reportedUsage === undefined ? {} : { reportedUsage: state.reportedUsage }),
      ...(state.reportedUsageMessageCount === undefined
        ? {}
        : { reportedUsageMessageIndex: state.reportedUsageMessageCount - 1 }),
    }),
    pressureThreshold: options.policy.pressureThreshold,
    reserveOutputTokens: options.policy.reserveOutputTokens,
  })
  if (!pressure.success || (!force && !pressure.data.shouldCompact) || (!force && state.summary !== undefined))
    return { compacted: false, state, messages: state.projectedMessages }
  const selection = compactionContextSelect({
    messages: state.projectedMessages as unknown as Array<CompactionMessage>,
    recentTokenBudget: options.policy.recentTokenBudget,
  })
  if (!selection.success || selection.data.cutIndex <= 0)
    return { compacted: false, state: { ...state, projectedMessages: originalMessages }, messages: originalMessages }
  const serialized = compactionContextSerialize(selection.data.compacted, {
    maxToolOutputChars: options.policy.maxToolOutputChars,
  })
  if (!serialized.success)
    return { compacted: false, state: { ...state, projectedMessages: originalMessages }, messages: originalMessages }

  const attemptedState = { ...state, projectedMessages: originalMessages, summaryAttempted: true }
  const generated = await providerDelegationCompactionSummaryGenerate(
    options.summaryAdapter,
    options.input,
    state.summary,
    serialized.data,
    options.policy.maxSummaryChars,
  )
  if (!generated.success) return { compacted: false, state: attemptedState, messages: originalMessages }

  const projectedSelection = compactionContextSelect({
    messages: state.projectedMessages as unknown as Array<CompactionMessage>,
    recentTokenBudget: options.policy.recentTokenBudget,
    summary: generated.data,
  })
  if (!projectedSelection.success || projectedSelection.data.cutIndex <= 0)
    return { compacted: false, state: attemptedState, messages: originalMessages }
  const projectedMessages = projectedSelection.data.context as Array<ModelMessage>
  const projectedEstimate = compactionTokenEstimate({
    messages: projectedMessages,
    systemPrompt: options.input.systemPrompts,
    tools: options.input.tools,
  })
  if (!projectedEstimate.success || projectedEstimate.data >= estimate.data)
    return { compacted: false, state: attemptedState, messages: originalMessages }

  return {
    state: {
      projectedMessages,
      sourceMessages: originalMessages,
      summaryAttempted: true,
      summary: generated.data,
      reportedUsage: undefined,
      reportedUsageMessageCount: undefined,
    },
    messages: projectedMessages,
    compacted: true,
  }
}

function providerDelegationCompactionOverflowRetryCountResolve(maxOverflowRetries: number | undefined): number {
  if (maxOverflowRetries === undefined) return DEFAULT_PROVIDER_DELEGATION_MAX_OVERFLOW_RETRIES
  if (!Number.isSafeInteger(maxOverflowRetries) || maxOverflowRetries < 0) return 0
  return maxOverflowRetries
}

function providerDelegationCompactionOverflowChunk(chunk: StreamChunk): boolean {
  return chunk.type === EventType.RUN_ERROR && chunk.code === "provider_context_overflow"
}

export function providerDelegationCompactionAdapterCreate(options: {
  adapter: AnyTextAdapter
  maxOverflowRetries?: number
  policy: CompactionPolicy
  summaryAdapter: AnyTextAdapter
}): AnyTextAdapter {
  let state: ProviderDelegationCompactionState | undefined
  const adapter = Object.create(options.adapter) as AnyTextAdapter
  adapter.chatStream = async function* (input: Parameters<AnyTextAdapter["chatStream"]>[0]) {
    const projection = providerDelegationCompactionProjectionResolve(state, input.messages, options.policy)
    state = projection.state
    const prepared = await providerDelegationCompactionMessagesResolve(state, { input, ...options })
    state = prepared.state
    let requestMessages = prepared.messages
    let overflowRetryCount = 0
    const maxOverflowRetries = providerDelegationCompactionOverflowRetryCountResolve(options.maxOverflowRetries)

    while (true) {
      const bufferedChunks: Array<StreamChunk> = []
      let emittedNonErrorContent = false
      let overflowChunk: StreamChunk | undefined
      let completedUsage: CompactionTokenUsage | undefined

      try {
        for await (const chunk of options.adapter.chatStream({ ...input, messages: requestMessages })) {
          if (providerDelegationCompactionOverflowChunk(chunk)) {
            overflowChunk = chunk
            break
          }

          if (
            chunk.type === EventType.RUN_FINISHED &&
            (chunk.outcome === undefined || chunk.outcome.type === "success")
          ) {
            completedUsage = compactionTokenUsageResolve(chunk)
          }

          if (!emittedNonErrorContent && chunk.type === EventType.RUN_STARTED) {
            bufferedChunks.push(chunk)
            continue
          }

          emittedNonErrorContent = true
          yield* bufferedChunks
          bufferedChunks.length = 0
          yield chunk
        }
      } catch (error) {
        yield* bufferedChunks
        throw error
      }

      if (overflowChunk === undefined) {
        if (completedUsage !== undefined) {
          state = { ...state, reportedUsage: completedUsage, reportedUsageMessageCount: requestMessages.length }
        }
        yield* bufferedChunks
        return
      }

      if (emittedNonErrorContent || overflowRetryCount >= maxOverflowRetries || input.request?.signal?.aborted) {
        yield* bufferedChunks
        yield overflowChunk
        return
      }

      const recovered = await providerDelegationCompactionMessagesResolve(state, {
        force: true,
        input,
        policy: options.policy,
        summaryAdapter: options.summaryAdapter,
      })
      state = recovered.state
      if (input.request?.signal?.aborted || !recovered.compacted) {
        yield* bufferedChunks
        yield overflowChunk
        return
      }

      requestMessages = recovered.messages
      overflowRetryCount += 1
    }
  }
  return adapter
}
