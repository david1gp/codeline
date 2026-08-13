import type { Context } from "hono"
import { Hono } from "hono"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { sessionBranch } from "../actions/sessionBranch.js"
import { sessionBranchRequestSchema } from "../schema/sessionBranchRequestSchema.js"

type ApiContext = Context<AppEnvironment>

function badRequest(context: ApiContext) {
  const response = {
    error: { code: "bad_request", message: "The session branch request is invalid." },
  } satisfies ApiErrorResponse
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
    error: { code: "internal_server_error", message: "The session branch could not be created." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

export function apiSessionBranchRoutesAdd(api: Hono<AppEnvironment>): void {
  api.post("/sessions/:sessionId/branch", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("sessionBranchRequestParse", sessionBranchRequestSchema, body)
    if (!parsed.success) return badRequest(context)

    const result = await databaseTransactionRun(context.var.database, (transaction) =>
      sessionBranch(transaction, context.var.developmentUser.id, context.req.param("sessionId"), parsed.data),
    )
    if (!result.success) {
      if (result.errorMessage.includes("could not be found") || result.errorMessage.includes("message could not be found"))
        return notFound(context)
      if (result.errorMessage.includes("archived")) return conflict(context, result.errorMessage)
      return internalServerError(context)
    }

    return context.json({ created: result.data.created, session: result.data.session }, result.data.created ? 201 : 200)
  })
}
