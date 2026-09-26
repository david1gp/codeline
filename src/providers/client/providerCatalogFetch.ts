import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type ApiEtag, apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import type { ApiRevision } from "../../api/schema/apiRevisionSchema.js"
import {
  type ProviderApiCatalogResponse,
  providerApiCatalogResponseSchema,
} from "../api/providerApiCatalogResponseSchema.js"

type ProviderCatalogFetchDependencies = {
  /** Cached representation validator, sent as `If-None-Match` when present. */
  etag?: ApiEtag
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export type ProviderCatalogRepresentation =
  | { data: ProviderApiCatalogResponse; etag: ApiEtag; revision: ApiRevision; status: 200 }
  | { status: 304 }

/**
 * Typed conditional `GET /api/providers/catalog` read. It keeps the HTTP status
 * and `ETag` so the shared account cache can retain a catalog across a `304`
 * revalidation instead of discarding and refetching it.
 */
export async function providerCatalogFetch(
  dependencies: ProviderCatalogFetchDependencies = {},
): Promise<Result<ProviderCatalogRepresentation>> {
  const op = "providerCatalogFetch"
  const headers = new Headers({ Accept: "application/json" })
  if (dependencies.etag !== undefined) headers.set("If-None-Match", dependencies.etag)

  // Detached so a browser `fetch` is never invoked as a method of this object.
  const fetcher = dependencies.fetch ?? fetch
  let response: Response
  try {
    response = await fetcher("/api/providers/catalog", {
      cache: "no-store",
      credentials: "same-origin",
      headers,
      method: "GET",
      ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
    })
  } catch (_error) {
    return createResultError(op, "The provider catalog request could not be completed.")
  }

  if (response.status === 304) {
    if (dependencies.etag === undefined)
      return createResultError(op, "The conditional response has no cached representation.")
    const responseEtag = v.safeParse(apiEtagSchema, response.headers.get("ETag") ?? undefined)
    if (!responseEtag.success || responseEtag.output !== dependencies.etag)
      return createResultError(op, "The conditional provider catalog response has an invalid ETag.")
    return createResult({ status: 304 as const })
  }
  if (!response.ok) return createResultError(op, "The provider catalog request failed.")

  let body: unknown
  try {
    body = await response.json()
  } catch (_error) {
    return createResultError(op, "The provider catalog response body is not valid JSON.")
  }

  const parsed = v.safeParse(providerApiCatalogResponseSchema, body)
  if (!parsed.success) return createResultError(op, "The provider catalog response does not match its contract.")

  const responseEtag = v.safeParse(apiEtagSchema, response.headers.get("ETag") ?? undefined)
  if (!responseEtag.success) return createResultError(op, "The provider catalog response has no valid ETag.")
  return createResult({
    data: parsed.output,
    etag: responseEtag.output,
    revision: parsed.output.revision,
    status: 200 as const,
  })
}
