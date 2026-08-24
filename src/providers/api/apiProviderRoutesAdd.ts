import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { apiIfNoneMatchMatches } from "../../api/conditional/apiIfNoneMatchMatches.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiRepresentationHeadersCreate } from "../../api/representation/apiRepresentationHeadersCreate.js"
import { providerAgentCatalogRedact } from "../catalog/providerAgentCatalogRedact.js"
import { providerConnectionTest } from "../runtime/providerConnectionTest.js"
import { type ProviderModelDiscoveryOptions, providerModelDiscovery } from "../runtime/providerModelDiscovery.js"
import type { ProviderCatalog } from "../schema/providerCatalogSchema.js"
import { providerApiCatalogResponseSchema } from "./providerApiCatalogResponseSchema.js"
import { type ProviderApiConnectionTestResponse } from "./providerApiConnectionTestResponseSchema.js"
import { type ProviderApiModelsResponse } from "./providerApiModelsResponseSchema.js"
import { providerApiRequestSchema } from "./providerApiRequestSchema.js"
import { providerCatalogRepresentationEtagCreate } from "./providerCatalogRepresentationEtagCreate.js"

type ApiContext = Context<AppEnvironment>

type ApiProviderRoutesOptions = {
  configuration: unknown
  environment: Readonly<Record<string, string | undefined>>
  fetch: NonNullable<ProviderModelDiscoveryOptions["fetch"]>
  providerAgentCatalog?: ProviderCatalog
}

function unauthorized(context: ApiContext) {
  const response = {
    error: { code: "unauthorized", message: "Authentication is required." },
  } satisfies ApiErrorResponse
  return context.json(response, 401)
}

function badRequest(context: ApiContext) {
  const response = {
    error: { code: "bad_request", message: "The provider request is invalid." },
  } satisfies ApiErrorResponse
  return context.json(response, 400)
}

function providerUnavailable(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The provider request could not be completed." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function catalogUnavailable(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The provider catalog is unavailable." },
  } satisfies ApiErrorResponse
  context.header("Cache-Control", "no-store")
  return context.json(response, 500)
}

function requestAuthorized(context: ApiContext): boolean {
  const identity = context.get("requestIdentity")
  return typeof identity?.userId === "string" && identity.userId.length > 0
}

async function requestBodyRead(context: ApiContext): Promise<unknown> {
  return context.req.json<unknown>().catch(() => undefined)
}

function headersApply(context: ApiContext, headers: Headers): void {
  for (const [name, value] of headers.entries()) context.header(name, value)
}

export function apiProviderRoutesAdd(api: Hono<AppEnvironment>, options: ApiProviderRoutesOptions): void {
  api.get("/providers/catalog", (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)
    if (options.providerAgentCatalog === undefined) return catalogUnavailable(context)

    const response = providerAgentCatalogRedact(options.providerAgentCatalog)
    if (!v.safeParse(providerApiCatalogResponseSchema, response).success) return catalogUnavailable(context)

    const etag = providerCatalogRepresentationEtagCreate(options.providerAgentCatalog.revision, response.revision)
    const headers = apiRepresentationHeadersCreate(etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), etag))
      return new Response(null, { headers, status: 304 })
    headersApply(context, headers)
    return context.json(response)
  })

  api.post("/providers/models", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)

    const body = apiRequestParse("providerApiRequestParse", providerApiRequestSchema, await requestBodyRead(context))
    if (!body.success) return badRequest(context)

    const result = await providerModelDiscovery(options.configuration, {
      environment: options.environment,
      fetch: options.fetch,
    })
    if (!result.success) return providerUnavailable(context)

    const response = { models: result.data } satisfies ProviderApiModelsResponse
    return context.json(response)
  })

  api.post("/providers/connection-test", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)

    const body = apiRequestParse("providerApiRequestParse", providerApiRequestSchema, await requestBodyRead(context))
    if (!body.success) return badRequest(context)

    const result = await providerConnectionTest(options.configuration, {
      environment: options.environment,
      fetch: options.fetch,
    })
    if (!result.success) return providerUnavailable(context)

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
