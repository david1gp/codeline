import type { ApiEtag } from "../../api/schema/apiEtagSchema.js"
import type { ApiRevision } from "../../api/schema/apiRevisionSchema.js"
import type { RunDelegationsResponse } from "../api/runDelegationsResponseSchema.js"

export type SessionDelegationsRepresentationResponse =
  | { data: RunDelegationsResponse; etag: ApiEtag; revision: ApiRevision; status: 200 }
  | { status: 304 }
