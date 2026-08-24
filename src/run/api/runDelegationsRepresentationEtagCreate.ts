import { apiRepresentationEtagCreate } from "../../api/representation/apiRepresentationEtagCreate.js"
import type { ApiEtag } from "../../api/schema/apiEtagSchema.js"
import { runDelegationsSchemaVersion } from "./runDelegationsSchemaVersion.js"

export function runDelegationsRepresentationEtagCreate(sessionId: string, revision: number): ApiEtag {
  return apiRepresentationEtagCreate(`session-delegations:${sessionId}`, runDelegationsSchemaVersion, revision)
}
