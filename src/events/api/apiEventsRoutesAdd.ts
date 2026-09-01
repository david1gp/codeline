import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { journalBacklogCursorSelect } from "../../journal/actions/journalBacklogCursorSelect.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import type { journalGlobalSummaryBacklogRead } from "../../journal/actions/journalGlobalSummaryBacklogRead.js"
import type { metricsCollectorCreate } from "../../metrics/metricsCollectorCreate.js"
import { streamLiveSubscriptionCreate } from "../../stream/actions/streamLiveSubscriptionCreate.js"
import type { streamSseConnectionWriterCreate } from "../../stream/actions/streamSseConnectionWriterCreate.js"
import type { GlobalSummarySseFrame } from "../../stream/api/globalSummarySseFrameSchema.js"
import { globalSummarySseFrameSchema } from "../../stream/api/globalSummarySseFrameSchema.js"
import type { StreamSseFrame } from "../../stream/api/streamSseFrameSchema.js"
import { streamSseFrameSchema } from "../../stream/api/streamSseFrameSchema.js"

type ApiEventsRoutesScheduler = Parameters<typeof streamSseConnectionWriterCreate>[0]["scheduler"]
type ApiEventsRoutesConnection = ReturnType<typeof streamSseConnectionWriterCreate>
type ApiEventsGlobalSummaryLiveSubscription = Pick<
  ReturnType<typeof streamLiveSubscriptionCreate>,
  "globalSummarySubscribe"
>
type ApiEventsBacklogFrame = GlobalSummarySseFrame | StreamSseFrame
type ApiEventsBacklogData = {
  mode: "replay" | "reset"
  pages: AsyncIterable<Result<readonly ApiEventsBacklogFrame[]>>
  replayUpperBound: number
  selectedCursor: string | undefined
}
type ApiEventsBacklogRead = (
  dependencies: Parameters<typeof journalGlobalSummaryBacklogRead>[0],
  input: Parameters<typeof journalGlobalSummaryBacklogRead>[1],
) => Promise<Result<ApiEventsBacklogData>>

type ApiEventsRoutesOptions = {
  backlogRead: ApiEventsBacklogRead
  connectionWriterCreate: typeof streamSseConnectionWriterCreate
  cursorCodec: JournalCursorCodec
  globalSummaryLiveSubscription?: ApiEventsGlobalSummaryLiveSubscription
  liveSubscription: ReturnType<typeof streamLiveSubscriptionCreate>
  now: () => number
  scheduler: ApiEventsRoutesScheduler
  metricsCollector: ReturnType<typeof metricsCollectorCreate>
}

function apiEventsGlobalCursorValidate(
  cursorCodec: Pick<JournalCursorCodec, "validate">,
  userId: string,
  cursor: unknown,
  allowLegacyCursor: boolean,
): Result<{ globalSequence: number }> {
  const globalCursorCodec = cursorCodec as Pick<JournalCursorCodec, "validate"> & {
    validateGlobalSequence?: JournalCursorCodec["validateGlobalSequence"]
  }
  if (allowLegacyCursor) {
    const validated = cursorCodec.validate(cursor, userId)
    if (!validated.success) return validated
    return createResult({ globalSequence: validated.data.sequence })
  }
  if (globalCursorCodec.validateGlobalSequence !== undefined) {
    const validated = globalCursorCodec.validateGlobalSequence(cursor, userId)
    if (!validated.success) return validated
    return createResult({ globalSequence: validated.data.globalSequence })
  }

  const validated = cursorCodec.validate(cursor, userId)
  if (!validated.success) return validated
  return createResult({ globalSequence: validated.data.sequence })
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

function apiEventsGlobalFrameValidate(
  cursorCodec: Pick<JournalCursorCodec, "validate">,
  userId: string,
  event: unknown,
): Result<GlobalSummarySseFrame> {
  const op = "apiEventsGlobalFrameValidate"
  const parsed = v.safeParse(globalSummarySseFrameSchema, event)
  if (!parsed.success) return createResultError(op, "The global summary event does not match its contract.")
  const validated = apiEventsGlobalCursorValidate(cursorCodec, userId, parsed.output.id, false)
  if (!validated.success) return createResultError(op, validated.errorMessage)
  if (validated.data.globalSequence !== parsed.output.data.globalSequence)
    return createResultError(op, "The global summary cursor does not match its sequence.")
  return createResult(parsed.output)
}

function apiEventsGlobalReplayBaselineResolve(
  cursorCodec: Pick<JournalCursorCodec, "validate">,
  userId: string,
  input: { after?: unknown; lastEventId?: unknown },
  allowLegacyCursor: boolean,
): Result<number> {
  const op = "apiEventsGlobalReplayBaselineResolve"
  const selected = journalBacklogCursorSelect(input)
  if (!selected.success) return selected
  if (selected.data.cursor === undefined) return createResult(0)

  const validated = apiEventsGlobalCursorValidate(cursorCodec, userId, selected.data.cursor, allowLegacyCursor)
  if (!validated.success) {
    const code = validated.code === "cursor_owner_mismatch" ? "cursor_owner_mismatch" : "cursor_invalid"
    return createResultErrorCode(op, validated.errorMessage, code)
  }
  if (!Number.isSafeInteger(validated.data.globalSequence) || validated.data.globalSequence < 0)
    return createResultErrorCode(op, "The global sequence is invalid.", "cursor_invalid")
  return createResult(validated.data.globalSequence)
}

function apiEventsSubscriptionCreate(
  liveSubscription: ReturnType<typeof streamLiveSubscriptionCreate>,
  globalSummaryLiveSubscription: ApiEventsGlobalSummaryLiveSubscription | undefined,
  cursorCodec: Pick<JournalCursorCodec, "encode" | "validate">,
  baselineGlobalSequence: number,
  onConversionError: () => void,
) {
  if (globalSummaryLiveSubscription === undefined) {
    return {
      subscribe: (userId: string, subscriber: (event: GlobalSummarySseFrame) => void): (() => void) =>
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
            subscriber(parsed.output as unknown as GlobalSummarySseFrame)
            return
          }
          subscriber(event as unknown as GlobalSummarySseFrame)
        }),
    }
  }

  return {
    subscribe: (userId: string, subscriber: (event: GlobalSummarySseFrame) => void): (() => void) =>
      globalSummaryLiveSubscription.globalSummarySubscribe(userId, (event, publishedUserId) => {
        if (publishedUserId !== userId) {
          onConversionError()
          return
        }
        const global = apiEventsGlobalFrameValidate(cursorCodec, userId, event)
        if (!global.success) {
          onConversionError()
          return
        }
        if (global.data.data.globalSequence <= baselineGlobalSequence) return
        subscriber(global.data)
      }),
  }
}

