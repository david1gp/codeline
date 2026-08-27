import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { ApiEtag } from "../../api/schema/apiEtagSchema.js"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import type { ApiRevision } from "../../api/schema/apiRevisionSchema.js"
import type { NoteRepresentationResponse } from "./noteRepresentationResponse.js"

type NoteConditionalGetDependencies<TSchema extends v.GenericSchema> = {
  /** Cached representation validator, sent as `If-None-Match` when present. */
  etag?: ApiEtag
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  notFoundIsEmpty?: boolean
  op: string
  path: string
  responseSchema: TSchema
  revisionDerive: (data: v.InferOutput<TSchema>) => ApiRevision
  etagDerive: (data: v.InferOutput<TSchema>) => ApiEtag
  signal?: AbortSignal
}

/**
 * Conditional note read. Unlike the coalescing typed client it keeps the HTTP
 * status and `ETag` so the shared account cache can retain a representation
 * across a `304` revalidation instead of discarding and refetching it.
 */
export async function noteConditionalGet<TSchema extends v.GenericSchema>(
  dependencies: NoteConditionalGetDependencies<TSchema>,
): Promise<Result<NoteRepresentationResponse<v.InferOutput<TSchema>> | undefined>> {
  const op = dependencies.op
  const headers = new Headers({ Accept: "application/json" })
  if (dependencies.etag !== undefined) headers.set("If-None-Match", dependencies.etag)

  // Detached so a browser `fetch` is never invoked as a method of this object.
  const fetcher = dependencies.fetch
  let response: Response
  try {
    response = await fetcher(dependencies.path, {
      cache: "no-store",
      headers,
      method: "GET",
      ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
    })
  } catch (_error) {
    return createResultError(op, "The note request could not be completed.")
  }

  if (response.status === 304) {
    if (dependencies.etag === undefined)
      return createResultError(op, "The conditional response has no cached representation.")
    return createResult({ status: 304 as const })
  }
  if (response.status === 404 && dependencies.notFoundIsEmpty === true) return createResult(undefined)
  if (!response.ok) return createResultError(op, "The note request failed.")

  let body: unknown
  try {
    body = await response.json()
  } catch (_error) {
    return createResultError(op, "The note response body is not valid JSON.")
  }

  const parsed = v.safeParse(dependencies.responseSchema, body)
  if (!parsed.success) return createResultError(op, "The note response does not match its contract.")

  const responseEtag = v.safeParse(apiEtagSchema, response.headers.get("ETag") ?? undefined)
  return createResult({
    data: parsed.output,
    etag: responseEtag.success ? responseEtag.output : dependencies.etagDerive(parsed.output),
    revision: dependencies.revisionDerive(parsed.output),
    status: 200 as const,
  })
}
