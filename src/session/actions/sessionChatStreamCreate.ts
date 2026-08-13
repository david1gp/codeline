import { createResultError } from "@adaptive-ds/result"
import { EventType, type StreamChunk } from "@tanstack/ai"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { messageAppend } from "../../message/actions/messageAppend.js"
import type { messageTable } from "../../message/db/messageTable.js"
import { sessionChatAdapterCreate } from "./sessionChatAdapterCreate.js"

type SessionChatStreamCreateOptions = {
  adapter: typeof sessionChatAdapterCreate
  cleanup?: () => void
  database: DatabaseClient
  history: Array<typeof messageTable.$inferSelect>
  prompt: string
  requestId: string
  runId: string
  sessionId: string
  signal: AbortSignal
  userId: string
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

async function* sessionChatStreamGenerate(options: SessionChatStreamCreateOptions): AsyncGenerator<StreamChunk> {
  let assistantText = ""
  let terminal: StreamChunk | undefined

  try {
    for await (const chunk of options.adapter({
      history: options.history,
      prompt: options.prompt,
      runId: options.runId,
      sessionId: options.sessionId,
      signal: options.signal,
    })) {
      if (options.signal.aborted) return
      if (terminal !== undefined) throw new Error("The chat adapter emitted data after completion.")

      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) assistantText += chunk.delta
      if (chunk.type === EventType.RUN_ERROR) {
        yield chunk
        return
      }
      if (chunk.type === EventType.RUN_FINISHED) {
        if (chunk.outcome?.type !== "success") {
          yield chunk
          return
        }
        terminal = chunk
        continue
      }

      yield chunk
    }

    if (terminal === undefined || options.signal.aborted) return
    if (assistantText.trim().length === 0) {
      yield sessionChatRunErrorCreate("The chat adapter returned no assistant text.", "assistant_empty")
      return
    }

    const persisted = await databaseTransactionRun(options.database, (transaction) =>
      (async () => {
        if (options.signal.aborted) return createResultError("sessionChatAssistantPersist", "The chat run was aborted.")
        const result = await messageAppend(transaction, options.userId, options.sessionId, {
          clientRequestId: `${options.requestId}:assistant`,
          content: assistantText,
          role: "assistant",
        })
        if (options.signal.aborted) return createResultError("sessionChatAssistantPersist", "The chat run was aborted.")
        return result
      })(),
    )
    if (options.signal.aborted) return
    if (!persisted.success) {
      yield sessionChatRunErrorCreate(persisted.errorMessage, "assistant_persistence_error")
      return
    }

    yield terminal
  } finally {
    options.cleanup?.()
  }
}
