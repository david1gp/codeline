import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { journalBacklogCursorSelect } from "../../journal/actions/journalBacklogCursorSelect.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import type { metricsCollectorCreate } from "../../metrics/metricsCollectorCreate.js"
import type { streamLiveSubscriptionCreate } from "../../stream/actions/streamLiveSubscriptionCreate.js"
import type { StreamSseConnectionWriter } from "../../stream/actions/streamSseConnectionWriter.js"
import type { StreamSseConnectionWriterFactory } from "../../stream/actions/streamSseConnectionWriterFactory.js"
import type { StreamSseConnectionWriterScheduler } from "../../stream/actions/streamSseConnectionWriterScheduler.js"
import type { StreamSseConnectionWriterSinkFactory } from "../../stream/actions/streamSseConnectionWriterSinkFactory.js"
import { streamSseConnectionWriterShutdownErrorIsAlreadyClosed } from "../../stream/actions/streamSseConnectionWriterShutdownErrorIsAlreadyClosed.js"
import { streamSseConnectionWriterSinkCreate } from "../../stream/actions/streamSseConnectionWriterSinkCreate.js"
import type { SessionDetailSseFrame } from "./sessionDetailSseFrameSchema.js"
import { sessionDetailSseFrameSchema } from "./sessionDetailSseFrameSchema.js"
import type { sessionDetailStreamBacklogRead } from "../actions/sessionDetailStreamBacklogRead.js"
import { sessionDetailStreamQuerySchema } from "./sessionDetailStreamQuerySchema.js"

type ApiSessionDetailEventsRoutesScheduler = StreamSseConnectionWriterScheduler
type ApiSessionDetailEventsConnection = StreamSseConnectionWriter
type ApiSessionDetailEventsLiveSubscription = Pick<
  ReturnType<typeof streamLiveSubscriptionCreate>,
  "selectedSessionDetailSubscribe"
>
type ApiSessionDetailEventsBacklogData = {
  mode: "replay" | "reset"
  pages: AsyncIterable<Result<readonly SessionDetailSseFrame[]>>
  replayUpperBound: number
  selectedCursor: string | undefined
}
type ApiSessionDetailEventsBacklogRead = (
  database: Parameters<typeof sessionDetailStreamBacklogRead>[0],
  input: Parameters<typeof sessionDetailStreamBacklogRead>[1],
  dependencies: Parameters<typeof sessionDetailStreamBacklogRead>[2],
) => Promise<Result<ApiSessionDetailEventsBacklogData>>

type ApiSessionDetailEventsRoutesOptions = {
  backlogRead: ApiSessionDetailEventsBacklogRead
  connectionWriterCreate: StreamSseConnectionWriterFactory
  cursorCodec: JournalCursorCodec
  liveSubscription: ApiSessionDetailEventsLiveSubscription
  metricsCollector: ReturnType<typeof metricsCollectorCreate>
  now: () => number
  scheduler: ApiSessionDetailEventsRoutesScheduler
  sinkCreate?: StreamSseConnectionWriterSinkFactory
}

type ApiSessionDetailEventsContext = Context<AppEnvironment>

function apiSessionDetailEventsError(
  context: ApiSessionDetailEventsContext,
  code: string,
  message: string,
  status: 400 | 401 | 404 | 503,
) {
  const response = { error: { code, message } } satisfies ApiErrorResponse
  if (status === 401) context.header("Cache-Control", "no-store")
  return context.json(response, status)
}

function apiSessionDetailEventsUnauthorized(context: ApiSessionDetailEventsContext) {
  return apiSessionDetailEventsError(context, "unauthorized", "Authentication is required.", 401)
}

function apiSessionDetailEventsBadRequest(context: ApiSessionDetailEventsContext) {
  return apiSessionDetailEventsError(context, "bad_request", "The selected-session stream cursor is invalid.", 400)
}

function apiSessionDetailEventsNotFound(context: ApiSessionDetailEventsContext) {
  return apiSessionDetailEventsError(context, "not_found", "The requested resource was not found.", 404)
}

function apiSessionDetailEventsUnavailable(context: ApiSessionDetailEventsContext) {
  return apiSessionDetailEventsError(context, "service_unavailable", "The selected-session stream is unavailable.", 503)
}

function apiSessionDetailEventsInternalError(context: ApiSessionDetailEventsContext) {
  return apiSessionDetailEventsError(
    context,
    "internal_server_error",
    "The selected-session stream could not be opened.",
    503,
  )
}

function apiSessionDetailEventsBacklogErrorResponse(context: ApiSessionDetailEventsContext, result: { code?: string }) {
  if (result.code === "cursor_invalid" || result.code === "cursor_owner_mismatch")
    return apiSessionDetailEventsBadRequest(context)
  if (result.code === "authenticated_user_invalid") return apiSessionDetailEventsUnauthorized(context)
  if (result.code === "session_not_found") return apiSessionDetailEventsNotFound(context)
  if (result.code === "session_unavailable") return apiSessionDetailEventsUnavailable(context)
  return apiSessionDetailEventsInternalError(context)
}

