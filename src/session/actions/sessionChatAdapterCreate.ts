import { EventType, type StreamChunk } from "@tanstack/ai"
import type { messageTable } from "../../message/db/messageTable.js"

type SessionChatAdapterInput = {
  attemptOrdinal?: number
  history: Array<typeof messageTable.$inferSelect>
  prompt: string
  runId: string
  sessionId: string
  signal: AbortSignal
}

export function sessionChatAdapterCreate(input: SessionChatAdapterInput): AsyncIterable<StreamChunk> {
  return sessionChatAdapterGenerate(input)
}

async function sessionChatAdapterWait(signal: AbortSignal): Promise<boolean> {
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

async function* sessionChatAdapterGenerate(input: SessionChatAdapterInput): AsyncGenerator<StreamChunk> {
  void input.history
  const messageId = `assistant-${input.runId}`
  const responseText = `Deterministic response: ${input.prompt}`

  yield {
    type: EventType.RUN_STARTED,
    threadId: input.sessionId,
    runId: input.runId,
    timestamp: Date.now(),
  }
  if (!(await sessionChatAdapterWait(input.signal))) return

  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: "assistant",
    timestamp: Date.now(),
  }
  if (!(await sessionChatAdapterWait(input.signal))) return

  const splitAt = responseText.indexOf(" ", responseText.indexOf(" ") + 1) + 1
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: responseText.slice(0, splitAt),
    timestamp: Date.now(),
  }
  if (!(await sessionChatAdapterWait(input.signal))) return

  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: responseText.slice(splitAt),
    timestamp: Date.now(),
  }
  if (!(await sessionChatAdapterWait(input.signal))) return

  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.RUN_FINISHED,
    threadId: input.sessionId,
    runId: input.runId,
    outcome: { type: "success" },
    finishReason: "stop",
    timestamp: Date.now(),
  }
}
