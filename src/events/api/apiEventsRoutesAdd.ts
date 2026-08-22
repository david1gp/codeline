import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { journalBacklogCursorSelect } from "../../journal/actions/journalBacklogCursorSelect.js"
import { journalBacklogRead } from "../../journal/actions/journalBacklogRead.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import { streamLiveSubscriptionCreate } from "../../stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../../stream/actions/streamSseConnectionWriterCreate.js"
import type { StreamSseFrame } from "../../stream/api/streamSseFrameSchema.js"
import { streamSseFrameSchema } from "../../stream/api/streamSseFrameSchema.js"
import type { JournalEvent } from "../../stream/schema/journalEventSchema.js"
import { journalEventSchema } from "../../stream/schema/journalEventSchema.js"

type ApiEventsRoutesScheduler = Parameters<typeof streamSseConnectionWriterCreate>[0]["scheduler"]
type ApiEventsRoutesConnection = ReturnType<typeof streamSseConnectionWriterCreate>
type ApiEventsBacklogData = {
  afterSequence: number
  mode: "replay" | "reset"
  pages: AsyncIterable<Result<readonly StreamSseFrame[]>>
  replayUpperBound: number
  selectedCursor: string | undefined
}
type ApiEventsBacklogRead = (
  dependencies: Parameters<typeof journalBacklogRead>[0],
  input: Parameters<typeof journalBacklogRead>[1],
) => Promise<Result<ApiEventsBacklogData>>

type ApiEventsRoutesOptions = {
  backlogRead?: ApiEventsBacklogRead
  connectionWriterCreate?: typeof streamSseConnectionWriterCreate
  cursorCodec: JournalCursorCodec
  liveSubscription: ReturnType<typeof streamLiveSubscriptionCreate>
  now?: () => number
  scheduler?: ApiEventsRoutesScheduler
}

type ApiEventsContext = Context<AppEnvironment>

function apiEventsUnauthorized(context: ApiEventsContext) {
  const response = {
    error: { code: "unauthorized", message: "Authentication is required." },
  } satisfies ApiErrorResponse
  context.header("Cache-Control", "no-store")
  return context.json(response, 401)
}

function apiEventsBadRequest(context: ApiEventsContext) {
  const response = {
    error: { code: "bad_request", message: "The event feed cursor is invalid." },
  } satisfies ApiErrorResponse
  return context.json(response, 400)
}

function apiEventsUnavailable(context: ApiEventsContext) {
  const response = {
    error: { code: "internal_server_error", message: "The event feed is unavailable." },
  } satisfies ApiErrorResponse
  return context.json(response, 503)
}

