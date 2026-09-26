import type { Context } from "hono"
import { Hono } from "hono"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { projectDiscoveryApiProjectQuerySchema } from "../../project/api/projectDiscoveryApiProjectQuerySchema.js"
import { projectApiProjectQuerySchema } from "../../project/api/projectApiProjectQuerySchema.js"
import { projectResolve } from "../../project/actions/projectResolve.js"
import { type CommandCatalogDiscoverOptions, commandCatalogDiscover } from "../actions/commandCatalogDiscover.js"
import { commandCatalogInspectionResponseCreate } from "../actions/commandCatalogInspectionResponseCreate.js"
import { globalAgentFileCatalogRequest } from "../../agents/actions/globalAgentFileCatalogRequest.js"

type ApiContext = Context<AppEnvironment>

type ApiCommandRoutesOptions = {
  commandCatalogDiscover?: typeof commandCatalogDiscover
  globalCommandsPath?: string
  projectRegistryDatabase?: DatabaseClient
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
    error: { code: "internal_server_error", message: "The commands could not be inspected." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function requestAuthorized(context: ApiContext): boolean {
  const identity = context.get("requestIdentity")
  return typeof identity?.userId === "string" && identity.userId.length > 0
}

export function apiCommandRoutesAdd(api: Hono<AppEnvironment>, options: ApiCommandRoutesOptions = {}): void {
  api.get("/global/commands", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const result = await globalAgentFileCatalogRequest(options.globalCommandsPath ?? "~/.agents/commands", {
      kind: "command", operation: "list",
    })
    return result.success ? context.json({ commands: result.data.names }) : internalServerError(context)
  })
  api.post("/global/commands", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    if (typeof body !== "object" || body === null || typeof (body as { name?: unknown }).name !== "string" || typeof (body as { content?: unknown }).content !== "string") return badRequest(context)
    const result = await globalAgentFileCatalogRequest(options.globalCommandsPath ?? "~/.agents/commands", {
      kind: "command", operation: "create", name: (body as { name: string }).name, content: (body as { content: string }).content,
    })
    if (!result.success) return context.json({ error: { code: "bad_request", message: result.errorMessage } }, 400)
    return context.json({ name: (body as { name: string }).name, content: result.data.content }, 201)
  })
  api.get("/global/commands/:name{.+}", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const name = context.req.param("name")
    const result = await globalAgentFileCatalogRequest(options.globalCommandsPath ?? "~/.agents/commands", {
      kind: "command", operation: "get", name,
    })
    return result.success ? context.json({ name, content: result.data.content }) : context.json({ error: { code: "not_found", message: result.errorMessage } }, 404)
  })
  api.put("/global/commands/:name{.+}", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    if (typeof body !== "object" || body === null || typeof (body as { content?: unknown }).content !== "string") return badRequest(context)
    const result = await globalAgentFileCatalogRequest(options.globalCommandsPath ?? "~/.agents/commands", {
      kind: "command", operation: "update", name: context.req.param("name"), content: (body as { content: string }).content,
    })
    if (!result.success) return context.json({ error: { code: "bad_request", message: result.errorMessage } }, 400)
    return context.json({ name: context.req.param("name"), content: result.data.content })
  })
  api.delete("/global/commands/:name{.+}", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const result = await globalAgentFileCatalogRequest(options.globalCommandsPath ?? "~/.agents/commands", {
      kind: "command", operation: "delete", name: context.req.param("name"),
    })
    return result.success ? new Response(null, { status: 204 }) : context.json({ error: { code: "not_found", message: result.errorMessage } }, 404)
  })
  api.get("/project/commands/catalog", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const parsed = apiRequestParse(
      "commandProjectQueryParse",
      options.projectRegistryDatabase === undefined
        ? projectDiscoveryApiProjectQuerySchema
        : projectApiProjectQuerySchema,
      context.req.query(),
    )
    if (!parsed.success) return badRequest(context)
    const project = await projectResolve(options.rootDirs ?? [], parsed.data.project, {
      ...(options.projectRegistryDatabase === undefined
        ? {}
        : { database: options.projectRegistryDatabase, userId: context.var.requestIdentity.userId }),
    })
    if (!project.success) return notFound(context)
    const discover = (options.commandCatalogDiscover ?? commandCatalogDiscover) as (
      options: CommandCatalogDiscoverOptions,
    ) => ReturnType<typeof commandCatalogDiscover>
    const catalog = await discover({
      ...(options.globalCommandsPath === undefined ? {} : { globalCommandsPath: options.globalCommandsPath }),
      projectRoot: project.data.rootDir,
    })
    if (!catalog.success) return internalServerError(context)
    const response = commandCatalogInspectionResponseCreate({
      catalog: catalog.data,
      projectId: project.data.id,
      projectRoot: project.data.rootDir,
    })
    if (!response.success) return internalServerError(context)
    return context.json(response.data)
  })
}
