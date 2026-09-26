import { createResult, type Result } from "@adaptive-ds/result"
import type { AgentConfiguration } from "../../agents/schema/agentConfigurationSchema.js"
import { sessionCompactionContextReconstruct } from "../../compaction/actions/sessionCompactionContextReconstruct.js"
import { sessionCompactionGenerate } from "../../compaction/actions/sessionCompactionGenerate.js"
import { compactionConfigurationDefaults } from "../../compaction/compactionConfigurationDefaults.js"
import type { CompactionConfiguration } from "../../compaction/compactionConfigurationSchema.js"
import { compactionContextUsageResolve } from "../../compaction/compactionContextUsageResolve.js"
import type { CompactionMessage } from "../../compaction/compactionMessage.js"
import { compactionPolicyFromConfiguration } from "../../compaction/compactionPolicyFromConfiguration.js"
import { compactionPressureResolve } from "../../compaction/compactionPressureResolve.js"
import { compactionTokenEstimate } from "../../compaction/compactionTokenEstimate.js"
import type { CompactionTokenUsage } from "../../compaction/compactionTokenUsage.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { CliProxyApiAdapter } from "../../providers/runtime/cliProxyApiAdapterCreate.js"
import type { providerRuntimeAdapterResolve } from "../../providers/runtime/providerRuntimeAdapterResolve.js"
import { sessionChatContextToolLifecycleResolve } from "./sessionChatContextToolLifecycleResolve.js"

type SessionChatContextPrepareOptions = {
  compactionAdapter?: CliProxyApiAdapter
  compactionConfiguration?: Partial<CompactionConfiguration>
  contextLimitTokens?: number
  database: DatabaseClient
  environment?: Readonly<Record<string, string | undefined>>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  history: Array<CompactionMessage>
  organizationId: string
  prompt: string
  reportedUsage?: CompactionTokenUsage
  preparedUserMessage?: { id: string; sequence: number }
  runtimeConfiguration?: AgentConfiguration
  runtimeAdapterCreate?: Parameters<typeof providerRuntimeAdapterResolve>[1]["runtimeAdapterCreate"]
  sessionId: string
  signal?: AbortSignal
  sourceRevision?: number
  systemPrompt?: unknown
  tools?: unknown
  userId: string
}

type SessionChatContextPrepareResult = {
  advanced: boolean
  history: Array<CompactionMessage>
  sourceRevision?: number
}

function sessionChatContextPreparedUserMessageMatches(
  message: CompactionMessage,
  preparedUserMessage: { id: string; sequence: number },
): boolean {
  if (message.role !== "user") return false
  if (message.id !== undefined) return message.id === preparedUserMessage.id
  return message.sequence === preparedUserMessage.sequence
}

function sessionChatContextProjectedMessagesResolve(
  history: readonly CompactionMessage[],
  prompt: string,
  preparedUserMessage?: { id: string; sequence: number },
): Array<CompactionMessage> {
  if (preparedUserMessage === undefined) return [...history]
  const currentMessageIndexes = history.flatMap((message, index) =>
    sessionChatContextPreparedUserMessageMatches(message, preparedUserMessage) ? [index] : [],
  )
  if (currentMessageIndexes.length === 0)
    return [
      ...history,
      { content: prompt, id: preparedUserMessage.id, role: "user", sequence: preparedUserMessage.sequence },
    ]
  const firstCurrentMessageIndex = currentMessageIndexes[0]
  return history.filter(
    (_message, index) => index === firstCurrentMessageIndex || !currentMessageIndexes.includes(index),
  )
}

export async function sessionChatContextPrepare(
  options: SessionChatContextPrepareOptions,
): Promise<Result<SessionChatContextPrepareResult>> {
  const unchanged = () =>
    createResult({ advanced: false, history: options.history, sourceRevision: options.sourceRevision })
  const configuration = { ...compactionConfigurationDefaults, ...(options.compactionConfiguration ?? {}) }
  const contextLimitTokens = options.contextLimitTokens
  if (!configuration.enabled || !configuration.auto) return unchanged()
  if (typeof contextLimitTokens !== "number" || !Number.isSafeInteger(contextLimitTokens) || contextLimitTokens < 1)
    return unchanged()
  const resolvedContextLimitTokens = contextLimitTokens

  const policy = compactionPolicyFromConfiguration(configuration, resolvedContextLimitTokens)
  if (!policy.success) return unchanged()
  const projectedMessages = sessionChatContextProjectedMessagesResolve(
    options.history,
    options.prompt,
    options.preparedUserMessage,
  )
  const estimated = compactionTokenEstimate({
    messages: projectedMessages,
    ...(options.systemPrompt === undefined ? {} : { systemPrompt: options.systemPrompt }),
    ...(options.tools === undefined ? {} : { tools: options.tools }),
  })
  if (!estimated.success) return unchanged()
  const pressure = compactionPressureResolve({
    contextLimitTokens: policy.data.contextLimitTokens,
    estimatedInputTokens: estimated.data,
    ...compactionContextUsageResolve({
      messages: projectedMessages,
      reportedUsage: options.reportedUsage,
    }),
    pressureThreshold: policy.data.pressureThreshold,
    reserveOutputTokens: policy.data.reserveOutputTokens,
  })
  if (!pressure.success) return unchanged()
  if (!pressure.data.shouldCompact) return unchanged()
  const toolLifecycle = sessionChatContextToolLifecycleResolve(options.history, options.preparedUserMessage)
  if (!toolLifecycle.complete) return unchanged()

  const before = await sessionCompactionContextReconstruct(
    options.database,
    options.userId,
    options.organizationId,
    options.sessionId,
  )
  if (!before.success) return unchanged()

  const generated = await sessionCompactionGenerate(
    options.database,
    options.userId,
    options.organizationId,
    options.sessionId,
    {
      ...(options.compactionAdapter === undefined ? {} : { adapter: options.compactionAdapter }),
      criticalContext: typeof options.systemPrompt === "string" ? options.systemPrompt : undefined,
      environment: options.environment,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      policy: policy.data,
      ...(options.runtimeConfiguration === undefined ? {} : { runtimeConfiguration: options.runtimeConfiguration }),
      runtimeAdapterCreate: options.runtimeAdapterCreate,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.sourceRevision === undefined ? {} : { sourceRevision: options.sourceRevision }),
    },
  )
  if (!generated.success) return unchanged()

  const reconstructed = await sessionCompactionContextReconstruct(
    options.database,
    options.userId,
    options.organizationId,
    options.sessionId,
  )
  if (!reconstructed.success) return unchanged()
  const advanced = generated.data.compaction.coveredSequence > (before.data.compaction?.coveredSequence ?? 0)
  return createResult({
    advanced,
    history: [...reconstructed.data.history, ...toolLifecycle.suffix],
    sourceRevision: generated.data.sessionRevision,
  })
}
