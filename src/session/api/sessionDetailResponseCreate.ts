import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type SessionDetailResponse, sessionDetailResponseSchema } from "./sessionDetailResponseSchema.js"
import { sessionRepresentationEtagCreate } from "./sessionRepresentationEtagCreate.js"
import { sessionRepresentationSchemaVersion } from "./sessionRepresentationSchemaVersion.js"
import { sessionShellCreate } from "./sessionShellCreate.js"

export function sessionDetailResponseCreate(input: {
  agent: { id: string }
  asOfCursor?: string
  server: { id: string }
  session: Parameters<typeof sessionShellCreate>[0]
}): Result<SessionDetailResponse> {
  const op = "sessionDetailResponseCreate"
  const session = sessionShellCreate(input.session)
  if (!session.success) return session

  const response = v.safeParse(sessionDetailResponseSchema, {
    agent: { id: input.agent.id },
    ...(input.asOfCursor === undefined ? {} : { asOfCursor: input.asOfCursor }),
    etag: sessionRepresentationEtagCreate(session.data.id, session.data.revision, input.asOfCursor),
    revision: session.data.revision,
    schemaVersion: sessionRepresentationSchemaVersion,
    server: { id: input.server.id },
    session: session.data,
  })
  if (!response.success) return createResultError(op, "The session representation is invalid.")
  return createResult(response.output)
}
