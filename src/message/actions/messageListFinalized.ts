import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import { messageRepositoryListFinalized } from "../db/messageRepositoryListFinalized.js"

export function messageListFinalized(
  database: Parameters<typeof messageRepositoryListFinalized>[0],
  userId: string,
  organizationId: string,
  sessionId: string,
  options: Parameters<typeof messageRepositoryListFinalized>[4],
  dependencies: { cursorCodec: Pick<JournalCursorCodec, "encodeDeterministic"> },
): ReturnType<typeof messageRepositoryListFinalized> {
  return messageRepositoryListFinalized(database, userId, organizationId, sessionId, options, dependencies)
}
