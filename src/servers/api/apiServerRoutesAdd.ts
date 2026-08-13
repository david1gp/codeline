import { Hono } from "hono"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import { serverList } from "../actions/serverList.js"
import { serverQuerySchema } from "../schema/serverQuerySchema.js"

export function apiServerRoutesAdd(api: Hono<AppEnvironment>): void {
  api.get("/servers", async (context) => {
    const parsed = apiRequestParse("serverQueryParse", serverQuerySchema, context.req.query())
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The server query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const result = await serverList(context.var.database, context.var.developmentUser.id, parsed.data.search)
    if (!result.success) {
      const response = {
        error: { code: "internal_server_error", message: "The servers could not be loaded." },
      } satisfies ApiErrorResponse
      return context.json(response, 500)
    }

    return context.json({ servers: result.data })
  })
}
