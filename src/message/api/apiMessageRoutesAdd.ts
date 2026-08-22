import type { Context } from "hono"
import { Hono } from "hono"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { apiIfNoneMatchMatches } from "../../api/conditional/apiIfNoneMatchMatches.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiRepresentationHeadersCreate } from "../../api/representation/apiRepresentationHeadersCreate.js"
import { apiCompleteSnapshotResponseCreate } from "../../api/response/apiCompleteSnapshotResponseCreate.js"
import { apiIdempotencyKeySchema } from "../../api/schema/apiIdempotencyKeySchema.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { sessionJournalRecipientResolverCreate } from "../../session/db/sessionJournalRecipientResolverCreate.js"
import { messageAppendAuthorized } from "../actions/messageAppendAuthorized.js"
import { messageListFinalized } from "../actions/messageListFinalized.js"
import { messageAppendRequestSchema } from "../schema/messageAppendRequestSchema.js"
import { messageQuerySchema } from "../schema/messageQuerySchema.js"
import { messagePageResponseCreate } from "./messagePageResponseCreate.js"

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

function unsupportedRunStartPayload(body: unknown): boolean {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return false
  if (
    ["codelineExecution", "execution", "forwardedProps", "messages", "run", "runId"].some((key) =>
      Object.hasOwn(body, key),
    )
  )
    return true
  const candidate = body as { type?: unknown }
  return candidate.type === "run" || candidate.type === "run-start"
}

function messageRequestBodyCreate(body: unknown, headerKey: string | undefined): unknown {
  if (headerKey === undefined || body === null || typeof body !== "object" || Array.isArray(body)) return body
  if (Object.hasOwn(body, "clientRequestId")) return body
  return { ...body, clientRequestId: headerKey }
}

async function completeJsonResponse(context: ApiContext, body: unknown, headers: Headers): Promise<Response> {
  const complete = await apiCompleteSnapshotResponseCreate(body, {
    acceptEncoding: context.req.header("Accept-Encoding"),
    dependencies: { compressionStreamCreate: (encoding) => new CompressionStream(encoding) },
    headers,
  })
  if (!complete.success) {
    if (complete.code === "not_acceptable") return new Response(null, { headers, status: 406 })
    return internalServerError(context)
  }
  return complete.data
}

export function apiMessageRoutesAdd(
  api: Hono<AppEnvironment>,
  options: {
    journalCursorCodec: JournalCursorCodec
    journalPostCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
  },
): void {
  if (options.journalCursorCodec === undefined) throw new Error("The authenticated message cursor codec is required.")
  if (options.journalPostCommitPublish === undefined)
    throw new Error("The authenticated message journal publisher is required.")

  api.post("/sessions/:sessionId/messages", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)

    const headerValue = context.req.header("Idempotency-Key")
    const parsedHeader =
      headerValue === undefined
        ? undefined
        : apiRequestParse("messageIdempotencyKeyParse", apiIdempotencyKeySchema, headerValue)
    if (parsedHeader !== undefined && !parsedHeader.success)
      return badRequest(context, "The message idempotency key is invalid.")

    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse(
      "messageAppendRequestParse",
      messageAppendRequestSchema,
      messageRequestBodyCreate(body, parsedHeader?.success ? parsedHeader.data : undefined),
    )
    if (!parsed.success) {
      if (unsupportedRunStartPayload(body))
        return badRequest(context, "Run-start payloads are not supported by the message endpoint.")
      return badRequest(context, "The message request is invalid.")
    }
    if (parsedHeader?.success && parsed.data.clientRequestId !== parsedHeader.data)
      return badRequest(context, "The message idempotency key does not match the request payload.")

    const result = await messageAppendAuthorized(
      context.var.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
      parsed.data,
      {
        postCommitPublish: options.journalPostCommitPublish,
        resolveRecipients: sessionJournalRecipientResolverCreate({ organizationId }),
      },
    )
    if (!result.success) {
      if (result.code === "idempotency_conflict") return conflict(context, result.errorMessage)
      if (result.errorMessage.includes("could not be found") || result.errorMessage.includes("could not be authorized"))
        return notFound(context)
      if (result.errorMessage.includes("already used") || result.errorMessage.includes("archived"))
        return conflict(context, result.errorMessage)
      return internalServerError(context)
    }
    context.header("Idempotency-Replayed", result.data.replayed ? "true" : "false")
    return context.json(result.data.responseBody, result.data.created && !result.data.replayed ? 201 : 200)
  })

  api.get("/sessions/:sessionId/messages", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const parsed = apiRequestParse("messageQueryParse", messageQuerySchema, context.req.query())
    if (!parsed.success) return badRequest(context, "The message query is invalid.")

    const result = await messageListFinalized(
      context.var.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
      parsed.data,
      { cursorCodec: options.journalCursorCodec },
    )
    if (!result.success) {
      if (result.errorMessage.includes("cursor")) return badRequest(context, "The message list cursor is invalid.")
      return result.errorMessage.includes("could not be found") ? notFound(context) : internalServerError(context)
    }

    const response = messagePageResponseCreate({
      ...result.data,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
      sessionId: context.req.param("sessionId"),
    })
    if (!response.success) return internalServerError(context)
    const headers = apiRepresentationHeadersCreate(response.data.etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), response.data.etag))
      return new Response(null, { headers, status: 304 })
    return completeJsonResponse(context, response.data, headers)
  })
}
