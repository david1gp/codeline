import type { Context } from "hono"
import { Hono } from "hono"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { apiIfNoneMatchMatches } from "../../api/conditional/apiIfNoneMatchMatches.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiRepresentationHeadersCreate } from "../../api/representation/apiRepresentationHeadersCreate.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { type ProviderApiConnectionTestResponse } from "../../providers/api/providerApiConnectionTestResponseSchema.js"
import { type ProviderApiModelsResponse } from "../../providers/api/providerApiModelsResponseSchema.js"
import { providerConnectionTest } from "../../providers/runtime/providerConnectionTest.js"
import type { ProviderModelDiscoveryOptions } from "../../providers/runtime/providerModelDiscovery.js"
import { providerModelDiscovery } from "../../providers/runtime/providerModelDiscovery.js"
import { serverLoad } from "../../servers/actions/serverLoad.js"
import { agentCreate } from "../actions/agentCreate.js"
import { agentList } from "../actions/agentList.js"
import { agentLoad } from "../actions/agentLoad.js"
import { agentUpdate } from "../actions/agentUpdate.js"
import { agentCreateRequestSchema } from "../schema/agentCreateRequestSchema.js"
import { agentProviderRequestSchema } from "../schema/agentProviderRequestSchema.js"
import { agentQuerySchema } from "../schema/agentQuerySchema.js"
import { agentUpdateRequestSchema } from "../schema/agentUpdateRequestSchema.js"
import { agentDetailResponseCreate } from "./agentDetailResponseCreate.js"
import { agentListResponseCreate } from "./agentListResponseCreate.js"

type ApiContext = Context<AppEnvironment>

type ApiAgentRoutesOptions = {
  database?: DatabaseClient
  environment?: Readonly<Record<string, string | undefined>>
  fetch?: NonNullable<ProviderModelDiscoveryOptions["fetch"]>
}

function unauthorized(context: ApiContext) {
  const response = {
    error: { code: "unauthorized", message: "Authentication is required." },
  } satisfies ApiErrorResponse
  return context.json(response, 401)
}

function badRequest(context: ApiContext, message = "The agent request is invalid.") {
  const response = { error: { code: "bad_request", message } } satisfies ApiErrorResponse
  return context.json(response, 400)
}

function notFound(context: ApiContext) {
  const response = {
    error: { code: "not_found", message: "The requested resource was not found." },
  } satisfies ApiErrorResponse
  return context.json(response, 404)
}

