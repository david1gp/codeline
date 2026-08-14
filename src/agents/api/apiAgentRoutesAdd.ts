import { Hono } from "hono"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import { agentList } from "../actions/agentList.js"
import { agentQuerySchema } from "../schema/agentQuerySchema.js"
import type { AgentListResponse } from "./agentListResponseSchema.js"

export function apiAgentRoutesAdd(api: Hono<AppEnvironment>): void {
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
      context.var.requestIdentity.userId,
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

    const response = {
      agents: result.data.map(({ agent }) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        serverId: agent.serverId,
      })),
    } satisfies AgentListResponse
    return context.json(response)
  })
}
