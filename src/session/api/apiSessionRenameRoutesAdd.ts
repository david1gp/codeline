import type { Context } from "hono"
import { Hono } from "hono"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { sessionRename } from "../actions/sessionRename.js"
import { sessionRenameRequestSchema } from "../schema/sessionRenameRequestSchema.js"

type ApiContext = Context<AppEnvironment>

function badRequest(context: ApiContext) {
  const response = {
    error: { code: "bad_request", message: "The session rename request is invalid." },
  } satisfies ApiErrorResponse
  return context.json(response, 400)
}

function notFound(context: ApiContext) {
  const response = {
    error: { code: "not_found", message: "The requested resource was not found." },
  } satisfies ApiErrorResponse
  return context.json(response, 404)
}

function conflict(context: ApiContext) {
  const response = {
    error: { code: "conflict", message: "The session is archived." },
  } satisfies ApiErrorResponse
  return context.json(response, 409)
}

function internalServerError(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The session could not be renamed." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

export function apiSessionRenameRoutesAdd(api: Hono<AppEnvironment>): void {
  api.patch("/sessions/:sessionId", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("sessionRenameRequestParse", sessionRenameRequestSchema, body)
    if (!parsed.success) return badRequest(context)

    const result = await databaseTransactionRun(context.var.database, (transaction) =>
      sessionRename(transaction, context.var.requestIdentity.userId, context.req.param("sessionId"), parsed.data.title),
    )
    if (!result.success) {
      if (result.errorMessage.includes("archived")) return conflict(context)
      if (result.errorMessage.includes("could not be found")) return notFound(context)
      return internalServerError(context)
    }
    return context.json({ session: result.data })
  })
}
