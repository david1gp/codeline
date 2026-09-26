import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { EventType, type StreamChunk } from "@tanstack/ai"
import * as v from "valibot"
import { type AgentConfiguration, agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { CliProxyApiAdapter } from "../../providers/runtime/cliProxyApiAdapterCreate.js"
import { providerRuntimeAdapterResolve } from "../../providers/runtime/providerRuntimeAdapterResolve.js"
import { sessionLoad } from "../../session/actions/sessionLoad.js"
import { compactionBoundarySelect } from "../compactionBoundarySelect.js"
import { compactionContextSerialize } from "../compactionContextSerialize.js"
import type { CompactionMessage } from "../compactionMessage.js"
import type { CompactionPolicy } from "../compactionPolicy.js"
import { compactionPolicyResolve } from "../compactionPolicyResolve.js"
import { compactionSummaryPromptCreate } from "../compactionSummaryPromptCreate.js"
import { sessionCompactionTable } from "../db/sessionCompactionTable.js"
import { sessionCompactionBegin } from "./sessionCompactionBegin.js"
import { sessionCompactionContextReconstruct } from "./sessionCompactionContextReconstruct.js"
import { sessionCompactionFail } from "./sessionCompactionFail.js"
import { sessionCompactionFinalize } from "./sessionCompactionFinalize.js"

type SessionCompactionGenerateOptions = {
  adapter?: CliProxyApiAdapter
  criticalContext?: string
  environment?: Readonly<Record<string, string | undefined>>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  id?: string
  policy?: Partial<CompactionPolicy>
  runtimeConfiguration?: AgentConfiguration
  runtimeAdapterCreate?: Parameters<typeof providerRuntimeAdapterResolve>[1]["runtimeAdapterCreate"]
  signal?: AbortSignal
  sourceRevision?: number
}

type SessionCompactionSequenceMetadata = {
  firstSequence: number | null
  lastSequence: number | null
  messageCount: number
}

type SessionCompactionGenerateResult = {
  compaction: typeof sessionCompactionTable.$inferSelect
  coverage: SessionCompactionSequenceMetadata
  sessionRevision: number
  summary: string
  tail: SessionCompactionSequenceMetadata
}

type SessionCompactionGenerationState = {
  completed: boolean
  text: string
}

function sessionCompactionSequenceMetadataCreate(
  messages: readonly { sequence: number }[],
): SessionCompactionSequenceMetadata {
  return {
    firstSequence: messages[0]?.sequence ?? null,
    lastSequence: messages.at(-1)?.sequence ?? null,
    messageCount: messages.length,
  }
}

function sessionCompactionSummaryConfigurationResolve(
  configuration: unknown,
  policy: CompactionPolicy,
): Result<AgentConfiguration> {
  const op = "sessionCompactionSummaryConfigurationResolve"
  const parsed = v.safeParse(agentConfigurationSchema, configuration)
  if (!parsed.success) return createResultError(op, "The agent provider configuration is invalid.")

  const modelOutputLimit =
    parsed.output.provider === "deterministic" ? undefined : parsed.output.modelMetadata?.limit.output
  const maxTokens = Math.min(
    policy.reserveOutputTokens,
    parsed.output.generation?.maxTokens ?? Number.MAX_SAFE_INTEGER,
    modelOutputLimit ?? Number.MAX_SAFE_INTEGER,
  )
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1)
    return createResultError(op, "The current model cannot produce a bounded compaction summary.")

  return createResult({
    ...parsed.output,
    generation: { ...parsed.output.generation, maxTokens },
  })
}

function sessionCompactionProviderErrorMessageResolve(chunk: StreamChunk): string {
  if (chunk.type === EventType.RUN_ERROR) {
    return chunk.message ?? chunk.error?.message ?? "The compaction provider reported an error."
  }
  if (chunk.type === EventType.RUN_FINISHED && chunk.outcome?.type !== "success") {
    return "The compaction provider did not complete successfully."
  }
  return "The compaction provider returned an incomplete result."
}

