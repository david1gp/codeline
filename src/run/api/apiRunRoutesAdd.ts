import { createResultErrorCode, type ResultErr } from "@adaptive-ds/result"
import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { apiIfNoneMatchMatches } from "../../api/conditional/apiIfNoneMatchMatches.js"
import type { ApiErrorCatalog } from "../../api/errors/apiErrorCatalog.js"
import { apiErrorCatalogCreate } from "../../api/errors/apiErrorCatalogCreate.js"
import { apiErrorResponseCreate } from "../../api/errors/apiErrorResponseCreate.js"
import { apiRepresentationHeadersCreate } from "../../api/representation/apiRepresentationHeadersCreate.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import type { metricsCollectorCreate } from "../../metrics/metricsCollectorCreate.js"
import { runActiveListLoad } from "../actions/runActiveListLoad.js"
import { runActiveRegistryCreate } from "../actions/runActiveRegistryCreate.js"
import { runActiveSnapshotLoad } from "../actions/runActiveSnapshotLoad.js"
import { runCancel } from "../actions/runCancel.js"
import { runCancellationCoordinatorCreate } from "../actions/runCancellationCoordinatorCreate.js"
import { runDetailLoad } from "../actions/runDetailLoad.js"
import { runDelegationsLoad } from "../actions/runDelegationsLoad.js"
import { runLoad } from "../actions/runLoad.js"
import { runSessionSnapshotLoad } from "../actions/runSessionSnapshotLoad.js"
import { runToolDetailLoad } from "../actions/runToolDetailLoad.js"
import { runErrorCatalog } from "../errors/runErrorCatalog.js"
import { runCancelInputSchema } from "../schema/runCancelInputSchema.js"
import { runActiveListResponseSchema } from "./runActiveListResponseSchema.js"
import { runActiveSnapshotResponseSchema } from "./runActiveSnapshotResponseSchema.js"
import { runCancelResponseSchema } from "./runCancelResponseSchema.js"
import { runDelegationsResponseCreate } from "./runDelegationsResponseCreate.js"
import { runDetailResponseSchema } from "./runDetailResponseSchema.js"
import { runSessionSnapshotResponseSchema } from "./runSessionSnapshotResponseSchema.js"
import { runToolDetailResponseSchema } from "./runToolDetailResponseSchema.js"

type ApiContext = Context<AppEnvironment>
type RunCancellationCoordinator = ReturnType<typeof runCancellationCoordinatorCreate>

type ApiRunRoutesOptions = {
  errorCatalog?: ApiErrorCatalog
  journalCursorCodec?: Pick<JournalCursorCodec, "encodeDeterministic">
  runActiveListLoad?: typeof runActiveListLoad
  runActiveRegistry?: ReturnType<typeof runActiveRegistryCreate>
  runActiveSnapshotLoad?: typeof runActiveSnapshotLoad
  runCancel?: typeof runCancel
  runCancellationCoordinator?: RunCancellationCoordinator
  runDetailLoad?: typeof runDetailLoad
  runDelegationsLoad?: typeof runDelegationsLoad
  runLoad?: typeof runLoad
  runSessionSnapshotLoad?: typeof runSessionSnapshotLoad
  runToolDetailLoad?: typeof runToolDetailLoad
  metricsCollector?: ReturnType<typeof metricsCollectorCreate>
}

function errorResponse(context: ApiContext, result: ResultErr, catalog: ApiErrorCatalog) {
  const response = apiErrorResponseCreate(result, catalog)
  return context.json(response.body, response.status)
}

function badRequest(context: ApiContext, message: string, catalog: ApiErrorCatalog) {
  return errorResponse(context, createResultErrorCode("apiRunRoutesAdd", message, "bad_request"), catalog)
}

function notFound(context: ApiContext, catalog: ApiErrorCatalog) {
  return errorResponse(
    context,
    createResultErrorCode("apiRunRoutesAdd", "The requested resource was not found.", "not_found"),
    catalog,
  )
}

function internalServerError(context: ApiContext, catalog: ApiErrorCatalog) {
  return errorResponse(
    context,
    createResultErrorCode("apiRunRoutesAdd", "The request could not be completed.", "internal_server_error"),
    catalog,
  )
}

function headersApply(context: ApiContext, headers: Headers): void {
  for (const [name, value] of headers.entries()) context.header(name, value)
}

