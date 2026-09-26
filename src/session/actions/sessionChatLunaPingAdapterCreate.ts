import { EventType, type StreamChunk } from "@tanstack/ai"
import type { sessionChatAdapterCreate } from "./sessionChatAdapterCreate.js"

type SessionChatLunaPingAdapterInput = Parameters<typeof sessionChatAdapterCreate>[0]

export function sessionChatLunaPingAdapterCreate(input: SessionChatLunaPingAdapterInput): AsyncIterable<StreamChunk> {
  return sessionChatLunaPingAdapterGenerate(input)
}

async function sessionChatLunaPingAdapterWait(signal: AbortSignal): Promise<boolean> {
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

async function* sessionChatLunaPingAdapterGenerate(
  input: SessionChatLunaPingAdapterInput,
): AsyncGenerator<StreamChunk> {
  const messageId = `assistant-${input.runId}`

  yield {
    type: EventType.RUN_STARTED,
    threadId: input.sessionId,
    runId: input.runId,
    timestamp: Date.now(),
  }
  if (!(await sessionChatLunaPingAdapterWait(input.signal))) return

  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: "assistant",
    timestamp: Date.now(),
  }
  if (!(await sessionChatLunaPingAdapterWait(input.signal))) return

  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: "pong",
    timestamp: Date.now(),
  }
  if (!(await sessionChatLunaPingAdapterWait(input.signal))) return

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
