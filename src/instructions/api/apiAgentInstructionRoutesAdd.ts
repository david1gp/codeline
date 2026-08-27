import type { Context } from "hono"
import { Hono } from "hono"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { projectApiProjectQuerySchema } from "../../project/api/projectApiProjectQuerySchema.js"
import { projectResolve } from "../../project/projectResolve.js"
import { agentInstructionInspectionResponseCreate } from "../actions/agentInstructionInspectionResponseCreate.js"
import { agentInstructionsDiscover } from "../actions/agentInstructionsDiscover.js"

type ApiContext = Context<AppEnvironment>

type ApiAgentInstructionRoutesOptions = {
  agentInstructionsDiscover?: typeof agentInstructionsDiscover
  globalAgentsPath?: string
  rootDirs?: readonly string[]
}

function unauthorized(context: ApiContext) {
  const response = {
    error: { code: "unauthorized", message: "Authentication is required." },
  } satisfies ApiErrorResponse
  return context.json(response, 401)
}

function badRequest(context: ApiContext) {
  const response = {
    error: { code: "bad_request", message: "The project selection is invalid." },
  } satisfies ApiErrorResponse
  return context.json(response, 400)
}

function notFound(context: ApiContext) {
  const response = {
    error: { code: "not_found", message: "The requested project was not found." },
  } satisfies ApiErrorResponse
  return context.json(response, 404)
}

function internalServerError(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The agent instructions could not be inspected." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function requestAuthorized(context: ApiContext): boolean {
  const identity = context.get("requestIdentity")
  return typeof identity?.userId === "string" && identity.userId.length > 0
}

export function apiAgentInstructionRoutesAdd(
  api: Hono<AppEnvironment>,
  options: ApiAgentInstructionRoutesOptions = {},
): void {
  api.get("/agent-instructions", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const parsed = apiRequestParse(
      "agentInstructionProjectQueryParse",
      projectApiProjectQuerySchema,
      context.req.query(),
    )
    if (!parsed.success) return badRequest(context)

    const project = await projectResolve(options.rootDirs ?? [], parsed.data.project)
    if (!project.success) return notFound(context)

    const discovered = await (options.agentInstructionsDiscover ?? agentInstructionsDiscover)({
      globalAgentsPath: options.globalAgentsPath,
      projectRoot: project.data.rootDir,
    })
    if (!discovered.success) return internalServerError(context)

    const response = agentInstructionInspectionResponseCreate({
      projectId: project.data.id,
      projectRoot: project.data.rootDir,
      snapshot: discovered.data,
    })
    if (!response.success) return internalServerError(context)
    return context.json(response.data)
  })
}
