import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { runActiveListResponseSchema } from "../api/runActiveListResponseSchema.js"
import type { RunActiveListResponse } from "../api/runActiveListResponseSchema.js"

type RunActiveRunsFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

/**
 * Typed `GET /api/sessions/:sessionId/active-runs`. Used to gate automatic
 * background continuations: a continuation starts a new run, so it must wait
 * until no accepted/running run remains (the parent may still be working in
 * another tab when the background child finishes here).
 */
export async function runActiveRunsFetch(
  sessionId: string,
  dependencies: RunActiveRunsFetchDependencies = {},
): Promise<Result<RunActiveListResponse>> {
  const op = "runActiveRunsFetch"
  if (sessionId.trim().length === 0) return createResultError(op, "The session identifier is required.")
  const fetcher = dependencies.fetch ?? fetch
  let response: Response
  try {
    response = await fetcher(`/api/sessions/${encodeURIComponent(sessionId)}/active-runs`, {
      cache: "no-store",
      headers: new Headers({ Accept: "application/json" }),
      method: "GET",
      ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
    })
  } catch (_error) {
    return createResultError(op, "The active run request could not be completed.")
  }
  if (!response.ok) return createResultError(op, "The active run request failed.")
  let body: unknown
  try {
    body = await response.json()
  } catch (_error) {
    return createResultError(op, "The active run response body is not valid JSON.")
  }
  const parsed = v.safeParse(runActiveListResponseSchema, body)
  if (!parsed.success) return createResultError(op, "The active run response does not match its contract.")
  return createResult(parsed.output)
}
