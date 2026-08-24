import { createResultError, type Result } from "@adaptive-ds/result"
import { EventType, type StreamChunk } from "@tanstack/ai"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { messageAppend } from "../../message/actions/messageAppend.js"
import type { messageTable } from "../../message/db/messageTable.js"
import { sessionChatAdapterCreate } from "./sessionChatAdapterCreate.js"

type SessionChatStreamCreateOptions = {
  adapter: typeof sessionChatAdapterCreate
  attemptOrdinal?: number
  cleanup?: () => void
  database: DatabaseClient
  history: Array<typeof messageTable.$inferSelect>
  prompt: string
  requestId: string
  runId: string
  sessionId: string
  signal: AbortSignal
  userId: string
  providerOutput?: {
    append: (input: unknown) => Promise<Result<void>>
    flush: () => Promise<Result<void>>
  }
  onTerminal?: (terminal: {
    assistantText?: string
    failure?: { code: string; message: string }
    messageId?: string | null
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
    await options.onTerminal?.({ ...input, messageId: assistantMessageId })
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