export function apiRunRoutesAdd(api: Hono<AppEnvironment>, options: ApiRunRoutesOptions = {}): void {
  const catalogResult = apiErrorCatalogCreate(runErrorCatalog)
  if (!catalogResult.success) throw new Error(catalogResult.errorMessage)
  const catalog = options.errorCatalog ?? catalogResult.data

  // A reloaded tab knows only its session, so run discovery precedes the
  // run-specific snapshot read that supplies `partialText` and `lastSequence`.
  api.get("/sessions/:sessionId/active-runs", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context, catalog)

    const result = await (options.runActiveListLoad ?? runActiveListLoad)(
      context.var.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
    )
    if (!result.success) return errorResponse(context, result, catalog)

    const response = v.safeParse(runActiveListResponseSchema, result.data)
    if (!response.success) return internalServerError(context, catalog)
    context.header("Cache-Control", "private, no-cache")
    context.header("Vary", "Cookie, Accept-Encoding")
    return context.json(response.output)
  })

  api.get("/sessions/:sessionId/runs/:runId/snapshot", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context, catalog)

    const result = await (options.runActiveSnapshotLoad ?? runActiveSnapshotLoad)(
      context.var.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
      context.req.param("runId"),
      // Deterministic encoding so the same (user, sequence) always yields one
      // cursor. A random-IV encoding would make each snapshot read return a
      // different opaque string for identical state.
      options.journalCursorCodec === undefined ? {} : { cursorEncode: options.journalCursorCodec.encodeDeterministic },
    )
    if (!result.success) return errorResponse(context, result, catalog)

    const response = v.safeParse(runActiveSnapshotResponseSchema, result.data)
    if (!response.success) return internalServerError(context, catalog)
    options.metricsCollector?.increment("snapshot_response_total", 1, { status: "200" })
    return context.json(response.output)
  })

  api.get("/sessions/:sessionId/runs/snapshot", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context, catalog)

    const result = await (options.runSessionSnapshotLoad ?? runSessionSnapshotLoad)(
      context.var.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
    )
    if (!result.success) return errorResponse(context, result, catalog)

    const response = v.safeParse(runSessionSnapshotResponseSchema, result.data)
    if (!response.success) return internalServerError(context, catalog)
    context.header("Cache-Control", "private, no-cache")
    context.header("Vary", "Cookie, Accept-Encoding")
    return context.json(response.output)
  })

  api.get("/sessions/:sessionId/runs/:runId/detail", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context, catalog)

    const result = await (options.runDetailLoad ?? runDetailLoad)(
      context.var.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
      context.req.param("runId"),
    )
    if (!result.success) return errorResponse(context, result, catalog)
    const response = v.safeParse(runDetailResponseSchema, result.data)
    if (!response.success) return internalServerError(context, catalog)
    context.header("Cache-Control", "private, no-cache")
    context.header("Vary", "Cookie, Accept-Encoding")
    return context.json(response.output)
  })

  api.get("/sessions/:sessionId/runs/:runId/tools/:toolId/detail", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context, catalog)

    const result = await (options.runToolDetailLoad ?? runToolDetailLoad)(
      context.var.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
      context.req.param("runId"),
      context.req.param("toolId"),
    )
    if (!result.success) return errorResponse(context, result, catalog)
    const response = v.safeParse(runToolDetailResponseSchema, result.data)
    if (!response.success) return internalServerError(context, catalog)
    context.header("Cache-Control", "private, no-cache")
    context.header("Vary", "Cookie, Accept-Encoding")
    return context.json(response.output)
  })

  api.get("/sessions/:sessionId/delegations", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context, catalog)

    const result = await (options.runDelegationsLoad ?? runDelegationsLoad)(
      context.var.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
    )
    if (!result.success) return errorResponse(context, result, catalog)

    const response = runDelegationsResponseCreate({
      ...result.data,
      sessionId: context.req.param("sessionId"),
    })
    if (!response.success) return internalServerError(context, catalog)
    const headers = apiRepresentationHeadersCreate(response.data.etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), response.data.etag))
      return new Response(null, { headers, status: 304 })
    headersApply(context, headers)
    return context.json(response.data)
  })

  api.post("/sessions/:sessionId/runs/:runId/cancel", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("runCancelInputParse", runCancelInputSchema, body ?? {})
    if (!parsed.success) return badRequest(context, "The run cancellation request is invalid.", catalog)

    const sessionId = context.req.param("sessionId")
    const loaded = await (options.runLoad ?? runLoad)(
      context.var.database,
      context.var.requestIdentity.userId,
      sessionId,
      context.req.param("runId"),
    )
    if (!loaded.success) return errorResponse(context, loaded, catalog)

    const result = await (options.runCancel ?? runCancel)(
      context.var.database,
      context.var.requestIdentity.userId,
      sessionId,
      loaded.data.run.id,
      parsed.data,
    )
    if (!result.success) return errorResponse(context, result, catalog)

    const signalledRunIds =
      options.runActiveRegistry?.cancel({
        runIds: result.data.cancelledRunIds,
        sessionId,
        userId: context.var.requestIdentity.userId,
      }) ??
      options.runCancellationCoordinator?.abort({
        runIds: result.data.cancelledRunIds,
        sessionId,
        userId: context.var.requestIdentity.userId,
      }) ??
      []
    const response = v.safeParse(runCancelResponseSchema, {
      cancelledRunIds: result.data.cancelledRunIds,
      signalledRunIds,
    })
    if (!response.success) return internalServerError(context, catalog)
    return context.json({ ...result.data, signalledRunIds })
  })
}
