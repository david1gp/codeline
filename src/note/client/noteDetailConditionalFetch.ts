import { createResultError, type Result } from "@adaptive-ds/result"
import type { ApiEtag } from "../../api/schema/apiEtagSchema.js"
import { type NoteDetailResponse, noteDetailResponseSchema } from "../api/noteDetailResponseSchema.js"
import { noteRepresentationEtagCreate } from "../api/noteRepresentationEtagCreate.js"
import { noteConditionalGet } from "./noteConditionalGet.js"
import type { NoteRepresentationResponse } from "./noteRepresentationResponse.js"

type NoteDetailConditionalFetchDependencies = {
  etag?: ApiEtag
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

/** Resolves to `undefined` for a deleted note, matching the detail empty state. */
export async function noteDetailConditionalFetch(
  noteId: string,
  dependencies: NoteDetailConditionalFetchDependencies = {},
): Promise<Result<NoteRepresentationResponse<NoteDetailResponse> | undefined>> {
  const op = "noteDetailConditionalFetch"
  if (noteId.trim().length === 0) return createResultError(op, "The note identifier is required.")

  return noteConditionalGet({
    fetch: dependencies.fetch ?? fetch,
    notFoundIsEmpty: true,
    op,
    path: `/api/notes/${encodeURIComponent(noteId)}`,
    responseSchema: noteDetailResponseSchema,
    etagDerive: (note) => noteRepresentationEtagCreate(note.id, note.revision),
    revisionDerive: (note) => note.revision,
    ...(dependencies.etag === undefined ? {} : { etag: dependencies.etag }),
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
