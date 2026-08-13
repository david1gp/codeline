import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, desc, eq, lte } from "drizzle-orm"
import type { Context } from "hono"
import { Hono } from "hono"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { streamReplayServiceCreate } from "../actions/streamReplayServiceCreate.js"
import { streamEventTable } from "../db/streamEventTable.js"
import type { StreamApiErrorResponse } from "./streamApiErrorResponseSchema.js"
import { streamApiReplayQuerySchema } from "./streamApiReplayQuerySchema.js"
import type { StreamApiStatusResponse } from "./streamApiStatusResponseSchema.js"

type ApiContext = Context<AppEnvironment>

type ApiStreamRoutesOptions = {
  inactivityTimeoutMs?: number
  replayServiceCreate?: typeof streamReplayServiceCreate
}

const streamApiDefaultInactivityTimeoutMs = 120_000

function badRequest(context: ApiContext, message: string) {
  const response = { error: { code: "bad_request", message } } satisfies ApiErrorResponse
  return context.json(response, 400)
}

function notFound(context: ApiContext) {
  const response = {
    error: { code: "not_found", message: "The requested resource was not found." },
  } satisfies ApiErrorResponse
  return context.json(response, 404)
}

function conflict(context: ApiContext, message: string) {
  const response = { error: { code: "conflict", message } } satisfies ApiErrorResponse
  return context.json(response, 409)
}

function internalServerError(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The request could not be completed." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function streamStale(context: ApiContext) {
  const response = {
    error: { code: "stream_stale", message: "The stream is stale." },
  } satisfies StreamApiErrorResponse
  return context.json(response, 409)
}

function serviceErrorResponse(context: ApiContext, errorMessage: string) {
  if (errorMessage.includes("could not be found")) return notFound(context)
  if (errorMessage.includes("is archived")) return conflict(context, errorMessage)
  return internalServerError(context)
}

async function streamApiCursorSequenceLoad(
  database: DatabaseClient,
  sessionId: string,
  streamId: string,
  eventId: string | undefined,
): Promise<Result<number>> {
  const op = "streamApiCursorSequenceLoad"
  if (eventId === undefined || eventId === "") return createResult(0)
  if (eventId.length > 2048 || /[\r\n]/.test(eventId))
    return createResultError(op, "The stream event cursor is invalid.")

  try {
    const [event] = await database
      .select({ sequence: streamEventTable.sequence })
      .from(streamEventTable)
      .where(
        and(
          eq(streamEventTable.id, eventId),
          eq(streamEventTable.sessionId, sessionId),
          eq(streamEventTable.streamId, streamId),
        ),
      )
      .limit(1)
    if (event === undefined) return createResultError(op, "The stream event cursor is invalid.")
    return createResult(event.sequence)
  } catch (_error) {
    return createResultError(op, "The stream event cursor could not be loaded.")
  }
}

async function streamApiLatestEventLoad(
  database: DatabaseClient,
  sessionId: string,
  streamId: string,
  lastSequence: number,
): Promise<Result<{ id: string } | undefined>> {
  const op = "streamApiLatestEventLoad"

  try {
    const [event] = await database
      .select({ id: streamEventTable.id })
      .from(streamEventTable)
      .where(
        and(
          eq(streamEventTable.sessionId, sessionId),
          eq(streamEventTable.streamId, streamId),
          lte(streamEventTable.sequence, lastSequence),
        ),
      )
      .orderBy(desc(streamEventTable.sequence))
      .limit(1)
    return createResult(event === undefined ? undefined : { id: event.id })
  } catch (_error) {
    return createResultError(op, "The latest stream event could not be loaded.")
  }
}

function streamApiSseEncode(events: Array<typeof streamEventTable.$inferSelect>): string {
  return events
    .map((event) => {
      const id = event.id.replace(/[\r\n]/g, "")
      const eventType = event.eventType.replace(/[\r\n]/g, "")
      const data = JSON.stringify(event.payload) ?? "null"
      return `id: ${id}\nevent: ${eventType}\ndata: ${data}\n\n`
    })
    .join("")
}

export function apiStreamRoutesAdd(api: Hono<AppEnvironment>, options: ApiStreamRoutesOptions = {}): void {
  const inactivityTimeoutMs = options.inactivityTimeoutMs ?? streamApiDefaultInactivityTimeoutMs
  const replayServiceFactory = options.replayServiceCreate ?? streamReplayServiceCreate

  api.get("/sessions/:sessionId/streams/:streamId/status", async (context) => {
    const sessionId = context.req.param("sessionId")
    const streamId = context.req.param("streamId")
    const result = await replayServiceFactory({
      database: context.var.database,
      inactivityTimeoutMs,
      sessionId,
      streamId,
      userId: context.var.developmentUser.id,
    }).replay({ afterSequence: 0, limit: 1 })
    if (!result.success) return serviceErrorResponse(context, result.errorMessage)

    const latest = await streamApiLatestEventLoad(
      context.var.database,
      sessionId,
      streamId,
      result.data.checkpoint.lastSequence,
    )
    if (!latest.success) return internalServerError(context)

    const response = {
      lastEventId: latest.data?.id ?? null,
      lastSequence: result.data.checkpoint.lastSequence,
      stale: result.data.stale,
      streamId,
    } satisfies StreamApiStatusResponse
    return context.json(response)
  })

  api.get("/sessions/:sessionId/streams/:streamId/events", async (context) => {
    const parsed = apiRequestParse("streamApiReplayQueryParse", streamApiReplayQuerySchema, context.req.query())
    if (!parsed.success) return badRequest(context, "The stream replay query is invalid.")

    const sessionId = context.req.param("sessionId")
    const streamId = context.req.param("streamId")
    const cursor = await streamApiCursorSequenceLoad(
      context.var.database,
      sessionId,
      streamId,
      context.req.header("Last-Event-ID") ?? parsed.data.afterEventId,
    )
    if (!cursor.success) {
      return cursor.errorMessage.includes("is invalid")
        ? badRequest(context, "The stream event cursor is invalid.")
        : internalServerError(context)
    }

    const result = await replayServiceFactory({
      database: context.var.database,
      inactivityTimeoutMs,
      sessionId,
      streamId,
      userId: context.var.developmentUser.id,
    }).replay({ afterSequence: cursor.data, limit: parsed.data.limit })
    if (!result.success) return serviceErrorResponse(context, result.errorMessage)
    if (result.data.stale) return streamStale(context)

    return new Response(streamApiSseEncode(result.data.events), {
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      },
    })
  })
}
