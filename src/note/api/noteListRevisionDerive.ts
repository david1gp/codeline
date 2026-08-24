import type { ApiRevision } from "../../api/schema/apiRevisionSchema.js"

/**
 * Representation revision of the note-list response. It changes whenever any
 * included note revision changes or a note enters or leaves the list, so the
 * server and the browser cache derive the same strong version from one payload.
 */
export function noteListRevisionDerive(notes: readonly { revision: ApiRevision }[]): ApiRevision {
  return notes.reduce((total, note) => total + note.revision, notes.length)
}
