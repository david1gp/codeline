import type { ApiEtag } from "../../api/schema/apiEtagSchema.js"
import type { ApiRevision } from "../../api/schema/apiRevisionSchema.js"

/**
 * Conditional note read outcome. `200` carries the authoritative payload plus
 * its representation identity so the shared account cache can retain it; `304`
 * states that the cached representation is still current.
 */
export type NoteRepresentationResponse<T> =
  | { data: T; etag: ApiEtag; revision: ApiRevision; status: 200 }
  | { status: 304 }
