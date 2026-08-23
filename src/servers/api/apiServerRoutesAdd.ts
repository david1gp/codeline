import { Hono } from "hono"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { serverList } from "../actions/serverList.js"
import { serverQuerySchema } from "../schema/serverQuerySchema.js"
import type { ServerListResponse } from "./serverListResponseSchema.js"

type ApiServerRoutesOptions = {
  database?: DatabaseClient
}

export function apiServerRoutesAdd(api: Hono<AppEnvironment>, options: ApiServerRoutesOptions = {}): void {
  api.get("/servers", async (context) => {
    const parsed = apiRequestParse("serverQueryParse", serverQuerySchema, context.req.query())
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The server query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return context.json({ servers: [] } satisfies ServerListResponse)

    const result = await serverList(options.database ?? context.var.database, organizationId, parsed.data.search)
    if (!result.success) {
      const response = {
        error: { code: "internal_server_error", message: "The servers could not be loaded." },
      } satisfies ApiErrorResponse
      return context.json(response, 500)
    }

    const response = {
      servers: result.data.map((server) => ({ id: server.id, name: server.name })),
    } satisfies ServerListResponse
    return context.json(response)
  })
}