function internalServerError(context: ApiContext, message = "The agent request could not be completed.") {
  const response = { error: { code: "internal_server_error", message } } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function requestAuthorized(context: ApiContext): boolean {
  const identity = context.get("requestIdentity")
  return typeof identity?.userId === "string" && identity.userId.length > 0
}

function requestOrganizationId(context: ApiContext): string | undefined {
  const organizationId = context.get("requestIdentity")?.organizationId
  return typeof organizationId === "string" && organizationId.length > 0 ? organizationId : undefined
}

async function requestBodyRead(context: ApiContext): Promise<unknown> {
  return context.req.json<unknown>().catch(() => undefined)
}

function agentError(context: ApiContext, errorMessage: string, operation: "load" | "create" | "update") {
  if (errorMessage.includes("could not be found")) return notFound(context)
  if (errorMessage.includes("input is invalid")) return badRequest(context)
  return internalServerError(
    context,
    operation === "load"
      ? "The agent could not be loaded."
      : operation === "create"
        ? "The agent could not be created."
        : "The agent could not be updated.",
  )
}

function headersApply(context: ApiContext, headers: Headers): void {
  for (const [name, value] of headers.entries()) context.header(name, value)
}

function providerError(context: ApiContext) {
  return internalServerError(context, "The provider request could not be completed.")
}

function serverError(context: ApiContext, errorMessage: string) {
  if (errorMessage.includes("could not be found")) return notFound(context)
  return internalServerError(context, "The server could not be loaded.")
}

export function apiAgentRoutesAdd(api: Hono<AppEnvironment>, options: ApiAgentRoutesOptions = {}): void {
  const environment = options.environment ?? Bun.env
  const fetchImplementation = options.fetch ?? globalThis.fetch

  const databaseResolve = (context: ApiContext): DatabaseClient => options.database ?? context.var.database

  api.get("/servers/:serverId/agents", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const organizationId = requestOrganizationId(context)
    if (organizationId === undefined) return notFound(context)
    const parsed = apiRequestParse("agentQueryParse", agentQuerySchema, context.req.query())
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The agent query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const result = await agentList(
      databaseResolve(context),
      organizationId,
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

    const response = agentListResponseCreate({
      agents: result.data.map(({ agent }) => ({
        id: agent.id,
        name: agent.name,
        parentAgentId: agent.parentAgentId ?? null,
        role: agent.role,
        serverId: agent.serverId,
      })),
      organizationId,
      search: parsed.data.search,
      serverId: context.req.param("serverId"),
    })
    if (!response.success) return internalServerError(context)
    const headers = apiRepresentationHeadersCreate(response.data.etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), response.data.etag))
      return new Response(null, { headers, status: 304 })
    headersApply(context, headers)
    return context.json(response.data)
  })

  api.get("/servers/:serverId/agents/:agentId", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const organizationId = requestOrganizationId(context)
    if (organizationId === undefined) return notFound(context)
    const result = await agentLoad(
      databaseResolve(context),
      organizationId,
      context.req.param("serverId"),
      context.req.param("agentId"),
    )
    if (!result.success) return agentError(context, result.errorMessage, "load")

    const response = agentDetailResponseCreate({
      agent: {
        configuration: result.data.agent.configuration,
        id: result.data.agent.id,
        name: result.data.agent.name,
        role: result.data.agent.role,
        serverId: result.data.agent.serverId,
      },
      organizationId,
    })
    if (!response.success) return internalServerError(context)
    const headers = apiRepresentationHeadersCreate(response.data.etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), response.data.etag))
      return new Response(null, { headers, status: 304 })
    headersApply(context, headers)
    return context.json(response.data)
  })

  api.post("/servers/:serverId/agents", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const organizationId = requestOrganizationId(context)
    if (organizationId === undefined) return notFound(context)
    const body = apiRequestParse("agentCreateRequestParse", agentCreateRequestSchema, await requestBodyRead(context))
    if (!body.success) return badRequest(context, "The agent creation request is invalid.")

    const result = await agentCreate(databaseResolve(context), organizationId, context.req.param("serverId"), body.data)
    if (!result.success) return agentError(context, result.errorMessage, "create")

    const response = agentDetailResponseCreate({
      agent: {
        configuration: result.data.configuration,
        id: result.data.id,
        name: result.data.name,
        role: result.data.role,
        serverId: result.data.serverId,
      },
      organizationId,
    })
    if (!response.success) return internalServerError(context)
    return context.json(response.data, 201)
  })

  api.patch("/servers/:serverId/agents/:agentId", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const organizationId = requestOrganizationId(context)
    if (organizationId === undefined) return notFound(context)
    const body = apiRequestParse("agentUpdateRequestParse", agentUpdateRequestSchema, await requestBodyRead(context))
    if (!body.success) return badRequest(context, "The agent update request is invalid.")

    const result = await agentUpdate(
      databaseResolve(context),
      organizationId,
      context.req.param("serverId"),
      context.req.param("agentId"),
      body.data,
    )
    if (!result.success) return agentError(context, result.errorMessage, "update")

    const response = agentDetailResponseCreate({
      agent: {
        configuration: result.data.configuration,
        id: result.data.id,
        name: result.data.name,
        role: result.data.role,
        serverId: result.data.serverId,
      },
      organizationId,
    })
    if (!response.success) return internalServerError(context)
    return context.json(response.data)
  })

  api.post("/servers/:serverId/agents/models", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const organizationId = requestOrganizationId(context)
    if (organizationId === undefined) return notFound(context)
    const body = apiRequestParse(
      "agentProviderRequestParse",
      agentProviderRequestSchema,
      await requestBodyRead(context),
    )
    if (!body.success || body.data.configuration === undefined) {
      return badRequest(context, "The agent provider configuration is required.")
    }

    const server = await serverLoad(databaseResolve(context), organizationId, context.req.param("serverId"))
    if (!server.success) return serverError(context, server.errorMessage)

    const result = await providerModelDiscovery(body.data.configuration, {
      environment,
      fetch: fetchImplementation,
    })
    if (!result.success) return providerError(context)
    const response = { models: result.data } satisfies ProviderApiModelsResponse
    return context.json(response)
  })

  api.post("/servers/:serverId/agents/connection-test", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const organizationId = requestOrganizationId(context)
    if (organizationId === undefined) return notFound(context)
    const body = apiRequestParse(
      "agentProviderRequestParse",
      agentProviderRequestSchema,
      await requestBodyRead(context),
    )
    if (!body.success || body.data.configuration === undefined) {
      return badRequest(context, "The agent provider configuration is required.")
    }

    const server = await serverLoad(databaseResolve(context), organizationId, context.req.param("serverId"))
    if (!server.success) return serverError(context, server.errorMessage)

    const result = await providerConnectionTest(body.data.configuration, {
      environment,
      fetch: fetchImplementation,
    })
    if (!result.success) return providerError(context)
    const response = {
      discoveredModelCount: result.data.discoveredModelCount,
      model: result.data.model,
      modelAvailable: result.data.modelAvailable,
      ok: result.data.ok,
      provider: result.data.provider,
    } satisfies ProviderApiConnectionTestResponse
    return context.json(response)
  })

  api.post("/servers/:serverId/agents/:agentId/models", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const organizationId = requestOrganizationId(context)
    if (organizationId === undefined) return notFound(context)
    const body = apiRequestParse(
      "agentProviderRequestParse",
      agentProviderRequestSchema,
      await requestBodyRead(context),
    )
    if (!body.success) return badRequest(context, "The agent provider request is invalid.")

    const agent = await agentLoad(
      databaseResolve(context),
      organizationId,
      context.req.param("serverId"),
      context.req.param("agentId"),
    )
    if (!agent.success) return agentError(context, agent.errorMessage, "load")

    const result = await providerModelDiscovery(body.data.configuration ?? agent.data.agent.configuration, {
      environment,
      fetch: fetchImplementation,
    })
    if (!result.success) return providerError(context)
    const response = { models: result.data } satisfies ProviderApiModelsResponse
    return context.json(response)
  })

  api.post("/servers/:serverId/agents/:agentId/connection-test", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    const organizationId = requestOrganizationId(context)
    if (organizationId === undefined) return notFound(context)
    const body = apiRequestParse(
      "agentProviderRequestParse",
      agentProviderRequestSchema,
      await requestBodyRead(context),
    )
    if (!body.success) return badRequest(context, "The agent provider request is invalid.")

    const agent = await agentLoad(
      databaseResolve(context),
      organizationId,
      context.req.param("serverId"),
      context.req.param("agentId"),
    )
    if (!agent.success) return agentError(context, agent.errorMessage, "load")

    const result = await providerConnectionTest(body.data.configuration ?? agent.data.agent.configuration, {
      environment,
      fetch: fetchImplementation,
    })
    if (!result.success) return providerError(context)
    const response = {
      discoveredModelCount: result.data.discoveredModelCount,
      model: result.data.model,
      modelAvailable: result.data.modelAvailable,
      ok: result.data.ok,
      provider: result.data.provider,
    } satisfies ProviderApiConnectionTestResponse
    return context.json(response)
  })
}
