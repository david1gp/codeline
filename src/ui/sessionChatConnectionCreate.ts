import { EventType, type StreamChunk } from "@tanstack/ai"
import type { ConnectConnectionAdapter } from "@tanstack/ai-client"
import { apiHttpClientCreate } from "../api/client/apiHttpClientCreate.js"
import type { CommandInvocation } from "../commands/schema/commandInvocationSchema.js"
import { runActiveSnapshotFetch } from "../run/ui/runActiveSnapshotFetch.js"
import {
  type SessionChatCommandResponse,
  sessionChatCommandResponseSchema,
} from "../session/api/sessionChatCommandResponseSchema.js"
import { sessionChatRequestSchema } from "../session/schema/sessionChatRequestSchema.js"

type SessionChatConnectionOptions = {
  /**
   * Typed command identity for the turn being started. The browser sends only the
   * command name and raw arguments; expansion, shell interpolation, override
   * validation, and template-digest persistence stay server-owned.
   */
  command?: () => CommandInvocation | undefined
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  onStateChange?: (status: "error" | "recovering" | "stale" | "streaming" | "terminal") => void
  pollingDelay?: (signal: AbortSignal | undefined, milliseconds: number) => Promise<void>
  sessionId: string
}

const sessionChatConnectionPollingDelayMilliseconds = 100
const sessionChatConnectionRetryDelayMaximumMilliseconds = 1_600

function sessionChatMessageContentResolve(message: unknown): string {
  if (typeof message !== "object" || message === null) return ""
  const candidate = message as Record<string, unknown>
  if (typeof candidate.content === "string") return candidate.content
  if (!Array.isArray(candidate.parts)) return ""
  return candidate.parts
    .map((part) => {
      if (typeof part !== "object" || part === null) return ""
      const value = part as Record<string, unknown>
      if (value.type !== "text") return ""
      if (typeof value.content === "string") return value.content
      return typeof value.text === "string" ? value.text : ""
    })
    .join("")
}

function sessionChatMessageCreate(message: unknown, index: number) {
  if (typeof message !== "object" || message === null) {
    return { content: "", id: `message-${index}`, role: "user" as const }
  }
  const candidate = message as Record<string, unknown>
  const role = candidate.role
  const supportedRole: "activity" | "assistant" | "developer" | "reasoning" | "system" | "tool" | "user" =
    role === "assistant" ||
    role === "developer" ||
    role === "system" ||
    role === "tool" ||
    role === "user" ||
    role === "activity" ||
    role === "reasoning"
      ? role
      : "user"
  return {
    content: sessionChatMessageContentResolve(message),
    id: typeof candidate.id === "string" && candidate.id.length > 0 ? candidate.id : `message-${index}`,
    role: supportedRole,
  }
}

function sessionChatConnectionErrorCreate(code: string, message: string): StreamChunk {
  return { code, message, timestamp: Date.now(), type: EventType.RUN_ERROR }
}

function sessionChatConnectionWait(signal: AbortSignal | undefined, milliseconds: number): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

function sessionChatConnectionRetryDelayResolve(attempt: number): number {
  return Math.min(
    sessionChatConnectionPollingDelayMilliseconds * 2 ** (attempt - 1),
    sessionChatConnectionRetryDelayMaximumMilliseconds,
  )
}

function sessionChatConnectionSnapshotFailureRetryable(snapshot: { code?: string; statusCode?: number }): boolean {
  if (snapshot.code === "network_error") return true
  if (snapshot.statusCode === undefined) return false
  return (
    snapshot.statusCode === 408 ||
    snapshot.statusCode === 425 ||
    snapshot.statusCode === 429 ||
    (snapshot.statusCode >= 500 && snapshot.statusCode <= 599)
  )
}

