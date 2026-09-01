import type { DatabaseClient } from "../../database/databaseClient.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import {
  sessionRepositoryDetailStreamBacklogRead,
  type SessionDetailStreamBacklogReadResult,
} from "../db/sessionRepositoryDetailStreamBacklogRead.js"

type SessionDetailStreamBacklogReadDependencies = {
  cursorCodec: Pick<JournalCursorCodec, "encodeSessionPosition" | "validateSessionPosition">
}

type SessionDetailStreamBacklogReadInput = {
  after?: unknown
  lastEventId?: unknown
  organizationId: unknown
  sessionId: unknown
  userId: unknown
}

export function sessionDetailStreamBacklogRead(
  database: DatabaseClient,
  input: SessionDetailStreamBacklogReadInput,
  dependencies: SessionDetailStreamBacklogReadDependencies,
): Promise<import("@adaptive-ds/result").Result<SessionDetailStreamBacklogReadResult>> {
  return sessionRepositoryDetailStreamBacklogRead(database, input, dependencies)
}
