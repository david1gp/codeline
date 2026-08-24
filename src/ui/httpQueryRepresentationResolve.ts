import { createResult, type Result } from "@adaptive-ds/result"
import type { ApiEtag } from "../api/schema/apiEtagSchema.js"
import type { ApiRevision } from "../api/schema/apiRevisionSchema.js"

export type HttpQueryRepresentation<T> = { data: T; etag: ApiEtag; revision: ApiRevision; status: 200 }

/**
 * Lifts a typed read whose payload already carries its representation revision
 * and `ETag` into the envelope the shared account cache stores, so a retained
 * representation is only replaced by a newer revision.
 */
export function httpQueryRepresentationResolve<T extends { etag: ApiEtag; revision: ApiRevision }>(
  result: Result<T>,
): Result<HttpQueryRepresentation<T>> {
  if (!result.success) return result
  return createResult({ data: result.data, etag: result.data.etag, revision: result.data.revision, status: 200 })
}
