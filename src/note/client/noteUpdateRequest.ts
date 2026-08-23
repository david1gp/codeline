import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type NoteMutationResponse, noteMutationResponseSchema } from "../api/noteMutationResponseSchema.js"
import { type NoteUpdateRequest, noteUpdateRequestSchema } from "../schema/noteUpdateRequestSchema.js"

type NoteUpdateRequestDependencies = {
  etag: string
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function noteUpdateRequest(
  noteId: string,
  input: NoteUpdateRequest,
  dependencies: NoteUpdateRequestDependencies,
): Promise<Result<NoteMutationResponse>> {
  const op = "noteUpdateRequest"
  if (noteId.trim().length === 0) return Promise.resolve(createResultError(op, "The note identifier is required."))
  if (dependencies.etag.trim().length === 0)
    return Promise.resolve(createResultError(op, "The note is still loading. Try again."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.patch({
    body: input,
    headers: { "If-Match": dependencies.etag },
    op,
    path: `/api/notes/${encodeURIComponent(noteId)}`,
    requestSchema: noteUpdateRequestSchema,
    responseSchema: noteMutationResponseSchema,
  })
}
