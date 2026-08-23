import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { apiIfMatchEtagParse } from "../../api/conditional/apiIfMatchEtagParse.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiIdempotencyRequestHashCreate } from "../../api/idempotency/apiIdempotencyRequestHashCreate.js"
import { apiRepresentationHeadersCreate } from "../../api/representation/apiRepresentationHeadersCreate.js"
import { apiIdempotencyKeySchema } from "../../api/schema/apiIdempotencyKeySchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { sessionRename } from "../actions/sessionRename.js"
import { sessionJournalRecipientResolverCreate } from "../db/sessionJournalRecipientResolverCreate.js"
import { sessionRenameRequestSchema } from "../schema/sessionRenameRequestSchema.js"
import { sessionPreconditionFailedResponseCreate } from "./sessionPreconditionFailedResponseCreate.js"
import { sessionMutationEtagResolve } from "./sessionMutationEtagResolve.js"

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

function idempotencyConflict(context: ApiContext) {
  const response = {
    error: { code: "conflict", message: "The idempotency key was already used for a different request." },
  } satisfies ApiErrorResponse
  return context.json(response, 409)
}

function internalServerError(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The session could not be renamed." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function preconditionFailed(context: ApiContext, errorData: string | null | undefined) {
  const response = sessionPreconditionFailedResponseCreate({
    errorData,
    message: "The session changed before it could be renamed.",
    op: "sessionRename",
  })
  return context.json(response, 412)
}

function headersApply(context: ApiContext, headers: Headers): void {
  for (const [name, value] of headers.entries()) context.header(name, value)
}

export function apiSessionRenameRoutesAdd(
  api: Hono<AppEnvironment>,
  options: {
    database: DatabaseClient
    journalCursorCodec: JournalCursorCodec
    journalPostCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
  },
): void {
  if (options.database === undefined) throw new Error("The authenticated session database is required.")
  if (options.journalPostCommitPublish === undefined)
    throw new Error("The authenticated session journal publisher is required.")

  api.patch("/sessions/:sessionId", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("sessionRenameRequestParse", sessionRenameRequestSchema, body)
    if (!parsed.success) return badRequest(context)

    const expectedEtag = apiIfMatchEtagParse(context.req.header("If-Match"))
    if (!expectedEtag.success) return badRequest(context)
    const resolvedEtag = await sessionMutationEtagResolve(
      options.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
      expectedEtag.data,
      options.journalCursorCodec,
    )
    if (!resolvedEtag.success) {
      if (resolvedEtag.errorMessage.includes("could not be found")) return notFound(context)
      return internalServerError(context)
    }

    const headerIdempotencyKey = context.req.header("Idempotency-Key")
    if (
      headerIdempotencyKey !== undefined &&
      parsed.data.idempotencyKey !== undefined &&
      headerIdempotencyKey.trim() !== parsed.data.idempotencyKey
    )
      return badRequest(context)
    const rawIdempotencyKey = headerIdempotencyKey ?? parsed.data.idempotencyKey
    const parsedIdempotencyKey = v.safeParse(apiIdempotencyKeySchema, rawIdempotencyKey)
    if (!parsedIdempotencyKey.success && rawIdempotencyKey !== undefined) return badRequest(context)
    const idempotencyKey = parsedIdempotencyKey.success ? parsedIdempotencyKey.output : undefined
    const requestHash =
      idempotencyKey === undefined
        ? undefined
        : apiIdempotencyRequestHashCreate({ ifMatch: expectedEtag.data, title: parsed.data.title })

    const result = await sessionRename(
      options.database,
      context.var.requestIdentity.userId,
      context.req.param("sessionId"),
      parsed.data.title,
      {
        expectedEtag: resolvedEtag.data,
        idempotencyKey,
        journal: {
          postCommitPublish: options.journalPostCommitPublish,
          resolveRecipients: sessionJournalRecipientResolverCreate({ organizationId }),
        },
        organizationId,
        requireIfMatch: true,
        requestHash,
      },
    )
    if (!result.success) {
      if (result.code === "precondition_failed") return preconditionFailed(context, result.errorData)
      if (result.code === "idempotency_conflict") return idempotencyConflict(context)
      if (result.errorMessage.includes("archived")) return conflict(context)
      if (result.errorMessage.includes("could not be found") || result.errorMessage.includes("could not be authorized"))
        return notFound(context)
      return internalServerError(context)
    }
    if (result.data.responseBody === undefined) return internalServerError(context)
    headersApply(context, apiRepresentationHeadersCreate(result.data.responseBody.etag))
    context.header("Idempotency-Replayed", result.data.replayed ? "true" : "false")
    return context.json(result.data.responseBody)
  })
}
