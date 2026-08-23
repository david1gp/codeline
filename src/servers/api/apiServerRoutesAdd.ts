import type { Context } from "hono"
import { Hono } from "hono"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { apiIfNoneMatchMatches } from "../../api/conditional/apiIfNoneMatchMatches.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiRepresentationHeadersCreate } from "../../api/representation/apiRepresentationHeadersCreate.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { serverList } from "../actions/serverList.js"
import { serverQuerySchema } from "../schema/serverQuerySchema.js"
import { serverListResponseCreate } from "./serverListResponseCreate.js"

type ApiServerRoutesOptions = {
  database?: DatabaseClient
}

type ApiContext = Context<AppEnvironment>

function unauthorized(context: ApiContext) {
  const response = {
    error: { code: "unauthorized", message: "Authentication is required." },
  } satisfies ApiErrorResponse
  context.header("Cache-Control", "no-store")
  return context.json(response, 401)
}

function headersApply(context: ApiContext, headers: Headers): void {
  for (const [name, value] of headers.entries()) context.header(name, value)
}

export function apiServerRoutesAdd(api: Hono<AppEnvironment>, options: ApiServerRoutesOptions = {}): void {
  api.get("/servers", async (context) => {
    const identity = context.get("requestIdentity")
    if (identity?.userId === undefined || identity.userId.length === 0) return unauthorized(context)
    const parsed = apiRequestParse("serverQueryParse", serverQuerySchema, context.req.query())
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The server query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const organizationId = identity.organizationId
    if (organizationId === undefined) {
      const response = {
        error: { code: "not_found", message: "The requested resource was not found." },
      } satisfies ApiErrorResponse
      return context.json(response, 404)
    }

    const result = await serverList(options.database ?? context.var.database, organizationId, parsed.data.search)
    if (!result.success) {
      const response = {
        error: { code: "internal_server_error", message: "The servers could not be loaded." },
      } satisfies ApiErrorResponse
      return context.json(response, 500)
    }

    const response = serverListResponseCreate({
      organizationId,
      search: parsed.data.search,
      servers: result.data,
    })
    if (!response.success) {
      const errorResponse = {
        error: { code: "internal_server_error", message: "The servers could not be loaded." },
      } satisfies ApiErrorResponse
      return context.json(errorResponse, 500)
    }

    const headers = apiRepresentationHeadersCreate(response.data.etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), response.data.etag))
      return new Response(null, { headers, status: 304 })
    headersApply(context, headers)
    return context.json(response.data)
  })
}
