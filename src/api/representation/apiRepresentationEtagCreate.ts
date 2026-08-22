import { createHash } from "node:crypto"
import type { ApiEtag } from "../schema/apiEtagSchema.js"
import type { ApiRevision } from "../schema/apiRevisionSchema.js"

export function apiRepresentationEtagCreate(
  representationIdentity: string,
  schemaVersion: string,
  revision: ApiRevision,
): ApiEtag {
  const digest = createHash("sha256")
    .update(`${representationIdentity}\u0000${schemaVersion}\u0000${revision}`, "utf8")
    .digest("base64url")
  return `"${digest}"`
}
