import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { apiIfMatchEtagParse } from "../../api/conditional/apiIfMatchEtagParse.js"
import { apiIfNoneMatchMatches } from "../../api/conditional/apiIfNoneMatchMatches.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiIdempotencyRequestHashCreate } from "../../api/idempotency/apiIdempotencyRequestHashCreate.js"
import { apiRepresentationHeadersCreate } from "../../api/representation/apiRepresentationHeadersCreate.js"
import { apiIdempotencyKeySchema } from "../../api/schema/apiIdempotencyKeySchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { noteCreate } from "../actions/noteCreate.js"
import { noteDelete } from "../actions/noteDelete.js"
import { noteDetail } from "../actions/noteDetail.js"
import { noteList } from "../actions/noteList.js"
import { noteReorder } from "../actions/noteReorder.js"
import { noteUpdate } from "../actions/noteUpdate.js"
import { noteJournalRecipientResolverCreate } from "../db/noteJournalRecipientResolverCreate.js"
import { noteCreateRequestSchema } from "../schema/noteCreateRequestSchema.js"
import { noteReorderRequestSchema } from "../schema/noteReorderRequestSchema.js"
import { noteUpdateRequestSchema } from "../schema/noteUpdateRequestSchema.js"
import { noteDetailResponseSchema } from "./noteDetailResponseSchema.js"
import { noteListResponseSchema } from "./noteListResponseSchema.js"
import { noteListRevisionDerive } from "./noteListRevisionDerive.js"
import { noteMutationResponseSchema } from "./noteMutationResponseSchema.js"
import { notePreconditionFailedResponseCreate } from "./notePreconditionFailedResponseCreate.js"
import { noteRepresentationEtagCreate } from "./noteRepresentationEtagCreate.js"

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

function conflict(context: ApiContext, message = "The note mutation conflicts with the current resource.") {
  const response = { error: { code: "conflict", message } } satisfies ApiErrorResponse
  return context.json(response, 409)
}

function internalServerError(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The request could not be completed." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function readError(context: ApiContext, result: { errorMessage: string }) {
  if (result.errorMessage.includes("could not be authorized")) return notFound(context)
  return internalServerError(context)
}

function idempotencyKeyParse(context: ApiContext, bodyKey?: string): string | undefined | Response {
  const headerKey = context.req.header("Idempotency-Key")
  if (headerKey !== undefined && bodyKey !== undefined && headerKey.trim() !== bodyKey)
    return badRequest(context, "The idempotency key is invalid.")
  const rawKey = headerKey ?? bodyKey
  const parsed = v.safeParse(apiIdempotencyKeySchema, rawKey)
  if (!parsed.success && rawKey !== undefined) return badRequest(context, "The idempotency key is invalid.")
  return parsed.success ? parsed.output : undefined
}

function headersApply(context: ApiContext, headers: Headers): void {
  for (const [name, value] of headers.entries()) context.header(name, value)
}

function preconditionFailed(context: ApiContext, errorData: string | null | undefined, message: string, op: string) {
  return context.json(notePreconditionFailedResponseCreate({ errorData, message, op }), 412)
}

function mutationError(
  context: ApiContext,
  result: { code?: string; errorData?: string | null; errorMessage: string },
  message: string,
  op: string,
) {
  if (result.code === "idempotency_conflict")
    return conflict(context, "The idempotency key was already used for a different request.")
  if (result.code === "precondition_failed") return preconditionFailed(context, result.errorData, message, op)
  if (result.errorMessage.includes("could not be found") || result.errorMessage.includes("could not be authorized"))
    return notFound(context)
  if (result.errorMessage.includes("invalid") || result.errorMessage.includes("belong"))
    return badRequest(context, message)
  return internalServerError(context)
}

