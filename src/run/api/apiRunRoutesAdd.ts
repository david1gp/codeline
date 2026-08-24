import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { apiIfNoneMatchMatches } from "../../api/conditional/apiIfNoneMatchMatches.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiRepresentationHeadersCreate } from "../../api/representation/apiRepresentationHeadersCreate.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import type { metricsCollectorCreate } from "../../metrics/metricsCollectorCreate.js"
import { runActiveListLoad } from "../actions/runActiveListLoad.js"
import { runActiveRegistryCreate } from "../actions/runActiveRegistryCreate.js"
import { runActiveSnapshotLoad } from "../actions/runActiveSnapshotLoad.js"
import { runCancel } from "../actions/runCancel.js"
import { runCancellationCoordinatorCreate } from "../actions/runCancellationCoordinatorCreate.js"
import { runDelegationsLoad } from "../actions/runDelegationsLoad.js"
import { runLoad } from "../actions/runLoad.js"
import { runCancelInputSchema } from "../schema/runCancelInputSchema.js"
import { runActiveListResponseSchema } from "./runActiveListResponseSchema.js"
import { runActiveSnapshotResponseSchema } from "./runActiveSnapshotResponseSchema.js"
import { runCancelResponseSchema } from "./runCancelResponseSchema.js"
import { runDelegationsResponseCreate } from "./runDelegationsResponseCreate.js"

type ApiContext = Context<AppEnvironment>
type RunCancellationCoordinator = ReturnType<typeof runCancellationCoordinatorCreate>

type ApiRunRoutesOptions = {
  journalCursorCodec?: Pick<JournalCursorCodec, "encodeDeterministic">
  runActiveListLoad?: typeof runActiveListLoad
  runActiveRegistry?: ReturnType<typeof runActiveRegistryCreate>
  runActiveSnapshotLoad?: typeof runActiveSnapshotLoad
  runCancel?: typeof runCancel
  runCancellationCoordinator?: RunCancellationCoordinator
  runDelegationsLoad?: typeof runDelegationsLoad
  runLoad?: typeof runLoad
  metricsCollector?: ReturnType<typeof metricsCollectorCreate>
}

function badRequest(context: ApiContext, message: string) {
  const response = { error: { code: "bad_request", message } } satisfies ApiErrorResponse
  return context.json(response, 400)
}

function notFound(context: ApiContext) {
  const response = {
    error: { code: "not_found", message: "The requested resource was not found." },
  } satisfies ApiErrorResponse
  return context.json(response, 404)
}

function internalServerError(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The request could not be completed." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function headersApply(context: ApiContext, headers: Headers): void {
  for (const [name, value] of headers.entries()) context.header(name, value)
}

export function apiRunRoutesAdd(api: Hono<AppEnvironment>, options: ApiRunRoutesOptions = {}): void {
  // A reloaded tab knows only its session, so run discovery precedes the
  // run-specific snapshot read that supplies `partialText` and `lastSequence`.
  api.get("/sessions/:sessionId/active-runs", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)

    const result = await (options.runActiveListLoad ?? runActiveListLoad)(
      context.var.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
    )
    if (!result.success) {
      if (result.errorMessage.includes("could not be found")) return notFound(context)
      return internalServerError(context)
    }

    const response = v.safeParse(runActiveListResponseSchema, result.data)
    if (!response.success) return internalServerError(context)
    context.header("Cache-Control", "private, no-cache")
    context.header("Vary", "Cookie, Accept-Encoding")
    return context.json(response.output)
  })

  api.get("/sessions/:sessionId/runs/:runId/snapshot", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)

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
    if (!result.success) {
      if (result.errorMessage.includes("could not be found")) return notFound(context)
      return internalServerError(context)
    }

    const response = v.safeParse(runActiveSnapshotResponseSchema, result.data)
    if (!response.success) return internalServerError(context)
    options.metricsCollector?.increment("snapshot_response_total", 1, { status: "200" })
    return context.json(response.output)
  })

  api.get("/sessions/:sessionId/delegations", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)

    const result = await (options.runDelegationsLoad ?? runDelegationsLoad)(
      context.var.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
    )
    if (!result.success) {
      if (result.errorMessage.includes("could not be found")) return notFound(context)
      return internalServerError(context)
    }

    const response = runDelegationsResponseCreate({
      ...result.data,
      sessionId: context.req.param("sessionId"),
    })
    if (!response.success) return internalServerError(context)
    const headers = apiRepresentationHeadersCreate(response.data.etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), response.data.etag))
      return new Response(null, { headers, status: 304 })
    headersApply(context, headers)
    return context.json(response.data)
  })

  api.post("/sessions/:sessionId/runs/:runId/cancel", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("runCancelInputParse", runCancelInputSchema, body ?? {})
    if (!parsed.success) return badRequest(context, "The run cancellation request is invalid.")

    const sessionId = context.req.param("sessionId")
    const loaded = await (options.runLoad ?? runLoad)(
      context.var.database,
      context.var.requestIdentity.userId,
      sessionId,
      context.req.param("runId"),
    )
    if (!loaded.success) {
      if (loaded.errorMessage.includes("could not be found")) return notFound(context)
      return internalServerError(context)
    }

    const result = await (options.runCancel ?? runCancel)(
      context.var.database,
      context.var.requestIdentity.userId,
      sessionId,
      loaded.data.run.id,
      parsed.data,
    )
    if (!result.success) {
      if (result.errorMessage.includes("could not be found")) return notFound(context)
      if (result.errorMessage.includes("input") || result.errorMessage.includes("kind"))
        return badRequest(context, "The run cancellation request is invalid.")
      return internalServerError(context)
    }

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
    if (!response.success) return internalServerError(context)
    return context.json({ ...result.data, signalledRunIds })
  })
}