function apiEventsInternalError(context: ApiEventsContext) {
  const response = {
    error: { code: "internal_server_error", message: "The event feed could not be opened." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function apiEventsBacklogErrorResponse(context: ApiEventsContext, result: { code?: string }) {
  if (result.code === "cursor_invalid" || result.code === "cursor_owner_mismatch") return apiEventsBadRequest(context)
  if (result.code === "authenticated_user_invalid") return apiEventsUnauthorized(context)
  if (result.code === "journal_unavailable") return apiEventsUnavailable(context)
  return apiEventsInternalError(context)
}

function apiEventsLiveFrameCreate(
  cursorCodec: Pick<JournalCursorCodec, "encode">,
  userId: string,
  event: JournalEvent,
): Result<StreamSseFrame> {
  const op = "apiEventsLiveFrameCreate"
  const encoded = cursorCodec.encode(userId, event.sequence)
  if (!encoded.success) return createResultError(op, encoded.errorMessage)

  const parsed = v.safeParse(streamSseFrameSchema, {
    data: { ...event, id: encoded.data },
    event: event.eventType,
    id: encoded.data,
  })
  if (!parsed.success) return createResultError(op, "The live journal event does not form a valid SSE frame.")
  return createResult(parsed.output)
}

function apiEventsReplayBaselineResolve(
  cursorCodec: Pick<JournalCursorCodec, "validate">,
  userId: string,
  input: { after?: unknown; lastEventId?: unknown },
): Result<number> {
  const op = "apiEventsReplayBaselineResolve"
  const selected = journalBacklogCursorSelect(input)
  if (!selected.success) return selected
  if (selected.data.cursor === undefined) return createResult(0)

  const validated = cursorCodec.validate(selected.data.cursor, userId)
  if (!validated.success) {
    const code = validated.code === "cursor_owner_mismatch" ? "cursor_owner_mismatch" : "cursor_invalid"
    return createResultErrorCode(op, validated.errorMessage, code)
  }
  if (!Number.isSafeInteger(validated.data.sequence) || validated.data.sequence < 0)
    return createResultErrorCode(op, "The journal sequence is invalid.", "cursor_invalid")
  return createResult(validated.data.sequence)
}

function apiEventsSubscriptionCreate(
  liveSubscription: ReturnType<typeof streamLiveSubscriptionCreate>,
  cursorCodec: Pick<JournalCursorCodec, "encode" | "validate">,
  baselineSequence: number,
  onConversionError: () => void,
) {
  return {
    subscribe: (userId: string, subscriber: (event: StreamSseFrame) => void): (() => void) =>
      liveSubscription.subscribe(userId, (event, publishedUserId) => {
        if (publishedUserId !== userId) {
          onConversionError()
          return
        }
        if ("data" in event) {
          const parsed = v.safeParse(streamSseFrameSchema, event)
          if (!parsed.success) {
            onConversionError()
            return
          }
          const validated = cursorCodec.validate(parsed.output.id, userId)
          if (!validated.success || validated.data.sequence !== parsed.output.data.sequence) {
            onConversionError()
            return
          }
          if (parsed.output.data.sequence <= baselineSequence) return
          subscriber(parsed.output)
          return
        }

        const parsed = v.safeParse(journalEventSchema, event)
        if (!parsed.success) {
          onConversionError()
          return
        }
        if (parsed.output.sequence <= baselineSequence) return
        const frame = apiEventsLiveFrameCreate(cursorCodec, userId, parsed.output)
        if (!frame.success) {
          onConversionError()
          return
        }
        subscriber(frame.data)
      }),
  }
}

function apiEventsConnectionWriterCreate(
  context: ApiEventsContext,
  options: ApiEventsRoutesOptions,
  cursorCodec: JournalCursorCodec,
  baselineSequence: number,
  connection: { current?: ApiEventsRoutesConnection },
  outputWriter: WritableStreamDefaultWriter<Uint8Array>,
): ApiEventsRoutesConnection {
  const subscription = apiEventsSubscriptionCreate(options.liveSubscription, cursorCodec, baselineSequence, () => {
    void connection.current?.disconnect("connection-frame-invalid")
  })
  const writerCreate = options.connectionWriterCreate ?? streamSseConnectionWriterCreate
  return writerCreate({
    baselineSequence,
    now: options.now ?? Date.now,
    scheduler: options.scheduler ?? {
      clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      setInterval: (handler, timeoutMs) => setInterval(handler, timeoutMs),
      setTimeout: (handler, timeoutMs) => setTimeout(handler, timeoutMs),
    },
    subscription,
    userId: context.var.requestIdentity.userId,
    writer: {
      abort: (reason) => outputWriter.abort(reason).catch(() => undefined),
      close: () => outputWriter.close().catch(() => undefined),
      write: (chunk) => outputWriter.write(chunk),
    },
  })
}

async function apiEventsBacklogPump(
  connection: ApiEventsRoutesConnection,
  pages: ApiEventsBacklogData["pages"],
): Promise<void> {
  try {
    for await (const page of pages) {
      if (!page.success) {
        await connection.disconnect("backlog-page-read-failed")
        return
      }
      const enqueued = await connection.enqueueBacklog(page.data)
      if (!enqueued.success) {
        if (!connection.isDisconnected()) await connection.disconnect("backlog-queue-failed")
        return
      }
    }

    const completed = connection.completeBacklog()
    if (!completed.success && !connection.isDisconnected()) await connection.disconnect("backlog-handoff-failed")
  } catch (_error) {
    if (!connection.isDisconnected()) await connection.disconnect("backlog-read-failed")
  }
}

export function apiEventsRoutesAdd(api: Hono<AppEnvironment>, options: ApiEventsRoutesOptions): void {
  if (options.cursorCodec === undefined) throw new Error("The authenticated event feed cursor codec is required.")
  if (options.liveSubscription === undefined) throw new Error("The authenticated event feed subscription is required.")

  api.get("/events", async (context) => {
    const identity = context.var.requestIdentity
    if (identity === undefined || typeof identity.userId !== "string" || identity.userId.length === 0)
      return apiEventsUnauthorized(context)

    const cursorCodec = options.cursorCodec
    const baseline = apiEventsReplayBaselineResolve(cursorCodec, identity.userId, {
      after: context.req.query("after"),
      lastEventId: context.req.header("Last-Event-ID"),
    })
    if (!baseline.success) return apiEventsBacklogErrorResponse(context, baseline)

    const output = new TransformStream<Uint8Array, Uint8Array>()
    const outputWriter = output.writable.getWriter()
    const connectionState: { current?: ApiEventsRoutesConnection } = {}
    const connection = apiEventsConnectionWriterCreate(
      context,
      options,
      cursorCodec,
      baseline.data,
      connectionState,
      outputWriter,
    )
    connectionState.current = connection
    const requestSignal = context.req.raw.signal
    const onRequestAbort = () => {
      void connection.disconnect("request-aborted")
    }
    requestSignal.addEventListener("abort", onRequestAbort, { once: true })
    void outputWriter.closed.then(
      () => {
        requestSignal.removeEventListener("abort", onRequestAbort)
        if (!connection.isDisconnected()) void connection.close()
      },
      () => {
        requestSignal.removeEventListener("abort", onRequestAbort)
        if (!connection.isDisconnected()) void connection.disconnect("output-closed")
      },
    )

    const connected = connection.connect()
    if (!connected.success) {
      requestSignal.removeEventListener("abort", onRequestAbort)
      await connection.disconnect("connection-subscription-failed")
      return apiEventsInternalError(context)
    }
    if (requestSignal.aborted) {
      await connection.disconnect("request-aborted")
      return apiEventsInternalError(context)
    }

    let backlog: Awaited<ReturnType<ApiEventsBacklogRead>>
    try {
      backlog = await (options.backlogRead ?? journalBacklogRead)(
        { cursorCodec, database: context.var.database },
        {
          after: context.req.query("after"),
          lastEventId: context.req.header("Last-Event-ID"),
          userId: identity.userId,
        },
      )
    } catch (_error) {
      await connection.disconnect("backlog-read-failed")
      return apiEventsInternalError(context)
    }
    if (!backlog.success) {
      await connection.disconnect("backlog-read-rejected")
      return apiEventsBacklogErrorResponse(context, backlog)
    }

    if (backlog.data.mode === "replay") {
      const upperBoundSet = connection.setReplayUpperBound(backlog.data.replayUpperBound)
      if (!upperBoundSet.success) {
        await connection.disconnect("backlog-upper-bound-failed")
        return apiEventsInternalError(context)
      }
    }

    void apiEventsBacklogPump(connection, backlog.data.pages)

    return new Response(output.readable, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      },
    })
  })
}
