import { Hono, type Context } from "hono"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import type { ConfigurationStore } from "../configurationStore.js"
import { globalAgentPresetDocumentRead, globalAgentPresetDocumentWrite } from "../globalAgentPresetStore.js"

type ApiGlobalAgentPresetRoutesOptions = {
  configurationStore?: ConfigurationStore
}

export function apiGlobalAgentPresetRoutesAdd(
  api: Hono<AppEnvironment>,
  options: ApiGlobalAgentPresetRoutesOptions = {},
): void {
  api.get("/global/agent-presets", async (context) => {
    const userId = context.var.requestIdentity?.userId
    if (typeof userId !== "string" || userId.length === 0) {
      const response = {
        error: { code: "unauthorized", message: "Authentication is required." },
      } satisfies ApiErrorResponse
      return context.json(response, 401)
    }
    if (options.configurationStore === undefined) return internalServerError(context)
    const result = await globalAgentPresetDocumentRead(options.configurationStore.gitStore)
    if (!result.success) return internalServerError(context)
    return context.json(result.data)
  })

  api.put("/global/agent-presets", async (context) => {
    const userId = context.var.requestIdentity?.userId
    if (typeof userId !== "string" || userId.length === 0) {
      const response = {
        error: { code: "unauthorized", message: "Authentication is required." },
      } satisfies ApiErrorResponse
      return context.json(response, 401)
    }
    if (options.configurationStore === undefined) return internalServerError(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    if (body === undefined) return badRequest(context)
    const result = await globalAgentPresetDocumentWrite(options.configurationStore.gitStore, body)
    if (!result.success) {
      if (result.errorMessage.includes("document is invalid")) return badRequest(context)
      return internalServerError(context)
    }
    const saved = await globalAgentPresetDocumentRead(options.configurationStore.gitStore)
    if (!saved.success) return internalServerError(context)
    return context.json(saved.data)
  })
}

function badRequest(context: Context<AppEnvironment>) {
  const response = {
    error: { code: "bad_request", message: "The global agent preset document is invalid." },
  } satisfies ApiErrorResponse
  return context.json(response, 400)
}

function internalServerError(context: Context<AppEnvironment>) {
  const response = {
    error: { code: "internal_server_error", message: "The global agent preset request could not be completed." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}
