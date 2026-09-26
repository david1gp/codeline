import { createResultErrorCode, type ResultErr } from "@adaptive-ds/result"
import { sessionRepresentationEtagCreate } from "../api/sessionRepresentationEtagCreate.js"

export function sessionPreconditionConflictCreate(
  op: string,
  message: string,
  session: { id: string; revision: number },
): ResultErr {
  const result = createResultErrorCode(op, message, "precondition_failed")
  result.statusCode = 412
  result.errorData = JSON.stringify({
    currentEtag: sessionRepresentationEtagCreate(session.id, session.revision),
    currentRevision: session.revision,
  })
  return result
}
