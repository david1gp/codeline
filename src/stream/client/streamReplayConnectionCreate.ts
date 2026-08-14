import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { fetchServerSentEvents } from "@tanstack/ai-client"
import { streamReplayClientCreate } from "./streamReplayClientCreate.js"

type StreamReplayConnectionStatus = "error" | "recovering" | "stale" | "streaming" | "terminal"

type StreamReplayConnectionOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  onStateChange?: (status: StreamReplayConnectionStatus) => void
  sessionId: string
}

function streamReplayConnectionChunkResolve(event: { eventType: string; payload: unknown }): Result<StreamChunk> {
  const op = "streamReplayConnectionCreate"
  if (typeof event.payload !== "object" || event.payload === null || Array.isArray(event.payload)) {
    return createResultError(op, "The recovered stream event payload is invalid.")
  }
  if (!("type" in event.payload) || typeof event.payload.type !== "string" || event.payload.type !== event.eventType) {
    return createResultError(op, "The recovered stream event type is invalid.")
  }
  return createResult(event.payload as StreamChunk)
}

function streamReplayConnectionErrorChunk(code: string, message: string): StreamChunk {
  return {
    code,
    message,
    timestamp: Date.now(),
    type: EventType.RUN_ERROR,
  }
}

function streamReplayConnectionTerminalStatus(chunk: StreamChunk): StreamReplayConnectionStatus | null {
  if (chunk.type === EventType.RUN_ERROR) return "error"
  if (chunk.type === EventType.RUN_FINISHED) return "terminal"
  return null
}

function streamReplayConnectionWait(signal: AbortSignal | undefined, milliseconds: number): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function streamReplayConnectionLiveFetchCreate(
  fetcher: StreamReplayConnectionOptions["fetcher"],
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  // Recovery owns the read-only GET. Removing live SSE IDs prevents TanStack's
  // resumable transport from retrying the POST and re-executing the provider.
  const request = (fetcher ?? globalThis.fetch) as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  return async (input, init) => {
    const response = await request(input, init)
    if (response.body === null) return response

    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let remainder = ""
    const stripEventIds = (value: Uint8Array, flush = false): Uint8Array => {
      remainder += decoder.decode(value, { stream: !flush })
      const lines = remainder.split("\n")
      remainder = flush ? "" : (lines.pop() ?? "")
      const filtered = lines.filter((line) => !line.startsWith("id:"))
      if (flush && remainder !== "" && !remainder.startsWith("id:")) filtered.push(remainder)
      return encoder.encode(filtered.map((line) => `${line}\n`).join(""))
    }
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        flush(controller) {
          const remainderBytes = stripEventIds(new Uint8Array(), true)
          if (remainderBytes.byteLength > 0) controller.enqueue(remainderBytes)
        },
        transform(value, controller) {
          const filtered = stripEventIds(value)
          if (filtered.byteLength > 0) controller.enqueue(filtered)
        },
      }),
    )
    return new Response(body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    })
  }
}

export function streamReplayConnectionCreate(options: StreamReplayConnectionOptions) {
  const fetchClient = streamReplayConnectionLiveFetchCreate(options.fetcher) as typeof globalThis.fetch
  const liveConnection = fetchServerSentEvents(`/api/sessions/${encodeURIComponent(options.sessionId)}/chat`, {
    fetchClient,
    reconnect: { delayMs: 0, maxAttempts: 0 },
  })

  const connect = async function* (...args: Parameters<typeof liveConnection.connect>): AsyncGenerator<StreamChunk> {
    const [messages, data, abortSignal, runContext] = args
    let delivered = 0
    let terminal = false
    options.onStateChange?.("streaming")

    try {
      for await (const chunk of liveConnection.connect(messages, data, abortSignal, runContext)) {
        if (abortSignal?.aborted) return
        delivered += 1
        const terminalStatus = streamReplayConnectionTerminalStatus(chunk)
        if (terminalStatus !== null) {
          terminal = true
          options.onStateChange?.(terminalStatus)
        }
        yield chunk
      }
    } catch (_error) {
      if (abortSignal?.aborted) return
    }

    if (abortSignal?.aborted || terminal) return
    options.onStateChange?.("recovering")
    if (runContext === undefined) {
      options.onStateChange?.("error")
      yield streamReplayConnectionErrorChunk(
        "stream_replay_error",
        "The response connection ended before it could be recovered.",
      )
      return
    }

    const replayClient = streamReplayClientCreate({
      afterSequence: delivered,
      ...(options.apiBase === undefined ? {} : { apiBase: options.apiBase }),
      ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
      sessionId: options.sessionId,
      streamId: `session-chat:${options.sessionId}:${runContext.runId}`,
    })
    for (;;) {
      const replay = await replayClient.replay({ signal: abortSignal })
      if (abortSignal?.aborted) return
      if (!replay.success) {
        const stale = replay.code === "stream_stale"
        options.onStateChange?.(stale ? "stale" : "error")
        yield streamReplayConnectionErrorChunk(replay.code ?? "stream_replay_error", replay.errorMessage)
        return
      }

      for (const event of replay.data.events) {
        if (abortSignal?.aborted) return
        const chunk = streamReplayConnectionChunkResolve(event)
        if (!chunk.success) {
          options.onStateChange?.("error")
          yield streamReplayConnectionErrorChunk("stream_replay_error", chunk.errorMessage)
          return
        }
        const terminalStatus = streamReplayConnectionTerminalStatus(chunk.data)
        if (terminalStatus !== null) {
          terminal = true
          options.onStateChange?.(terminalStatus)
        }
        yield chunk.data
      }

      if (terminal || replay.data.outcome === "terminal") {
        if (!terminal) options.onStateChange?.("terminal")
        return
      }
      await streamReplayConnectionWait(abortSignal, 250)
      if (abortSignal?.aborted) return
    }
  }

  return { connect }
}
