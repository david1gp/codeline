import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiIdempotencyRequestHashCreate } from "../../api/idempotency/apiIdempotencyRequestHashCreate.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { sessionBranch } from "../actions/sessionBranch.js"
import { sessionJournalRecipientResolverCreate } from "../db/sessionJournalRecipientResolverCreate.js"
import { sessionBranchRequestSchema } from "../schema/sessionBranchRequestSchema.js"
import { sessionCreateMutationResponseSchema } from "./sessionCreateMutationResponseSchema.js"

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

export function apiSessionBranchRoutesAdd(
  api: Hono<AppEnvironment>,
  options: {
    database: DatabaseClient
    journalPostCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
  },
): void {
  if (options.database === undefined) throw new Error("The authenticated session database is required.")
  if (options.journalPostCommitPublish === undefined)
    throw new Error("The authenticated session journal publisher is required.")

  api.post("/sessions/:sessionId/branch", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("sessionBranchRequestParse", sessionBranchRequestSchema, body)
    if (!parsed.success) return badRequest(context)

    const requestHash = apiIdempotencyRequestHashCreate({
      messageId: parsed.data.messageId,
      sourceSessionId: context.req.param("sessionId"),
    })
    const result = await sessionBranch(
      options.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
      {
        ...parsed.data,
        journal: {
          postCommitPublish: options.journalPostCommitPublish,
          resolveRecipients: sessionJournalRecipientResolverCreate({
            organizationId,
            pendingSessionAuthorization: {
              sourceSessionId: context.req.param("sessionId"),
              userId: context.var.requestIdentity.userId,
            },
          }),
        },
        requestHash,
      },
    )
    if (!result.success) {
      if (result.code === "idempotency_conflict") return conflict(context, result.errorMessage)
      if (
        result.errorMessage.includes("could not be found") ||
        result.errorMessage.includes("message could not be found") ||
        result.errorMessage.includes("could not be authorized")
      )
        return notFound(context)
      if (result.errorMessage.includes("archived")) return conflict(context, result.errorMessage)
      return internalServerError(context)
    }

    const response = result.data.responseBody
    if (response === undefined || !v.safeParse(sessionCreateMutationResponseSchema, response).success)
      return internalServerError(context)
    context.header("Idempotency-Replayed", result.data.replayed ? "true" : "false")
    return context.json(response, result.data.created && !result.data.replayed ? 201 : 200)
  })
}
