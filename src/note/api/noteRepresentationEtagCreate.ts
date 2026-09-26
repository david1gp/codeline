import { apiRepresentationEtagCreate } from "../../api/representation/apiRepresentationEtagCreate.js"
import type { ApiEtag } from "../../api/schema/apiEtagSchema.js"

const noteRepresentationSchemaVersion = "note-v1"

export function noteRepresentationEtagCreate(noteId: string, revision: number, list = false): ApiEtag {
  return apiRepresentationEtagCreate(
    list ? `notes:${noteId}` : `note:${noteId}`,
    noteRepresentationSchemaVersion,
    revision,
  )
}
