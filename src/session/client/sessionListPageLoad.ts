import type { Result } from "@adaptive-ds/result"
import type * as v from "valibot"
import type { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { sessionListSnapshotResponseV3Schema } from "../api/sessionListSnapshotResponseSchema.js"

type SessionListPage = v.InferOutput<typeof sessionListSnapshotResponseV3Schema>

type SessionListPageLoadInput = {
  cursor?: string
  includeArchived?: boolean
  limit: number
  search?: string
  signal?: AbortSignal
}

export function sessionListPageLoad(
  client: ReturnType<typeof apiHttpClientCreate>,
  input: SessionListPageLoadInput,
): Promise<Result<SessionListPage>> {
  return client.get({
    op: "sessionListPageLoad",
    path: "/api/sessions",
    query: {
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      includeArchived: input.includeArchived === true ? "1" : "0",
      limit: input.limit,
      ...(input.search === undefined || input.search === "" ? {} : { search: input.search }),
    },
    responseSchema: sessionListSnapshotResponseV3Schema,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  })
}