export function apiNoteRoutesAdd(
  api: Hono<AppEnvironment>,
  options: {
    database: DatabaseClient
    journalPostCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
  },
): void {
  if (options.database === undefined) throw new Error("The authenticated note database is required.")
  if (options.journalPostCommitPublish === undefined)
    throw new Error("The authenticated note journal publisher is required.")

  api.get("/notes", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const result = await noteList(options.database, context.var.requestIdentity.userId, organizationId)
    if (!result.success) return readError(context, result)
    const response = v.safeParse(noteListResponseSchema, result.data)
    if (!response.success) return internalServerError(context)
    const etag = noteRepresentationEtagCreate("list", noteListRevisionDerive(result.data), true)
    const headers = apiRepresentationHeadersCreate(etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), etag))
      return new Response(null, { headers, status: 304 })
    headersApply(context, headers)
    return context.json(response.output)
  })

  api.get("/notes/:noteId", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const result = await noteDetail(
      options.database,
      context.var.requestIdentity.userId,
      context.req.param("noteId"),
      organizationId,
    )
    if (!result.success) return readError(context, result)
    if (result.data === undefined) return notFound(context)
    const response = v.safeParse(noteDetailResponseSchema, result.data)
    if (!response.success) return internalServerError(context)
    const headers = apiRepresentationHeadersCreate(noteRepresentationEtagCreate(result.data.id, result.data.revision))
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), headers.get("ETag") ?? ""))
      return new Response(null, { headers, status: 304 })
    headersApply(context, headers)
    return context.json(response.output)
  })

  api.post("/notes", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("noteCreateRequestParse", noteCreateRequestSchema, body)
    if (!parsed.success) return badRequest(context, "The note creation request is invalid.")
    const idempotencyKey = idempotencyKeyParse(context, parsed.data.idempotencyKey)
    if (idempotencyKey instanceof Response) return idempotencyKey
    const requestHash =
      idempotencyKey === undefined
        ? undefined
        : apiIdempotencyRequestHashCreate({
            content: parsed.data.content,
            createdAt: parsed.data.createdAt,
            id: parsed.data.id,
            projectPath: parsed.data.projectPath,
            updatedAt: parsed.data.updatedAt,
          })
    const result = await noteCreate(
      options.database,
      context.var.requestIdentity.userId,
      { ...parsed.data, idempotencyKey },
      {
        organizationId,
        requestHash,
        journal: {
          postCommitPublish: options.journalPostCommitPublish,
          resolveRecipients: noteJournalRecipientResolverCreate({
            organizationId,
            pendingUserId: context.var.requestIdentity.userId,
          }),
        },
      },
    )
    if (!result.success) {
      if (result.errorMessage.includes("already exists")) return conflict(context, result.errorMessage)
      return mutationError(context, result, "The note creation request is invalid.", "noteCreate")
    }
    if (result.data.responseBody === undefined) return internalServerError(context)
    const response = v.safeParse(noteMutationResponseSchema, result.data.responseBody)
    if (!response.success) return internalServerError(context)
    headersApply(
      context,
      apiRepresentationHeadersCreate(noteRepresentationEtagCreate(response.output.id, response.output.revision)),
    )
    context.header("Idempotency-Replayed", result.data.replayed ? "true" : "false")
    return context.json(response.output, result.data.created && !result.data.replayed ? 201 : 200)
  })

  api.patch("/notes/:noteId", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("noteUpdateRequestParse", noteUpdateRequestSchema, body)
    if (!parsed.success) return badRequest(context, "The note update request is invalid.")
    const expectedEtag = apiIfMatchEtagParse(context.req.header("If-Match"))
    if (!expectedEtag.success) return badRequest(context, "The If-Match header is invalid.")
    const idempotencyKey = idempotencyKeyParse(context, parsed.data.idempotencyKey)
    if (idempotencyKey instanceof Response) return idempotencyKey
    const requestHash =
      idempotencyKey === undefined
        ? undefined
        : apiIdempotencyRequestHashCreate({
            content: parsed.data.content,
            ifMatch: expectedEtag.data,
            projectPath: parsed.data.projectPath,
            updatedAt: parsed.data.updatedAt,
          })
    const result = await noteUpdate(
      options.database,
      context.var.requestIdentity.userId,
      context.req.param("noteId"),
      { ...parsed.data, idempotencyKey },
      {
        expectedEtag: expectedEtag.data,
        organizationId,
        requestHash,
        requireIfMatch: true,
        journal: {
          postCommitPublish: options.journalPostCommitPublish,
          resolveRecipients: noteJournalRecipientResolverCreate({
            organizationId,
            pendingUserId: context.var.requestIdentity.userId,
          }),
        },
      },
    )
    if (!result.success)
      return mutationError(context, result, "The note changed before it could be updated.", "noteUpdate")
    if (result.data.responseBody === undefined) return internalServerError(context)
    const response = v.safeParse(noteMutationResponseSchema, result.data.responseBody)
    if (!response.success) return internalServerError(context)
    headersApply(
      context,
      apiRepresentationHeadersCreate(noteRepresentationEtagCreate(response.output.id, response.output.revision)),
    )
    context.header("Idempotency-Replayed", result.data.replayed ? "true" : "false")
    return context.json(response.output)
  })

  api.delete("/notes/:noteId", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const expectedEtag = apiIfMatchEtagParse(context.req.header("If-Match"))
    if (!expectedEtag.success) return badRequest(context, "The If-Match header is invalid.")
    const idempotencyKey = idempotencyKeyParse(context)
    if (idempotencyKey instanceof Response) return idempotencyKey
    const requestHash =
      idempotencyKey === undefined ? undefined : apiIdempotencyRequestHashCreate({ ifMatch: expectedEtag.data })
    const result = await noteDelete(options.database, context.var.requestIdentity.userId, context.req.param("noteId"), {
      expectedEtag: expectedEtag.data,
      idempotencyKey,
      organizationId,
      requestHash,
      requireIfMatch: true,
      journal: {
        postCommitPublish: options.journalPostCommitPublish,
        resolveRecipients: noteJournalRecipientResolverCreate({
          organizationId,
          pendingUserId: context.var.requestIdentity.userId,
        }),
      },
    })
    if (!result.success)
      return mutationError(context, result, "The note changed before it could be deleted.", "noteDelete")
    if (result.data.responseBody === undefined) return internalServerError(context)
    const response = v.safeParse(noteMutationResponseSchema, result.data.responseBody)
    if (!response.success) return internalServerError(context)
    headersApply(
      context,
      apiRepresentationHeadersCreate(noteRepresentationEtagCreate(response.output.id, response.output.revision)),
    )
    context.header("Idempotency-Replayed", result.data.replayed ? "true" : "false")
    return context.json(response.output)
  })

  api.post("/notes/:noteId/reorder", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("noteReorderRequestParse", noteReorderRequestSchema, body)
    if (!parsed.success) return badRequest(context, "The note reorder request is invalid.")
    const expectedEtag = apiIfMatchEtagParse(context.req.header("If-Match"))
    if (!expectedEtag.success) return badRequest(context, "The If-Match header is invalid.")
    const idempotencyKey = idempotencyKeyParse(context, parsed.data.idempotencyKey)
    if (idempotencyKey instanceof Response) return idempotencyKey
    const requestHash =
      idempotencyKey === undefined
        ? undefined
        : apiIdempotencyRequestHashCreate({
            direction: parsed.data.direction,
            ifMatch: expectedEtag.data,
            projectPath: parsed.data.projectPath,
          })
    const result = await noteReorder(
      options.database,
      context.var.requestIdentity.userId,
      context.req.param("noteId"),
      { ...parsed.data, idempotencyKey },
      {
        expectedEtag: expectedEtag.data,
        organizationId,
        requestHash,
        requireIfMatch: true,
        journal: {
          postCommitPublish: options.journalPostCommitPublish,
          resolveRecipients: noteJournalRecipientResolverCreate({
            organizationId,
            pendingUserId: context.var.requestIdentity.userId,
          }),
        },
      },
    )
    if (!result.success)
      return mutationError(context, result, "The note changed before it could be reordered.", "noteReorder")
    if (result.data.responseBody === undefined) return internalServerError(context)
    const response = v.safeParse(noteMutationResponseSchema, result.data.responseBody)
    if (!response.success) return internalServerError(context)
    headersApply(
      context,
      apiRepresentationHeadersCreate(noteRepresentationEtagCreate(response.output.id, response.output.revision)),
    )
    context.header("Idempotency-Replayed", result.data.replayed ? "true" : "false")
    return context.json(response.output)
  })
}
