import { createResultErrorCode, type ResultErr } from "@adaptive-ds/result"
import { noteRepresentationEtagCreate } from "../api/noteRepresentationEtagCreate.js"

export function notePreconditionConflictCreate(
  op: string,
  message: string,
  note: { id: string; revision: number },
): ResultErr {
  const result = createResultErrorCode(op, message, "precondition_failed")
  result.statusCode = 412
  result.errorData = JSON.stringify({
    currentEtag: noteRepresentationEtagCreate(note.id, note.revision),
    currentRevision: note.revision,
  })
  return result
}
