import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { runCancel } from "../actions/runCancel.js"
import { runCancellationCoordinatorCreate } from "../actions/runCancellationCoordinatorCreate.js"
import { runDelegationsLoad } from "../actions/runDelegationsLoad.js"
import { runLoad } from "../actions/runLoad.js"
import { runSessionStreamSnapshotLoad } from "../actions/runSessionStreamSnapshotLoad.js"
import { runCancelInputSchema } from "../schema/runCancelInputSchema.js"
import { runDelegationsResponseSchema } from "./runDelegationsResponseSchema.js"
import { runSessionStreamSnapshotResponseSchema } from "./runSessionStreamSnapshotResponseSchema.js"

type ApiContext = Context<AppEnvironment>
type RunCancellationCoordinator = ReturnType<typeof runCancellationCoordinatorCreate>

type ApiRunRoutesOptions = {
  runCancel?: typeof runCancel
  runCancellationCoordinator?: RunCancellationCoordinator
  runDelegationsLoad?: typeof runDelegationsLoad
  runLoad?: typeof runLoad
  runSessionStreamSnapshotLoad?: typeof runSessionStreamSnapshotLoad
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

export function apiRunRoutesAdd(api: Hono<AppEnvironment>, options: ApiRunRoutesOptions = {}): void {
  api.get("/sessions/:sessionId/stream-snapshot", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)

    const result = await (options.runSessionStreamSnapshotLoad ?? runSessionStreamSnapshotLoad)(
      context.var.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
    )
    if (!result.success) {
      if (result.errorMessage.includes("could not be found")) return notFound(context)
      return internalServerError(context)
    }

    const response = v.safeParse(runSessionStreamSnapshotResponseSchema, result.data)
    if (!response.success) return internalServerError(context)
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

    const response = v.safeParse(runDelegationsResponseSchema, result.data)
    if (!response.success) return internalServerError(context)
    return context.json(response.output)
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
      options.runCancellationCoordinator?.abort({
        runIds: result.data.cancelledRunIds,
        sessionId,
        userId: context.var.requestIdentity.userId,
      }) ?? []
    return context.json({ ...result.data, signalledRunIds })
  })
}
