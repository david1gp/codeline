import type { Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type NoteListResponse, noteListResponseSchema } from "../api/noteListResponseSchema.js"

type NoteListFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export function noteListFetch(dependencies: NoteListFetchDependencies = {}): Promise<Result<NoteListResponse>> {
  const op = "noteListFetch"
  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: "/api/notes",
    responseSchema: noteListResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
