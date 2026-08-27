import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { Context } from "hono"
import { Hono } from "hono"
import { apiRequestParse } from "../apiRequestParse.js"
import type { AppEnvironment } from "../appEnvironment.js"
import type { ApiErrorResponse } from "../errors/apiErrorResponseSchema.js"
import { apiClientLogJournalWrite } from "./apiClientLogJournalWrite.js"
import { apiClientLogRequestSchema } from "./apiClientLogRequestSchema.js"
import { apiClientLogSanitize } from "./apiClientLogSanitize.js"
import { apiDiagnosticsLimits } from "./apiDiagnosticsLimits.js"

type ApiContext = Context<AppEnvironment>

type ApiDiagnosticsRoutesOptions = {
  clientLogJournalWrite?: typeof apiClientLogJournalWrite
}

function unauthorized(context: ApiContext) {
  const response = {
    error: { code: "unauthorized", message: "Authentication is required." },
  } satisfies ApiErrorResponse
  context.header("Cache-Control", "no-store")
  return context.json(response, 401)
}

function badRequest(context: ApiContext) {
  const response = {
    error: { code: "bad_request", message: "The diagnostic log request is invalid." },
  } satisfies ApiErrorResponse
  context.header("Cache-Control", "no-store")
  return context.json(response, 400)
}

function internalServerError(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The diagnostic logs could not be recorded." },
  } satisfies ApiErrorResponse
  context.header("Cache-Control", "no-store")
  return context.json(response, 500)
}

async function requestBodyRead(context: ApiContext): Promise<Result<unknown>> {
  const op = "apiClientLogRequestBodyRead"
  const contentLength = context.req.header("Content-Length")
  if (contentLength !== undefined) {
    if (!/^\d+$/u.test(contentLength)) return createResultError(op, "The diagnostic log request body is invalid.")
    const length = Number(contentLength)
    if (!Number.isSafeInteger(length) || length > apiDiagnosticsLimits.maxBodyBytes)
      return createResultError(op, "The diagnostic log request body is too large.")
  }

  try {
    const reader = context.req.raw.body?.getReader()
    if (reader === undefined) return createResultError(op, "The diagnostic log request body is invalid.")

    const chunks: Uint8Array[] = []
    let byteLength = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      byteLength += chunk.value.byteLength
      if (byteLength > apiDiagnosticsLimits.maxBodyBytes) {
        try {
          await reader.cancel()
        } catch (_error) {
          // The bounded body result is already known.
        }
        return createResultError(op, "The diagnostic log request body is too large.")
      }
      chunks.push(chunk.value)
    }

    const bytes = new Uint8Array(byteLength)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return createResult(JSON.parse(text))
  } catch (_error) {
    return createResultError(op, "The diagnostic log request body is invalid.")
  }
}

function requestAuthorized(context: ApiContext): boolean {
  const identity = context.get("requestIdentity")
  return typeof identity?.userId === "string" && identity.userId.length > 0
}

export function apiDiagnosticsRoutesAdd(api: Hono<AppEnvironment>, options: ApiDiagnosticsRoutesOptions = {}): void {
  const journalWrite = options.clientLogJournalWrite ?? apiClientLogJournalWrite

  api.post("/diagnostics/logs", async (context) => {
    if (!requestAuthorized(context)) return unauthorized(context)

    const body = await requestBodyRead(context)
    if (!body.success) return badRequest(context)
    const parsed = apiRequestParse("apiClientLogRequestParse", apiClientLogRequestSchema, body.data)
    if (!parsed.success) return badRequest(context)

    const identity = context.get("requestIdentity")
    if (identity === undefined) return unauthorized(context)
    for (const log of parsed.data.logs) {
      const journalEntry = apiClientLogSanitize({
        eventType: "client-log",
        ...log,
        ...(identity.organizationId === undefined ? {} : { organizationId: identity.organizationId }),
        userId: identity.userId,
      })
      try {
        await journalWrite(journalEntry)
      } catch (_error) {
        return internalServerError(context)
      }
    }

    context.header("Cache-Control", "no-store")
    return context.json({ accepted: parsed.data.logs.length })
  })
}
