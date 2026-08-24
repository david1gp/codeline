import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { ApiEtag } from "../../api/schema/apiEtagSchema.js"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { runDelegationsResponseSchema } from "../api/runDelegationsResponseSchema.js"
import type { SessionDelegationsRepresentationResponse } from "./sessionDelegationsRepresentationResponse.js"

type SessionDelegationsFetchDependencies = {
  cached?: { etag: ApiEtag }
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export async function sessionDelegationsFetch(
  sessionId: string,
  dependencies: SessionDelegationsFetchDependencies = {},
): Promise<Result<SessionDelegationsRepresentationResponse>> {
  const op = "sessionDelegationsFetch"
  if (sessionId.trim().length === 0) return createResultError(op, "The session identifier is required.")

  const headers = new Headers({ Accept: "application/json" })
  if (dependencies.cached !== undefined) headers.set("If-None-Match", dependencies.cached.etag)
  const fetcher = dependencies.fetch ?? fetch
  let response: Response
  try {
    response = await fetcher(`/api/sessions/${encodeURIComponent(sessionId)}/delegations`, {
      cache: "no-store",
      headers,
      method: "GET",
      ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
    })
  } catch (_error) {
    return createResultError(op, "The delegation request could not be completed.")
  }

  if (response.status === 304) {
    if (dependencies.cached === undefined)
      return createResultError(op, "The conditional response has no cached representation.")
    const responseEtag = v.safeParse(apiEtagSchema, response.headers.get("ETag") ?? undefined)
    if (responseEtag.success && responseEtag.output !== dependencies.cached.etag)
      return createResultError(op, "The conditional delegation response ETag is inconsistent.")
    return createResult({ status: 304 as const })
  }
  if (!response.ok) return createResultError(op, "The delegation request failed.")

  let body: unknown
  try {
    body = await response.json()
  } catch (_error) {
    return createResultError(op, "The delegation response body is not valid JSON.")
  }
  const parsed = v.safeParse(runDelegationsResponseSchema, body)
  if (!parsed.success) return createResultError(op, "The delegation response does not match its contract.")

  const responseEtag = v.safeParse(apiEtagSchema, response.headers.get("ETag") ?? undefined)
  if (responseEtag.success && responseEtag.output !== parsed.output.etag)
    return createResultError(op, "The delegation response ETag is inconsistent.")
  const result: SessionDelegationsRepresentationResponse = {
    data: parsed.output,
    etag: parsed.output.etag,
    revision: parsed.output.revision,
    status: 200,
  }
  return createResult(result)
}
