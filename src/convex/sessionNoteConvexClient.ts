import type { Result } from "@adaptive-ds/result"
import type { NoteRecord } from "../note/convex/noteRecord.js"
import type { SessionListResult } from "../session/convex/sessionListResult.js"
import type { SessionListRow } from "../session/convex/sessionListRow.js"
import type { SessionRecord } from "../session/convex/sessionRecord.js"

export type SessionNoteConvexClient = {
  sessionArchive: (userId: string, organizationId: string, sessionId: string) => Promise<Result<SessionRecord>>
  sessionCreate: (
    userId: string,
    organizationId: string,
    input: {
      clientRequestId: string
      metadata: Record<string, string>
      primaryAgentId: string
      projectPath?: string
      serverId: string
      title: string
    },
  ) => Promise<Result<{ created: boolean; session: SessionRecord }>>
  sessionDelete: (userId: string, organizationId: string, sessionId: string) => Promise<Result<SessionRecord>>
  sessionDetail: (userId: string, organizationId: string, sessionId: string) => Promise<Result<SessionListRow>>
  sessionList: (
    userId: string,
    organizationId: string,
    options: { cursor?: string; includeArchived: boolean; limit: number; search?: string },
  ) => Promise<Result<SessionListResult>>
  sessionLoad: (userId: string, organizationId: string, sessionId: string) => Promise<Result<SessionListRow>>
  sessionSearch: (
    userId: string,
    organizationId: string,
    search: string,
    options: { cursor?: string; includeArchived: boolean; limit: number },
  ) => Promise<Result<SessionListResult>>
  sessionPin: (
    userId: string,
    organizationId: string,
    sessionId: string,
    pinned: boolean,
  ) => Promise<Result<SessionRecord>>
  sessionUpdate: (
    userId: string,
    organizationId: string,
    sessionId: string,
    title: string,
  ) => Promise<Result<SessionRecord>>
  noteCreate: (
    userId: string,
    input: { content: string; createdAt: number; id: string; projectPath: string | null; updatedAt: number },
  ) => Promise<Result<NoteRecord>>
  noteDelete: (userId: string, noteId: string) => Promise<Result<NoteRecord>>
  noteDetail: (userId: string, noteId: string) => Promise<Result<NoteRecord | undefined>>
  noteList: (userId: string) => Promise<Result<NoteRecord[]>>
  noteLoad: (userId: string, noteId: string) => Promise<Result<NoteRecord | undefined>>
  noteReorder: (
    userId: string,
    input: { direction: "up" | "down"; id: string; projectPath: string | null },
  ) => Promise<Result<NoteRecord | undefined>>
  noteUpdate: (
    userId: string,
    input: { content: string; id: string; projectPath: string | null; updatedAt: number },
  ) => Promise<Result<NoteRecord>>
}
