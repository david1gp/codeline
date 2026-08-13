import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../appEnvironment.js"
import type { ApiErrorResponse } from "../errors/apiErrorResponseSchema.js"
import { apiRequestParse } from "../apiRequestParse.js"
import { agentList } from "../../database/useCase/agentList.js"
import { serverList } from "../../database/useCase/serverList.js"
import { agentQuerySchema } from "./agentQuerySchema.js"
import { serverQuerySchema } from "./serverQuerySchema.js"

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

  api.get("/servers/:serverId/agents", async (context) => {
    const parsed = apiRequestParse("agentQueryParse", agentQuerySchema, context.req.query())
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The agent query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const result = await agentList(
      context.var.database,
      context.var.developmentUser.id,
      context.req.param("serverId"),
      parsed.data.search,
    )
    if (!result.success) {
      const notFound = result.errorMessage.includes("could not be found")
      const response = {
        error: {
          code: notFound ? "not_found" : "internal_server_error",
          message: notFound ? "The requested resource was not found." : "The agents could not be loaded.",
        },
      } satisfies ApiErrorResponse
      return context.json(response, notFound ? 404 : 500)
    }

    return context.json({ agents: result.data.map((row) => row.agent) })
  })
}
