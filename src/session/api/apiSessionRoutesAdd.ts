import { Hono } from "hono"
import type { Context } from "hono"
import { toServerSentEventsStream } from "@tanstack/ai"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { sessionChatAdapterCreate } from "../actions/sessionChatAdapterCreate.js"
import { sessionChatPrepare } from "../actions/sessionChatPrepare.js"
import { sessionChatStreamCreate } from "../actions/sessionChatStreamCreate.js"
import { sessionArchive } from "../actions/sessionArchive.js"
import { sessionCreate } from "../actions/sessionCreate.js"
import { sessionDelete } from "../actions/sessionDelete.js"
import { sessionList } from "../actions/sessionList.js"
import { sessionLoad } from "../actions/sessionLoad.js"
import { sessionRename } from "../actions/sessionRename.js"
import { sessionCreateRequestSchema } from "../schema/sessionCreateRequestSchema.js"
import { sessionChatRequestSchema } from "../schema/sessionChatRequestSchema.js"
import { sessionQuerySchema } from "../schema/sessionQuerySchema.js"
import { sessionRenameRequestSchema } from "../schema/sessionRenameRequestSchema.js"

type ApiContext = Context<AppEnvironment>

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

type ApiSessionRoutesOptions = {
  sessionChatAdapter?: typeof sessionChatAdapterCreate
}

export function apiSessionRoutesAdd(api: Hono<AppEnvironment>, options: ApiSessionRoutesOptions = {}): void {
  api.get("/sessions", async (context) => {
    const parsed = apiRequestParse("sessionQueryParse", sessionQuerySchema, context.req.query())
    if (!parsed.success) return badRequest(context, "The session query is invalid.")

    const result = await sessionList(context.var.database, context.var.developmentUser.id, {
      cursor: parsed.data.cursor,
      includeArchived: parsed.data.includeArchived === "1",
      limit: parsed.data.limit,
      search: parsed.data.search === "" ? undefined : parsed.data.search,
    })
    if (!result.success) {
      if (result.errorMessage.includes("cursor")) return badRequest(context, "The session list cursor is invalid.")
      return internalServerError(context)
    }

    return context.json({
      nextCursor: result.data.nextCursor,
      sessions: result.data.rows.map(({ agent, server, session }) => ({ agent, server, session })),
    })
  })

  api.post("/sessions", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("sessionCreateRequestParse", sessionCreateRequestSchema, body)
    if (!parsed.success) return badRequest(context, "The session request is invalid.")

    const result = await databaseTransactionRun(context.var.database, (transaction) =>
      sessionCreate(transaction, context.var.developmentUser.id, parsed.data),
    )
    if (!result.success) {
      if (result.errorMessage.includes("could not be found")) return notFound(context)
      return internalServerError(context)
    }

    return context.json({ created: result.data.created, session: result.data.session }, result.data.created ? 201 : 200)
  })

  api.post("/sessions/:sessionId/chat", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("sessionChatRequestParse", sessionChatRequestSchema, body)
    if (!parsed.success) return badRequest(context, "The chat request is invalid.")

    const sessionId = context.req.param("sessionId")
    if (parsed.data.threadId !== sessionId) return badRequest(context, "The chat thread must match the session.")

    const finalMessage = parsed.data.messages.at(-1)
    if (finalMessage?.role !== "user" || typeof finalMessage.content !== "string")
      return badRequest(context, "The chat request must end with one plain-text user prompt.")
    const prompt = finalMessage.content.trim()
    if (prompt.length === 0) return badRequest(context, "The chat request must end with one plain-text user prompt.")

    const prepared = await databaseTransactionRun(context.var.database, (transaction) =>
      sessionChatPrepare(transaction, context.var.developmentUser.id, sessionId, {
        clientRequestId: parsed.data.runId,
        content: prompt,
      }),
    )
    if (!prepared.success) {
      if (prepared.errorMessage.includes("could not be found")) return notFound(context)
      if (prepared.errorMessage.includes("already used") || prepared.errorMessage.includes("archived"))
        return conflict(context, prepared.errorMessage)
      return internalServerError(context)
    }

    const abortController = new AbortController()
    const requestSignal = context.req.raw.signal
    const onRequestAbort = () => abortController.abort(requestSignal.reason)
    if (requestSignal.aborted) abortController.abort(requestSignal.reason)
    else requestSignal.addEventListener("abort", onRequestAbort, { once: true })

    const stream = sessionChatStreamCreate({
      adapter: options.sessionChatAdapter ?? sessionChatAdapterCreate,
      cleanup: () => requestSignal.removeEventListener("abort", onRequestAbort),
      database: context.var.database,
      history: prepared.data.history,
      prompt,
      requestId: parsed.data.runId,
      runId: parsed.data.runId,
      sessionId,
      signal: abortController.signal,
      userId: context.var.developmentUser.id,
    })
    const sse = toServerSentEventsStream(stream, abortController)

    return new Response(sse, {
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      },
    })
  })

  api.get("/sessions/:sessionId", async (context) => {
    const result = await sessionLoad(
      context.var.database,
      context.var.developmentUser.id,
      context.req.param("sessionId"),
    )
    if (!result.success)
      return result.errorMessage.includes("could not be found") ? notFound(context) : internalServerError(context)
    return context.json(result.data)
  })

  api.patch("/sessions/:sessionId", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("sessionRenameRequestParse", sessionRenameRequestSchema, body)
    if (!parsed.success) return badRequest(context, "The session rename request is invalid.")

    const result = await databaseTransactionRun(context.var.database, (transaction) =>
      sessionRename(transaction, context.var.developmentUser.id, context.req.param("sessionId"), parsed.data.title),
    )
    if (!result.success)
      return result.errorMessage.includes("could not be found") ? notFound(context) : internalServerError(context)
    return context.json({ session: result.data })
  })

  api.post("/sessions/:sessionId/archive", async (context) => {
    const result = await databaseTransactionRun(context.var.database, (transaction) =>
      sessionArchive(transaction, context.var.developmentUser.id, context.req.param("sessionId")),
    )
    if (!result.success)
      return result.errorMessage.includes("could not be found") ? notFound(context) : internalServerError(context)
    return context.json({ session: result.data })
  })

  api.delete("/sessions/:sessionId", async (context) => {
    const result = await databaseTransactionRun(context.var.database, (transaction) =>
      sessionDelete(transaction, context.var.developmentUser.id, context.req.param("sessionId")),
    )
    if (!result.success)
      return result.errorMessage.includes("could not be found") ? notFound(context) : internalServerError(context)
    return context.json({ session: result.data })
  })
}
