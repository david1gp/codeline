import { createResult, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import { sessionShellSnapshot } from "../actions/sessionShellSnapshot.js"
import { sessionRepresentationEtagCreate } from "./sessionRepresentationEtagCreate.js"

export async function sessionMutationEtagResolve(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  expectedEtag: string | undefined,
  cursorCodec: JournalCursorCodec,
): Promise<Result<string | undefined>> {
  if (expectedEtag === undefined) return createResult(undefined)

  const current = await sessionShellSnapshot(database, userId, organizationId, sessionId, { cursorCodec })
  if (!current.success) return createResult(expectedEtag)
  if (current.data.etag !== expectedEtag) return createResult(expectedEtag)

  return createResult(sessionRepresentationEtagCreate(sessionId, current.data.revision))
}