function sessionCompactionStreamChunkConsume(
  state: SessionCompactionGenerationState,
  chunk: StreamChunk,
): Result<void> {
  const op = "sessionCompactionStreamChunkConsume"
  if (state.completed) return createResultError(op, "The compaction provider emitted data after completion.")
  if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
    state.text += chunk.delta
    return createResult(undefined)
  }
  if (chunk.type.startsWith("TOOL_CALL_"))
    return createResultError(op, "The compaction provider attempted to use a tool.")
  if (chunk.type === EventType.RUN_ERROR)
    return createResultError(op, sessionCompactionProviderErrorMessageResolve(chunk))
  if (chunk.type !== EventType.RUN_FINISHED) return createResult(undefined)
  if (chunk.outcome?.type !== "success")
    return createResultError(op, sessionCompactionProviderErrorMessageResolve(chunk))
  if (chunk.finishReason !== undefined && chunk.finishReason !== null && chunk.finishReason !== "stop") {
    return createResultError(
      op,
      chunk.finishReason === "length"
        ? "The compaction provider truncated the summary at its output limit."
        : chunk.finishReason === "tool_calls"
          ? "The compaction provider attempted to use a tool."
          : "The compaction provider returned an incomplete result.",
    )
  }
  state.completed = true
  return createResult(undefined)
}

async function sessionCompactionSummaryGenerate(
  adapter: CliProxyApiAdapter,
  input: { prompt: string; runId: string; sessionId: string; signal: AbortSignal },
  maxSummaryChars: number,
): Promise<Result<string>> {
  const op = "sessionCompactionSummaryGenerate"
  const state: SessionCompactionGenerationState = { completed: false, text: "" }
  try {
    for await (const chunk of adapter({
      compaction: true,
      history: [],
      prompt: input.prompt,
      runId: input.runId,
      sessionId: input.sessionId,
      signal: input.signal,
      tools: [],
    })) {
      if (input.signal.aborted) return createResultError(op, "The compaction was aborted.")
      const consumed = sessionCompactionStreamChunkConsume(state, chunk)
      if (!consumed.success) return consumed
    }
  } catch (error) {
    if (input.signal.aborted) return createResultError(op, "The compaction was aborted.")
    return createResultError(op, error instanceof Error ? error.message : "The compaction provider failed.")
  }

  if (input.signal.aborted) return createResultError(op, "The compaction was aborted.")
  if (!state.completed) return createResultError(op, "The compaction provider ended before completion.")
  const summary = state.text.trim()
  if (summary.length === 0) return createResultError(op, "The compaction provider returned empty text.")
  if (summary.length > maxSummaryChars)
    return createResultError(op, "The compaction summary exceeded its output bound.")
  return createResult(summary)
}

async function sessionCompactionGenerationFail(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  compactionId: string,
  message: string,
): Promise<Result<never>> {
  const op = "sessionCompactionGenerate"
  const failed = await sessionCompactionFail(database, userId, organizationId, sessionId, {
    compactionId,
    errorMessage: message,
  })
  if (!failed.success) return createResultError(op, `${message} ${failed.errorMessage}`)
  return createResultError(op, message)
}

