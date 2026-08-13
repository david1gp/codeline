import { Hono } from "hono"
import type { Context } from "hono"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { messageAppend } from "../actions/messageAppend.js"
import { messageListFinalized } from "../actions/messageListFinalized.js"
import { messageAppendRequestSchema } from "../schema/messageAppendRequestSchema.js"
import { messageQuerySchema } from "../schema/messageQuerySchema.js"

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

export function apiMessageRoutesAdd(api: Hono<AppEnvironment>): void {
  api.post("/sessions/:sessionId/messages", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("messageAppendRequestParse", messageAppendRequestSchema, body)
    if (!parsed.success) return badRequest(context, "The message request is invalid.")

    const result = await databaseTransactionRun(context.var.database, (transaction) =>
      messageAppend(transaction, context.var.developmentUser.id, context.req.param("sessionId"), parsed.data),
    )
    if (!result.success) {
      if (result.errorMessage.includes("could not be found")) return notFound(context)
      if (result.errorMessage.includes("already used") || result.errorMessage.includes("archived"))
        return conflict(context, result.errorMessage)
      return internalServerError(context)
    }
    return context.json({ created: result.data.created, message: result.data.message }, result.data.created ? 201 : 200)
  })

  api.get("/sessions/:sessionId/messages", async (context) => {
    const parsed = apiRequestParse("messageQueryParse", messageQuerySchema, context.req.query())
    if (!parsed.success) return badRequest(context, "The message query is invalid.")

    const result = await messageListFinalized(
      context.var.database,
      context.var.developmentUser.id,
      context.req.param("sessionId"),
      parsed.data,
    )
    if (!result.success) {
      if (result.errorMessage.includes("cursor")) return badRequest(context, "The message list cursor is invalid.")
      return result.errorMessage.includes("could not be found") ? notFound(context) : internalServerError(context)
    }
    return context.json(result.data)
  })
}
