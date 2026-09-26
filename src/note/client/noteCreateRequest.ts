import type { Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type NoteMutationResponse, noteMutationResponseSchema } from "../api/noteMutationResponseSchema.js"
import { type NoteCreateRequest, noteCreateRequestSchema } from "../schema/noteCreateRequestSchema.js"

type NoteCreateRequestDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function noteCreateRequest(
  input: NoteCreateRequest,
  dependencies: NoteCreateRequestDependencies = {},
): Promise<Result<NoteMutationResponse>> {
  const op = "noteCreateRequest"
  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.post({
    body: input,
    op,
    path: "/api/notes",
    requestSchema: noteCreateRequestSchema,
    responseSchema: noteMutationResponseSchema,
  })
}
