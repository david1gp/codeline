import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiRepresentationEtagCreate } from "../../api/representation/apiRepresentationEtagCreate.js"
import {
  type SessionListSnapshotResponse,
  sessionListSnapshotResponseV3Schema,
} from "./sessionListSnapshotResponseSchema.js"
import { sessionListSnapshotSchemaVersion } from "./sessionListSnapshotSchemaVersion.js"
import { sessionShellCreate } from "./sessionShellCreate.js"

type SessionListSnapshotRow = {
  session: Parameters<typeof sessionShellCreate>[0]
}
type CurrentSessionListSnapshotResponse = Extract<SessionListSnapshotResponse, { etag: string }>

export function sessionListSnapshotResponseCreate(input: {
  asOfCursor: string
  nextCursor: string | null
  representationIdentity: string
  revision: number
  rows: SessionListSnapshotRow[]
}): Result<CurrentSessionListSnapshotResponse> {
  const op = "sessionListSnapshotResponseCreate"
  const sessions = []
  for (const row of input.rows) {
    const session = sessionShellCreate(row.session)
    if (!session.success) return createResultError(op, session.errorMessage)
    sessions.push(session.data)
  }

  const parsed = v.safeParse(sessionListSnapshotResponseV3Schema, {
    asOfCursor: input.asOfCursor,
    etag: apiRepresentationEtagCreate(
      `${input.representationIdentity}\u0000asOf:${input.asOfCursor}`,
      sessionListSnapshotSchemaVersion,
      input.revision,
    ),
    nextCursor: input.nextCursor,
    revision: input.revision,
    schemaVersion: sessionListSnapshotSchemaVersion,
    sessions,
  })
  if (!parsed.success) return createResultError(op, "The session list snapshot representation is invalid.")
  if (!("asOfCursor" in parsed.output))
    return createResultError(op, "The session list snapshot representation is invalid.")
  return createResult(parsed.output)
}
