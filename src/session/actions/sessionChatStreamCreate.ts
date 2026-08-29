import { createResultError, type Result } from "@adaptive-ds/result"
import { EventType, type StreamChunk } from "@tanstack/ai"
import type { AgentConfiguration } from "../../agents/schema/agentConfigurationSchema.js"
import type { CompactionMessage } from "../../compaction/compactionMessage.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { messageAppend } from "../../message/actions/messageAppend.js"
import type { CliProxyApiAdapter } from "../../providers/runtime/cliProxyApiAdapterCreate.js"
import type { providerRuntimeAdapterCreate } from "../../providers/runtime/providerRuntimeAdapterCreate.js"
import { providerExecutionEventFromStreamChunk } from "../../providers/runtime/providerExecutionEventFromStreamChunk.js"
import type { RunRetryExecutionEvidence } from "../../run/schema/runRetryExecutionEvidenceSchema.js"
import { executionStreamEventNormalize } from "../../stream/actions/executionStreamEventNormalize.js"
import { sessionChatContextPrepare } from "./sessionChatContextPrepare.js"

type SessionChatStreamCreateOptions = {
  adapter: CliProxyApiAdapter
  attemptOrdinal?: number
  compactionConfiguration?:
    | NonNullable<AgentConfiguration["compaction"]>
    | Partial<NonNullable<AgentConfiguration["compaction"]>>
  compactionAdapter?: CliProxyApiAdapter
  cleanup?: () => void
  database: DatabaseClient
  environment?: Readonly<Record<string, string | undefined>>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  history: Array<CompactionMessage>
  contextLimitTokens?: number
  organizationId?: string
  preparedUserMessage?: { id: string; sequence: number }
  prompt: string
  requestId: string
  runId: string
  sessionId: string
  signal: AbortSignal
  sourceRevision?: number
  systemPrompt?: unknown
  tools?: unknown
  userId: string
  runtimeConfiguration?: AgentConfiguration
  runtimeAdapterCreate?: typeof providerRuntimeAdapterCreate
  providerOutput?: {
    append: (input: unknown) => Promise<Result<void>>
    flush: () => Promise<Result<void>>
  }
  onTerminal?: (terminal: {
    assistantText?: string
    executionEvidence: RunRetryExecutionEvidence
    failure?: { code: string; message: string }
    messageId?: string | null
    status: "succeeded" | "failed" | "aborted"
  }) => Promise<void>
  onContextPrepared?: (history: Array<CompactionMessage>, sourceRevision?: number) => void
}

export function sessionChatStreamCreate(options: SessionChatStreamCreateOptions): AsyncIterable<StreamChunk> {
  return sessionChatStreamGenerate(options)
}

function sessionChatRunErrorCreate(message: string, code: string): StreamChunk {
  return {
    type: EventType.RUN_ERROR,
    code,
    message,
    timestamp: Date.now(),
  }
}

function sessionChatExecutionEvidenceResolve(chunk: StreamChunk): RunRetryExecutionEvidence | undefined {
  const providerEvent = providerExecutionEventFromStreamChunk(chunk)
  if (!providerEvent.success || providerEvent.data === null) return undefined
  const normalized = executionStreamEventNormalize(providerEvent.data)
  if (!normalized.success || normalized.data.eventType !== "tool_result") return undefined
  return "tool_result"
}

function sessionChatAdapterErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The chat adapter failed."
}

function sessionChatFailureCreate(chunk: StreamChunk, fallbackCode: string, fallbackMessage: string) {
  if (chunk.type === EventType.RUN_ERROR) {
    return {
      code: chunk.code ?? fallbackCode,
      message: chunk.message ?? fallbackMessage,
    }
  }
  return { code: fallbackCode, message: fallbackMessage }
}