function apiEventsConnectionWriterCreate(
  context: ApiEventsContext,
  options: ApiEventsRoutesOptions,
  cursorCodec: JournalCursorCodec,
  baselineGlobalSequence: number,
  connection: { current?: ApiEventsRoutesConnection },
  outputWriter: WritableStreamDefaultWriter<Uint8Array>,
): ApiEventsRoutesConnection {
  const subscription = apiEventsSubscriptionCreate(
    options.liveSubscription,
    options.globalSummaryLiveSubscription,
    cursorCodec,
    baselineGlobalSequence,
    () => {
      void connection.current?.disconnect("connection-frame-invalid")
    },
  )
  return options.connectionWriterCreate({
    baselineSequence: baselineGlobalSequence,
    baselineGlobalSequence: options.globalSummaryLiveSubscription === undefined ? undefined : baselineGlobalSequence,
    now: options.now,
    scheduler: options.scheduler,
    sequenceKind: options.globalSummaryLiveSubscription === undefined ? "journal" : "global-summary",
    subscription,
    userId: context.var.requestIdentity.userId,
    writer: {
      abort: (reason) => outputWriter.abort(reason).catch(() => undefined),
      close: () => outputWriter.close().catch(() => undefined),
      write: (chunk) => outputWriter.write(chunk),
    },
    metricsCollector: options.metricsCollector,
  })
}

async function apiEventsBacklogPump(
  connection: ApiEventsRoutesConnection,
  pages: ApiEventsBacklogData["pages"],
  cursorCodec: Pick<JournalCursorCodec, "encode" | "validate">,
  userId: string,
  globalSummaryLiveSubscription: ApiEventsGlobalSummaryLiveSubscription | undefined,
): Promise<void> {
  try {
    for await (const page of pages) {
      if (!page.success) {
        await connection.disconnect("backlog-page-read-failed")
        return
      }
      const frames: ApiEventsBacklogFrame[] = []
      for (const event of page.data) {
        if (globalSummaryLiveSubscription === undefined) {
          frames.push(event)
          continue
        }
        const validated = apiEventsGlobalFrameValidate(cursorCodec, userId, event)
        if (!validated.success) {
          await connection.disconnect("backlog-frame-invalid")
          return
        }
        frames.push(validated.data)
      }
      const enqueued = await connection.enqueueBacklog(frames)
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
    const baselineGlobalSequence = apiEventsGlobalReplayBaselineResolve(
      cursorCodec,
      identity.userId,
      {
        after: context.req.query("after"),
        lastEventId: context.req.header("Last-Event-ID"),
      },
      options.globalSummaryLiveSubscription === undefined,
    )
    if (!baselineGlobalSequence.success) return apiEventsBacklogErrorResponse(context, baselineGlobalSequence)

    const output = new TransformStream<Uint8Array, Uint8Array>()
    const outputWriter = output.writable.getWriter()
    const connectionState: { current?: ApiEventsRoutesConnection } = {}
    const connection = apiEventsConnectionWriterCreate(
      context,
      options,
      cursorCodec,
      baselineGlobalSequence.data,
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
      backlog = await options.backlogRead(
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
      options.metricsCollector.increment("sse_replay_total")
      const upperBoundSet = connection.setReplayUpperBound(backlog.data.replayUpperBound)
      if (!upperBoundSet.success) {
        await connection.disconnect("backlog-upper-bound-failed")
        return apiEventsInternalError(context)
      }
    } else {
      options.metricsCollector.increment("sse_reset_total")
    }

    void apiEventsBacklogPump(
      connection,
      backlog.data.pages,
      cursorCodec,
      identity.userId,
      options.globalSummaryLiveSubscription,
    )

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
