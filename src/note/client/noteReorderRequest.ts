import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type NoteMutationResponse, noteMutationResponseSchema } from "../api/noteMutationResponseSchema.js"
import { type NoteReorderRequest, noteReorderRequestSchema } from "../schema/noteReorderRequestSchema.js"

type NoteReorderRequestDependencies = {
  etag: string
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function noteReorderRequest(
  noteId: string,
  input: NoteReorderRequest,
  dependencies: NoteReorderRequestDependencies,
): Promise<Result<NoteMutationResponse>> {
  const op = "noteReorderRequest"
  if (noteId.trim().length === 0) return Promise.resolve(createResultError(op, "The note identifier is required."))
  if (dependencies.etag.trim().length === 0)
    return Promise.resolve(createResultError(op, "The note is still loading. Try again."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.post({
    body: input,
    headers: { "If-Match": dependencies.etag },
    op,
    path: `/api/notes/${encodeURIComponent(noteId)}/reorder`,
    requestSchema: noteReorderRequestSchema,
    responseSchema: noteMutationResponseSchema,
  })
}