async function* sessionChatStreamGenerate(options: SessionChatStreamCreateOptions): AsyncGenerator<StreamChunk> {
  let history = options.history
  let sourceRevision = options.sourceRevision
  let assistantText = ""
  let executionEvidence: RunRetryExecutionEvidence = "none"
  let terminalPersisted = false
  let terminal: StreamChunk | undefined
  let assistantMessageId: string | null = null

  const eventPersist = async (chunk: StreamChunk): Promise<void> => {
    await options.providerOutput?.append(chunk)
  }

  const terminalNotify = async (input: {
    assistantText?: string
    failure?: { code: string; message: string }
    status: "succeeded" | "failed" | "aborted"
  }): Promise<void> => {
    if (options.providerOutput !== undefined) {
      const flushed = await options.providerOutput.flush()
      if (!flushed.success) throw new Error(flushed.errorMessage)
    }
    await options.onTerminal?.({ ...input, executionEvidence, messageId: assistantMessageId })
  }

  try {
    if (options.organizationId !== undefined && options.compactionConfiguration !== undefined) {
      const preparedContext = await sessionChatContextPrepare({
        compactionAdapter: options.compactionAdapter,
        compactionConfiguration: options.compactionConfiguration,
        contextLimitTokens: options.contextLimitTokens,
        database: options.database,
        environment: options.environment,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        history,
        organizationId: options.organizationId,
        preparedUserMessage: options.preparedUserMessage,
        prompt: options.prompt,
        runtimeConfiguration: options.runtimeConfiguration,
        runtimeAdapterCreate: options.runtimeAdapterCreate,
        sessionId: options.sessionId,
        signal: options.signal,
        sourceRevision,
        systemPrompt: options.systemPrompt,
        tools: options.tools,
        userId: options.userId,
      })
      if (!preparedContext.success) {
        const errorChunk = sessionChatRunErrorCreate(preparedContext.errorMessage, "compaction_failed")
        await eventPersist(errorChunk)
        terminalPersisted = true
        await terminalNotify({
          failure: sessionChatFailureCreate(errorChunk, "compaction_failed", preparedContext.errorMessage),
          status: "failed",
        })
        yield errorChunk
        return
      }
      history = preparedContext.data.history
      sourceRevision = preparedContext.data.sourceRevision ?? sourceRevision
      options.onContextPrepared?.(history, sourceRevision)
    }

    try {
      for await (const chunk of options.adapter({
        history,
        preparedUserMessage: options.preparedUserMessage,
        prompt: options.prompt,
        runId: options.runId,
        sessionId: options.sessionId,
        signal: options.signal,
        ...(options.attemptOrdinal === undefined ? {} : { attemptOrdinal: options.attemptOrdinal }),
      })) {
        if (options.signal.aborted) return
        if (terminal !== undefined) throw new Error("The chat adapter emitted data after completion.")

        const chunkEvidence = sessionChatExecutionEvidenceResolve(chunk)
        if (chunkEvidence !== undefined) executionEvidence = chunkEvidence

        if ("messageId" in chunk && typeof chunk.messageId === "string") assistantMessageId = chunk.messageId

        if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) assistantText += chunk.delta
        if (chunk.type === EventType.RUN_ERROR) {
          await eventPersist(chunk)
          terminalPersisted = true
          await terminalNotify({
            failure: sessionChatFailureCreate(chunk, "provider_failed", "The provider reported a failed run."),
            status: "failed",
          })
          yield chunk
          return
        }
        if (chunk.type === EventType.RUN_FINISHED) {
          if (chunk.outcome?.type !== "success") {
            await eventPersist(chunk)
            terminalPersisted = true
            await terminalNotify({
              failure: sessionChatFailureCreate(chunk, "provider_failed", "The provider reported a failed run."),
              status: "failed",
            })
            yield chunk
            return
          }
          terminal = chunk
          continue
        }

        await eventPersist(chunk)
        yield chunk
      }
    } catch (error) {
      if (options.signal.aborted) return
      if (options.providerOutput === undefined) throw error
      const errorChunk = sessionChatRunErrorCreate(sessionChatAdapterErrorMessage(error), "chat_adapter_error")
      await eventPersist(errorChunk)
      terminalPersisted = true
      await terminalNotify({
        failure: sessionChatFailureCreate(errorChunk, "chat_adapter_error", "The chat adapter failed."),
        status: "failed",
      })
      yield errorChunk
      return
    }

    if (options.signal.aborted) return
    if (terminal === undefined) {
      const errorChunk = sessionChatRunErrorCreate("The chat adapter ended before completion.", "chat_interrupted")
      await eventPersist(errorChunk)
      terminalPersisted = true
      await terminalNotify({
        failure: sessionChatFailureCreate(errorChunk, "chat_interrupted", "The chat adapter ended before completion."),
        status: "failed",
      })
      yield errorChunk
      return
    }
    if (assistantText.trim().length === 0) {
      const errorChunk = sessionChatRunErrorCreate("The chat adapter returned no assistant text.", "assistant_empty")
      await eventPersist(errorChunk)
      terminalPersisted = true
      await terminalNotify({
        failure: sessionChatFailureCreate(
          errorChunk,
          "assistant_empty",
          "The chat adapter returned no assistant text.",
        ),
        status: "failed",
      })
      yield errorChunk
      return
    }
    if (options.providerOutput === undefined) {
      const persisted = await databaseTransactionRun(options.database, (transaction) =>
        (async () => {
          if (options.signal.aborted)
            return createResultError("sessionChatAssistantPersist", "The chat run was aborted.")
          const result = await messageAppend(transaction, options.userId, options.sessionId, {
            clientRequestId: `${options.requestId}:assistant`,
            content: assistantText,
            role: "assistant",
          })
          if (options.signal.aborted)
            return createResultError("sessionChatAssistantPersist", "The chat run was aborted.")
          return result
        })(),
      )
      if (options.signal.aborted) return
      if (!persisted.success) {
        const errorChunk = sessionChatRunErrorCreate(persisted.errorMessage, "assistant_persistence_error")
        await eventPersist(errorChunk)
        terminalPersisted = true
        await terminalNotify({
          failure: sessionChatFailureCreate(errorChunk, "assistant_persistence_error", persisted.errorMessage),
          status: "failed",
        })
        yield errorChunk
        return
      }
    }
    await terminalNotify({ assistantText, status: "succeeded" })
    await eventPersist(terminal)
    terminalPersisted = true
    yield terminal
  } finally {
    if (!terminalPersisted && options.providerOutput !== undefined) {
      const errorChunk = sessionChatRunErrorCreate("The chat run was aborted.", "chat_aborted")
      await eventPersist(errorChunk).catch(() => undefined)
      if (options.signal.aborted) {
        await terminalNotify({ status: "aborted" })
      } else if (options.providerOutput !== undefined) {
        await terminalNotify({
          failure: { code: "chat_aborted", message: "The chat run was aborted." },
          status: "failed",
        })
      }
    }
    options.cleanup?.()
  }
}