async function apiSessionDetailEventsConnectionShutdown(operation: Promise<void>): Promise<void> {
  try {
    await operation
  } catch (error: unknown) {
    if (streamSseConnectionWriterShutdownErrorIsAlreadyClosed(error)) return
    throw error
  }
}

function apiSessionDetailEventsBaselineResolve(
  cursorCodec: Pick<JournalCursorCodec, "validateSessionPosition">,
  userId: string,
  sessionId: string,
  input: { after?: unknown; lastEventId?: unknown },
): Result<number> {
  const op = "apiSessionDetailEventsBaselineResolve"
  const selected = journalBacklogCursorSelect(input)
  if (!selected.success) return selected
  if (selected.data.cursor === undefined) return createResult(0)
  if (cursorCodec.validateSessionPosition === undefined)
    return createResultErrorCode(op, "The selected-session stream cursor is invalid.", "cursor_invalid")
  const validated = cursorCodec.validateSessionPosition(selected.data.cursor, userId, sessionId)
  if (!validated.success) {
    const code = validated.code === "cursor_owner_mismatch" ? "cursor_owner_mismatch" : "cursor_invalid"
    return createResultErrorCode(op, validated.errorMessage, code)
  }
  if (!Number.isSafeInteger(validated.data.changePosition) || validated.data.changePosition < 0)
    return createResultErrorCode(op, "The selected-session stream position is invalid.", "cursor_invalid")
  return createResult(validated.data.changePosition)
}

function apiSessionDetailEventsFrameValidate(sessionId: string, event: unknown): Result<SessionDetailSseFrame> {
  const op = "apiSessionDetailEventsFrameValidate"
  const parsed = v.safeParse(sessionDetailSseFrameSchema, event)
  if (!parsed.success) return createResultError(op, "The selected-session SSE event does not match its contract.")
  if (parsed.output.data.sessionId !== sessionId)
    return createResultError(op, "The selected-session SSE event does not match the requested session.")
  return createResult(parsed.output)
}

function apiSessionDetailEventsSubscriptionCreate(
  liveSubscription: ApiSessionDetailEventsLiveSubscription,
  sessionId: string,
  onConversionError: () => void,
) {
  return {
    subscribe: (userId: string, subscriber: (event: SessionDetailSseFrame) => void): (() => void) =>
      liveSubscription.selectedSessionDetailSubscribe(userId, sessionId, (event, publishedUserId) => {
        if (publishedUserId !== userId) {
          onConversionError()
          return
        }
        const validated = apiSessionDetailEventsFrameValidate(sessionId, event)
        if (!validated.success) {
          onConversionError()
          return
        }
        subscriber(validated.data)
      }),
  }
}

function apiSessionDetailEventsConnectionWriterCreate(
  context: ApiSessionDetailEventsContext,
  options: ApiSessionDetailEventsRoutesOptions,
  sessionId: string,
  baselineChangePosition: number,
  connection: { current?: ApiSessionDetailEventsConnection },
  outputWriter: WritableStreamDefaultWriter<Uint8Array>,
): ApiSessionDetailEventsConnection {
  const subscription = apiSessionDetailEventsSubscriptionCreate(options.liveSubscription, sessionId, () => {
    const current = connection.current
    if (current !== undefined)
      void apiSessionDetailEventsConnectionShutdown(current.disconnect("connection-frame-invalid"))
  })
  return options.connectionWriterCreate({
    baselineSequence: baselineChangePosition,
    now: options.now,
    scheduler: options.scheduler,
    sequenceKind: "session-detail",
    subscription,
    userId: context.var.requestIdentity.userId,
    writer: (options.sinkCreate ?? streamSseConnectionWriterSinkCreate)(outputWriter),
    metricsCollector: options.metricsCollector,
  })
}

async function apiSessionDetailEventsBacklogPump(
  connection: ApiSessionDetailEventsConnection,
  pages: ApiSessionDetailEventsBacklogData["pages"],
  sessionId: string,
): Promise<void> {
  try {
    for await (const page of pages) {
      if (!page.success) {
        await apiSessionDetailEventsConnectionShutdown(connection.disconnect("backlog-page-read-failed"))
        return
      }
      const frames: SessionDetailSseFrame[] = []
      for (const event of page.data) {
        const validated = apiSessionDetailEventsFrameValidate(sessionId, event)
        if (!validated.success) {
          await apiSessionDetailEventsConnectionShutdown(connection.disconnect("backlog-frame-invalid"))
          return
        }
        frames.push(validated.data)
      }
      const enqueued = await connection.enqueueBacklog(frames)
      if (!enqueued.success) {
        if (!connection.isDisconnected())
          await apiSessionDetailEventsConnectionShutdown(connection.disconnect("backlog-queue-failed"))
        return
      }
    }
    const completed = connection.completeBacklog()
    if (!completed.success && !connection.isDisconnected())
      await apiSessionDetailEventsConnectionShutdown(connection.disconnect("backlog-handoff-failed"))
  } catch (_error) {
    if (!connection.isDisconnected())
      await apiSessionDetailEventsConnectionShutdown(connection.disconnect("backlog-read-failed"))
  }
}

