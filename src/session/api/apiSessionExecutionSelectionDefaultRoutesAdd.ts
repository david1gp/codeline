import type { Context } from "hono"
import { Hono } from "hono"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { apiIfNoneMatchMatches } from "../../api/conditional/apiIfNoneMatchMatches.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiRepresentationEtagCreate } from "../../api/representation/apiRepresentationEtagCreate.js"
import { apiRepresentationHeadersCreate } from "../../api/representation/apiRepresentationHeadersCreate.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import { sessionExecutionSelectionDefaultDelete } from "../actions/sessionExecutionSelectionDefaultDelete.js"
import { sessionExecutionSelectionDefaultLoad } from "../actions/sessionExecutionSelectionDefaultLoad.js"
import { sessionExecutionSelectionDefaultUpsert } from "../actions/sessionExecutionSelectionDefaultUpsert.js"
import { sessionExecutionSelectionErrorCodes } from "../errors/sessionExecutionSelectionErrorCodes.js"
import { sessionExecutionSelectionDefaultQuerySchema } from "../schema/sessionExecutionSelectionDefaultQuerySchema.js"
import { sessionExecutionSelectionDefaultRequestSchema } from "../schema/sessionExecutionSelectionDefaultRequestSchema.js"
import { sessionExecutionSelectionDefaultResponseCreate } from "./sessionExecutionSelectionDefaultResponseCreate.js"

type ApiContext = Context<AppEnvironment>

type ApiSessionExecutionSelectionDefaultRoutesOptions = {
  database: DatabaseClient
  projectRootDirs?: readonly string[]
  providerAgentCatalog?: ProviderCatalog
  sessionExecutionSelectionDefaultDelete?: typeof sessionExecutionSelectionDefaultDelete
  sessionExecutionSelectionDefaultLoad?: typeof sessionExecutionSelectionDefaultLoad
  sessionExecutionSelectionDefaultUpsert?: typeof sessionExecutionSelectionDefaultUpsert
}

function unauthorized(context: ApiContext) {
  const response = {
    error: { code: "unauthorized", message: "Authentication is required." },
  } satisfies ApiErrorResponse
  return context.json(response, 401)
}

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

function internalServerError(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The request could not be completed." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function requestUserId(context: ApiContext): string | undefined {
  const userId = context.var.requestIdentity?.userId
  return typeof userId === "string" && userId.length > 0 ? userId : undefined
}

function projectPathParse(context: ApiContext) {
  return apiRequestParse(
    "sessionExecutionSelectionDefaultQueryParse",
    sessionExecutionSelectionDefaultQuerySchema,
    context.req.query(),
  )
}

function etagCreate(projectPath: string, revision: number): string {
  return apiRepresentationEtagCreate(`session-execution-selection-default:${projectPath}`, "1", revision)
}

function actionErrorIsBadRequest(errorCode: string | undefined): boolean {
  switch (errorCode) {
    case sessionExecutionSelectionErrorCodes.defaultInputInvalid:
    case sessionExecutionSelectionErrorCodes.primaryAgentDisabled:
    case sessionExecutionSelectionErrorCodes.primaryAgentMismatch:
    case sessionExecutionSelectionErrorCodes.primaryAgentUnavailable:
    case sessionExecutionSelectionErrorCodes.primaryOnlySubagent:
    case sessionExecutionSelectionErrorCodes.projectPathInvalid:
    case sessionExecutionSelectionErrorCodes.selectionInvalid:
    case sessionExecutionSelectionErrorCodes.subagentDisabled:
    case sessionExecutionSelectionErrorCodes.subagentUnavailable:
      return true
    default:
      return false
  }
}

export function apiSessionExecutionSelectionDefaultRoutesAdd(
  api: Hono<AppEnvironment>,
  options: ApiSessionExecutionSelectionDefaultRoutesOptions,
): void {
  api.get("/project/execution-selection-default", async (context) => {
    const userId = requestUserId(context)
    if (userId === undefined) return unauthorized(context)
    const parsed = projectPathParse(context)
    if (!parsed.success) return badRequest(context, "The project path query is invalid.")

    const load = options.sessionExecutionSelectionDefaultLoad ?? sessionExecutionSelectionDefaultLoad
    const result = await load(options.database, userId, parsed.data.projectPath, {
      projectRootDirs: options.projectRootDirs,
    })
    if (!result.success)
      return actionErrorIsBadRequest(result.code)
        ? badRequest(context, "The project path is invalid.")
        : internalServerError(context)
    if (result.data === undefined) return notFound(context)

    const response = sessionExecutionSelectionDefaultResponseCreate(result.data)
    if (!response.success) return internalServerError(context)
    const etag = etagCreate(response.data.projectPath, response.data.revision)
    const headers = apiRepresentationHeadersCreate(etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), etag))
      return new Response(null, { headers, status: 304 })
    for (const [name, value] of headers.entries()) context.header(name, value)
    return context.json(response.data)
  })

  api.put("/project/execution-selection-default", async (context) => {
    const userId = requestUserId(context)
    if (userId === undefined) return unauthorized(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse(
      "sessionExecutionSelectionDefaultRequestParse",
      sessionExecutionSelectionDefaultRequestSchema,
      body,
    )
    if (!parsed.success) return badRequest(context, "The execution selection default request is invalid.")

    const upsert = options.sessionExecutionSelectionDefaultUpsert ?? sessionExecutionSelectionDefaultUpsert
    const result = await upsert(options.database, userId, parsed.data, {
      catalog: options.providerAgentCatalog,
      projectRootDirs: options.projectRootDirs,
    })
    if (!result.success)
      return actionErrorIsBadRequest(result.code)
        ? badRequest(context, "The execution selection default request is invalid.")
        : internalServerError(context)

    const response = sessionExecutionSelectionDefaultResponseCreate(result.data)
    if (!response.success) return internalServerError(context)
    const headers = apiRepresentationHeadersCreate(etagCreate(response.data.projectPath, response.data.revision))
    for (const [name, value] of headers.entries()) context.header(name, value)
    return context.json(response.data)
  })

  api.delete("/project/execution-selection-default", async (context) => {
    const userId = requestUserId(context)
    if (userId === undefined) return unauthorized(context)
    const parsed = projectPathParse(context)
    if (!parsed.success) return badRequest(context, "The project path query is invalid.")

    const remove = options.sessionExecutionSelectionDefaultDelete ?? sessionExecutionSelectionDefaultDelete
    const result = await remove(options.database, userId, parsed.data.projectPath, {
      projectRootDirs: options.projectRootDirs,
    })
    if (!result.success)
      return actionErrorIsBadRequest(result.code)
        ? badRequest(context, "The project path is invalid.")
        : internalServerError(context)
    if (result.data === undefined) return notFound(context)
    return new Response(null, { status: 204 })
  })
}