async function* sessionChatConnectionRunPoll(
  command: SessionChatCommandResponse,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  signal: AbortSignal | undefined,
  onStateChange: SessionChatConnectionOptions["onStateChange"],
  pollingDelay: (signal: AbortSignal | undefined, milliseconds: number) => Promise<void>,
): AsyncGenerator<StreamChunk> {
  onStateChange?.("streaming")
  let partialText = ""
  let retryAttempt = 0
  for (;;) {
    if (signal?.aborted) return
    const snapshot = await runActiveSnapshotFetch(command.sessionId, command.runId, { fetch: fetcher, signal })
    if (!snapshot.success) {
      if (snapshot.code === "aborted") return
      if (!sessionChatConnectionSnapshotFailureRetryable(snapshot)) {
        onStateChange?.("error")
        yield sessionChatConnectionErrorCreate("run_snapshot_error", snapshot.errorMessage)
        return
      }
      retryAttempt += 1
      onStateChange?.("recovering")
      await pollingDelay(signal, sessionChatConnectionRetryDelayResolve(retryAttempt))
      continue
    }
    if (retryAttempt > 0) {
      retryAttempt = 0
      onStateChange?.("streaming")
    }
    const nextText = snapshot.data.partialText
    if (snapshot.data.status === "succeeded") {
      if (nextText.startsWith(partialText)) {
        const delta = nextText.slice(partialText.length)
        partialText = nextText
        if (delta.length > 0)
          yield {
            delta,
            messageId: command.runId,
            type: EventType.TEXT_MESSAGE_CONTENT,
          }
      }
      onStateChange?.("terminal")
      yield {
        outcome: { type: "success" },
        runId: command.runId,
        threadId: command.sessionId,
        type: EventType.RUN_FINISHED,
      }
      return
    }
    if (snapshot.data.status === "failed" || snapshot.data.status === "aborted") {
      onStateChange?.("error")
      yield sessionChatConnectionErrorCreate(
        snapshot.data.failure?.code ?? "run_failed",
        snapshot.data.failure?.message ?? "The chat run did not complete successfully.",
      )
      return
    }
    if (!nextText.startsWith(partialText)) {
      onStateChange?.("error")
      yield sessionChatConnectionErrorCreate("run_snapshot_error", "The active run snapshot text is not append-only.")
      return
    }
    const delta = nextText.slice(partialText.length)
    partialText = nextText
    if (delta.length > 0) {
      yield {
        delta,
        messageId: command.runId,
        type: EventType.TEXT_MESSAGE_CONTENT,
      }
    }
    await pollingDelay(signal, sessionChatConnectionPollingDelayMilliseconds)
  }
}

export function sessionChatConnectionCreate(options: SessionChatConnectionOptions): ConnectConnectionAdapter {
  const fetcher = options.fetcher ?? globalThis.fetch
  const client = apiHttpClientCreate({ fetch: fetcher })
  const connect: ConnectConnectionAdapter["connect"] = async function* (
    messages,
    data,
    signal,
    runContext,
  ): AsyncGenerator<StreamChunk> {
    const runId = runContext?.runId
    if (runId === undefined) {
      yield sessionChatConnectionErrorCreate("chat_run_missing", "The chat run identifier is missing.")
      return
    }
    const forwardedProps = runContext?.forwardedProps
    const invocation = options.command?.()
    const command = await client.post({
      body: {
        ...(invocation === undefined ? {} : { command: invocation }),
        ...(data === undefined ? {} : { context: [data] }),
        ...(forwardedProps === undefined ? {} : { forwardedProps }),
        messages: messages.map(sessionChatMessageCreate),
        runId,
        threadId: options.sessionId,
      },
      op: "sessionChatCommand",
      path: `/api/sessions/${encodeURIComponent(options.sessionId)}/chat`,
      requestSchema: sessionChatRequestSchema,
      responseSchema: sessionChatCommandResponseSchema,
      signal,
    })
    if (!command.success) {
      yield sessionChatConnectionErrorCreate(command.code ?? "chat_command_error", command.errorMessage)
      return
    }
    const pollingDelay =
      options.pollingDelay ??
      ((pollSignal: AbortSignal | undefined, milliseconds: number) =>
        sessionChatConnectionWait(pollSignal, milliseconds))
    yield* sessionChatConnectionRunPoll(command.data, fetcher, signal, options.onStateChange, pollingDelay)
  }
  return { connect }
}
