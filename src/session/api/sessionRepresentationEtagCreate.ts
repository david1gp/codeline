import { apiRepresentationEtagCreate } from "../../api/representation/apiRepresentationEtagCreate.js"
import type { ApiEtag } from "../../api/schema/apiEtagSchema.js"
import { sessionRepresentationSchemaVersion } from "./sessionRepresentationSchemaVersion.js"

export function sessionRepresentationEtagCreate(sessionId: string, revision: number, asOfCursor?: string): ApiEtag {
  return apiRepresentationEtagCreate(
    asOfCursor === undefined ? `session:${sessionId}` : `session:${sessionId}\u0000asOf:${asOfCursor}`,
    sessionRepresentationSchemaVersion,
    revision,
  )
}
