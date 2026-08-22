import { createResultError } from "@adaptive-ds/result"
import { EventType, type StreamChunk } from "@tanstack/ai"
import type { ExecutionConvexClient } from "../../convex/executionConvexClient.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { messageAppend } from "../../message/actions/messageAppend.js"
import type { messageTable } from "../../message/db/messageTable.js"
import type { streamReplayServiceCreate } from "../../stream/actions/streamReplayServiceCreate.js"
import { sessionChatAdapterCreate } from "./sessionChatAdapterCreate.js"

type SessionChatStreamCreateOptions = {
  adapter: typeof sessionChatAdapterCreate
  attemptOrdinal?: number
  cleanup?: () => void
  database?: DatabaseClient
  executionConvexClient?: ExecutionConvexClient
  history: Array<typeof messageTable.$inferSelect>
  prompt: string
  replayService?: ReturnType<typeof streamReplayServiceCreate>
  requestId: string
  runId: string
  sessionId: string
  signal: AbortSignal
  userId: string
  onEventId?: (sequence: number, eventId: string) => void
  onTerminal?: (terminal: {
    failure?: { code: string; message: string }
    status: "succeeded" | "failed" | "aborted"
  }) => Promise<void>
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
  let assistantText = ""
  let eventSequence = 0
  let terminalPersisted = false
  let terminal: StreamChunk | undefined

  const eventPersist = async (chunk: StreamChunk): Promise<void> => {
    if (options.replayService === undefined) return

    const sequence = eventSequence + 1
    const persisted = await options.replayService.append({
      eventType: chunk.type,
      idempotencyKey: `${options.runId}:${sequence}`,
      payload: chunk,
      sequence,
    })
    if (!persisted.success) throw new Error(persisted.errorMessage)

    eventSequence = sequence
    options.onEventId?.(sequence, persisted.data.event.id)
  }

  try {
    try {
      for await (const chunk of options.adapter({
        history: options.history,
        prompt: options.prompt,
        runId: options.runId,
        sessionId: options.sessionId,
        signal: options.signal,
        ...(options.attemptOrdinal === undefined ? {} : { attemptOrdinal: options.attemptOrdinal }),
      })) {
        if (options.signal.aborted) return
        if (terminal !== undefined) throw new Error("The chat adapter emitted data after completion.")

        if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) assistantText += chunk.delta
        if (chunk.type === EventType.RUN_ERROR) {
          await eventPersist(chunk)
          terminalPersisted = true
          await options.onTerminal?.({
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
            await options.onTerminal?.({
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
      if (options.replayService === undefined) throw error
      const errorChunk = sessionChatRunErrorCreate(sessionChatAdapterErrorMessage(error), "chat_adapter_error")
      await eventPersist(errorChunk)
      terminalPersisted = true
      await options.onTerminal?.({
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
      await options.onTerminal?.({
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
      await options.onTerminal?.({
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

    const persisted =
      options.executionConvexClient === undefined
        ? options.database === undefined
          ? createResultError("sessionChatAssistantPersist", "The message database is unavailable.")
          : await databaseTransactionRun(options.database, (transaction) =>
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
        : await options.executionConvexClient.messageAppend(options.userId, options.sessionId, {
            clientRequestId: `${options.requestId}:assistant`,
            content: assistantText,
            role: "assistant",
          })
    if (options.signal.aborted) return
    if (!persisted.success) {
      const errorChunk = sessionChatRunErrorCreate(persisted.errorMessage, "assistant_persistence_error")
      await eventPersist(errorChunk)
      terminalPersisted = true
      await options.onTerminal?.({
        failure: sessionChatFailureCreate(errorChunk, "assistant_persistence_error", persisted.errorMessage),
        status: "failed",
      })
      yield errorChunk
      return
    }

    await eventPersist(terminal)
    terminalPersisted = true
    await options.onTerminal?.({ status: "succeeded" })
    yield terminal
  } finally {
    if (!terminalPersisted && options.replayService !== undefined) {
      const errorChunk = sessionChatRunErrorCreate("The chat run was aborted.", "chat_aborted")
      await eventPersist(errorChunk).catch(() => undefined)
      if (options.signal.aborted) {
        await options.onTerminal?.({ status: "aborted" })
      }
    }
    options.cleanup?.()
  }
}