export async function sessionCompactionGenerate(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  options: SessionCompactionGenerateOptions = {},
): Promise<Result<SessionCompactionGenerateResult>> {
  const op = "sessionCompactionGenerate"
  const policy = compactionPolicyResolve(options.policy)
  if (!policy.success) return policy

  const loaded = await sessionLoad(database, userId, organizationId, sessionId)
  if (!loaded.success) return createResultError(op, loaded.errorMessage)
  const sourceRevision = options.sourceRevision ?? loaded.data.session.revision
  if (sourceRevision !== loaded.data.session.revision)
    return createResultError(op, "The compaction source revision does not match the session revision.")
  const reconstructed = await sessionCompactionContextReconstruct(database, userId, organizationId, sessionId)
  if (!reconstructed.success) return createResultError(op, reconstructed.errorMessage)

  const previousSummary = reconstructed.data.compaction?.summary ?? undefined
  const previousCoveredSequence = reconstructed.data.compaction?.coveredSequence ?? 0
  const eligibleDurableMessages = reconstructed.data.durableHistory.filter(
    (message) => message.sequence > previousCoveredSequence,
  )
  const eligibleMessages = eligibleDurableMessages as unknown as CompactionMessage[]
  const boundary = compactionBoundarySelect({
    messages: eligibleMessages,
    recentTokenBudget: policy.data.recentTokenBudget,
  })
  if (!boundary.success) return createResultError(op, boundary.errorMessage)
  if (boundary.data.compacted.length === 0)
    return createResultError(op, "No eligible context is available for compaction.")

  const serialized = compactionContextSerialize(boundary.data.compacted, {
    maxToolOutputChars: policy.data.maxToolOutputChars,
  })
  if (!serialized.success) return createResultError(op, serialized.errorMessage)
  const prompt = compactionSummaryPromptCreate({
    criticalContext: options.criticalContext,
    previousSummary,
    transcript: serialized.data,
  })
  if (!prompt.success) return createResultError(op, prompt.errorMessage)

  let adapter = options.adapter
  if (adapter === undefined) {
    const configuration = sessionCompactionSummaryConfigurationResolve(
      options.runtimeConfiguration ?? loaded.data.agent.configuration,
      policy.data,
    )
    if (!configuration.success) return createResultError(op, configuration.errorMessage)
    const systemPrompt = options.criticalContext ?? loaded.data.session.agentPrompt ?? undefined
    const resolved = providerRuntimeAdapterResolve(configuration.data, {
      environment: options.environment ?? Bun.env,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      runtimeAdapterCreate: options.runtimeAdapterCreate,
      ...(systemPrompt === undefined ? {} : { systemPrompt }),
    })
    if (!resolved.success) return createResultError(op, resolved.errorMessage)
    adapter = resolved.data
  }

  const coveredSequence = eligibleDurableMessages[boundary.data.cutIndex - 1]?.sequence
  if (coveredSequence === undefined) return createResultError(op, "The compaction coverage boundary is invalid.")
  const begun = await sessionCompactionBegin(database, userId, organizationId, sessionId, {
    coveredSequence,
    ...(options.id === undefined ? {} : { id: options.id }),
    sourceRevision,
  })
  if (!begun.success) return createResultError(op, begun.errorMessage)
  if (!begun.data.created) {
    if (begun.data.compaction.status === "succeeded" && begun.data.compaction.summary !== null) {
      return createResult({
        compaction: begun.data.compaction,
        coverage: sessionCompactionSequenceMetadataCreate(eligibleDurableMessages.slice(0, boundary.data.cutIndex)),
        sessionRevision: loaded.data.session.revision,
        summary: begun.data.compaction.summary,
        tail: sessionCompactionSequenceMetadataCreate(eligibleDurableMessages.slice(boundary.data.cutIndex)),
      })
    }
    return createResultError(op, "The compaction operation is not available for generation.")
  }

  const signal = options.signal ?? new AbortController().signal
  if (signal.aborted)
    return sessionCompactionGenerationFail(
      database,
      userId,
      organizationId,
      sessionId,
      begun.data.compaction.id,
      "The compaction was aborted.",
    )

  const generated = await sessionCompactionSummaryGenerate(
    adapter,
    { prompt: prompt.data, runId: begun.data.compaction.id, sessionId, signal },
    policy.data.maxSummaryChars,
  )
  if (!generated.success)
    return sessionCompactionGenerationFail(
      database,
      userId,
      organizationId,
      sessionId,
      begun.data.compaction.id,
      generated.errorMessage,
    )

  const finalized = await sessionCompactionFinalize(database, userId, organizationId, sessionId, {
    compactionId: begun.data.compaction.id,
    summary: generated.data,
  })
  if (!finalized.success)
    return sessionCompactionGenerationFail(
      database,
      userId,
      organizationId,
      sessionId,
      begun.data.compaction.id,
      finalized.errorMessage,
    )

  return createResult({
    compaction: finalized.data.compaction,
    coverage: sessionCompactionSequenceMetadataCreate(eligibleDurableMessages.slice(0, boundary.data.cutIndex)),
    sessionRevision: finalized.data.session.revision,
    summary: generated.data,
    tail: sessionCompactionSequenceMetadataCreate(eligibleDurableMessages.slice(boundary.data.cutIndex)),
  })
}
