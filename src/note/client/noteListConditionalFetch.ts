import type { Result } from "@adaptive-ds/result"
import type { ApiEtag } from "../../api/schema/apiEtagSchema.js"
import { type NoteListResponse, noteListResponseSchema } from "../api/noteListResponseSchema.js"
import { noteListRevisionDerive } from "../api/noteListRevisionDerive.js"
import { noteRepresentationEtagCreate } from "../api/noteRepresentationEtagCreate.js"
import { noteConditionalGet } from "./noteConditionalGet.js"
import type { NoteRepresentationResponse } from "./noteRepresentationResponse.js"

type NoteListConditionalFetchDependencies = {
  etag?: ApiEtag
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export async function noteListConditionalFetch(
  dependencies: NoteListConditionalFetchDependencies = {},
): Promise<Result<NoteRepresentationResponse<NoteListResponse>>> {
  const result = await noteConditionalGet({
    fetch: dependencies.fetch ?? fetch,
    op: "noteListConditionalFetch",
    path: "/api/notes",
    responseSchema: noteListResponseSchema,
    etagDerive: (notes) => noteRepresentationEtagCreate("list", noteListRevisionDerive(notes), true),
    revisionDerive: noteListRevisionDerive,
    ...(dependencies.etag === undefined ? {} : { etag: dependencies.etag }),
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
  if (!result.success) return result
  return { success: true, data: result.data as NoteRepresentationResponse<NoteListResponse> }
}
