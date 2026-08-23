import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type NoteDetailResponse, noteDetailResponseSchema } from "../api/noteDetailResponseSchema.js"

type NoteDetailFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export async function noteDetailFetch(
  noteId: string,
  dependencies: NoteDetailFetchDependencies = {},
): Promise<Result<NoteDetailResponse | undefined>> {
  const op = "noteDetailFetch"
  if (noteId.trim().length === 0) return createResultError(op, "The note identifier is required.")

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  const result = await client.get({
    cache: "no-store",
    op,
    path: `/api/notes/${encodeURIComponent(noteId)}`,
    responseSchema: noteDetailResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
  if (!result.success && result.statusCode === 404) return createResult(undefined)
  return result
}