export function apiSessionDetailEventsRoutesAdd(
  api: Hono<AppEnvironment>,
  options: ApiSessionDetailEventsRoutesOptions,
): void {
  if (options.backlogRead === undefined) throw new Error("The selected-session stream backlog reader is required.")
  if (options.cursorCodec === undefined) throw new Error("The selected-session stream cursor codec is required.")
  if (options.liveSubscription === undefined)
    throw new Error("The selected-session stream live subscription is required.")

  api.get("/sessions/:sessionId/events", async (context) => {
    const identity = context.var.requestIdentity
    if (identity === undefined || typeof identity.userId !== "string" || identity.userId.length === 0)
      return apiSessionDetailEventsUnauthorized(context)
    const organizationId = identity.organizationId
    if (organizationId === undefined) return apiSessionDetailEventsNotFound(context)

    const sessionId = context.req.param("sessionId")
    const parsedQuery = apiRequestParse(
      "sessionDetailStreamQueryParse",
      sessionDetailStreamQuerySchema,
      context.req.query(),
    )
    if (!parsedQuery.success) return apiSessionDetailEventsBadRequest(context)
    const baseline = apiSessionDetailEventsBaselineResolve(options.cursorCodec, identity.userId, sessionId, {
      after: parsedQuery.data.after,
      lastEventId: context.req.header("Last-Event-ID"),
    })
    if (!baseline.success) return apiSessionDetailEventsBacklogErrorResponse(context, baseline)

    const output = new TransformStream<Uint8Array, Uint8Array>()
    const outputWriter = output.writable.getWriter()
    const connectionState: { current?: ApiSessionDetailEventsConnection } = {}
    const connection = apiSessionDetailEventsConnectionWriterCreate(
      context,
      options,
      sessionId,
      baseline.data,
      connectionState,
      outputWriter,
    )
    connectionState.current = connection
    const requestSignal = context.req.raw.signal
    const onRequestAbort = () => {
      void apiSessionDetailEventsConnectionShutdown(connection.disconnect("request-aborted"))
    }
    requestSignal.addEventListener("abort", onRequestAbort, { once: true })
    void outputWriter.closed.then(
      () => {
        requestSignal.removeEventListener("abort", onRequestAbort)
        if (!connection.isDisconnected()) void apiSessionDetailEventsConnectionShutdown(connection.close())
      },
      () => {
        requestSignal.removeEventListener("abort", onRequestAbort)
        if (!connection.isDisconnected())
          void apiSessionDetailEventsConnectionShutdown(connection.disconnect("output-closed"))
      },
    )

    const connected = connection.connect()
    if (!connected.success) {
      requestSignal.removeEventListener("abort", onRequestAbort)
      await apiSessionDetailEventsConnectionShutdown(connection.disconnect("connection-subscription-failed"))
      return apiSessionDetailEventsInternalError(context)
    }
    if (requestSignal.aborted) {
      await apiSessionDetailEventsConnectionShutdown(connection.disconnect("request-aborted"))
      return apiSessionDetailEventsInternalError(context)
    }

    let backlog: Awaited<ReturnType<ApiSessionDetailEventsBacklogRead>>
    try {
      backlog = await options.backlogRead(
        context.var.database,
        {
          after: parsedQuery.data.after,
          lastEventId: context.req.header("Last-Event-ID"),
          organizationId,
          sessionId,
          userId: identity.userId,
        },
        { cursorCodec: options.cursorCodec },
      )
    } catch (_error) {
      await apiSessionDetailEventsConnectionShutdown(connection.disconnect("backlog-read-failed"))
      return apiSessionDetailEventsInternalError(context)
    }
    if (!backlog.success) {
      await apiSessionDetailEventsConnectionShutdown(connection.disconnect("backlog-read-rejected"))
      return apiSessionDetailEventsBacklogErrorResponse(context, backlog)
    }

    if (backlog.data.mode === "replay") {
      options.metricsCollector.increment("sse_replay_total")
      const upperBoundSet = connection.setReplayUpperBound(backlog.data.replayUpperBound)
      if (!upperBoundSet.success) {
        await apiSessionDetailEventsConnectionShutdown(connection.disconnect("backlog-upper-bound-failed"))
        return apiSessionDetailEventsInternalError(context)
      }
    } else {
      options.metricsCollector.increment("sse_reset_total")
    }
    void apiSessionDetailEventsBacklogPump(connection, backlog.data.pages, sessionId)

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
