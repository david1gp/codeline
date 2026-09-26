import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type NoteMutationResponse, noteMutationResponseSchema } from "../api/noteMutationResponseSchema.js"

type NoteDeleteRequestDependencies = {
  etag: string
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function noteDeleteRequest(
  noteId: string,
  dependencies: NoteDeleteRequestDependencies,
): Promise<Result<NoteMutationResponse>> {
  const op = "noteDeleteRequest"
  if (noteId.trim().length === 0) return Promise.resolve(createResultError(op, "The note identifier is required."))
  if (dependencies.etag.trim().length === 0)
    return Promise.resolve(createResultError(op, "The note is still loading. Try again."))

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.delete({
    headers: { "If-Match": dependencies.etag },
    op,
    path: `/api/notes/${encodeURIComponent(noteId)}`,
    responseSchema: noteMutationResponseSchema,
  })
}
