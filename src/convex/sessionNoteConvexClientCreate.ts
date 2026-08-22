import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import type { NoteRecord } from "../note/convex/noteRecord.js"
import type { SessionListResult } from "../session/convex/sessionListResult.js"
import type { SessionListRow } from "../session/convex/sessionListRow.js"
import type { SessionRecord } from "../session/convex/sessionRecord.js"
import type { SessionNoteConvexClient } from "./sessionNoteConvexClient.js"

type ConvexResult<T> = Result<T>

const sessionListReference = makeFunctionReference<
  "query",
  { cursor?: string; includeArchived: boolean; limit: number; organizationId: string; search?: string; userId: string },
  ConvexResult<SessionListResult>
>("sessions:sessionListInternal")
const sessionLoadReference = makeFunctionReference<
  "query",
  { organizationId: string; sessionId: string; userId: string },
  ConvexResult<SessionListRow>
>("sessions:sessionLoadInternal")
const sessionDetailReference = makeFunctionReference<
  "query",
  { organizationId: string; sessionId: string; userId: string },
  ConvexResult<SessionListRow>
>("sessions:sessionDetailInternal")
const sessionSearchReference = makeFunctionReference<
  "query",
  { cursor?: string; includeArchived: boolean; limit: number; organizationId: string; search: string; userId: string },
  ConvexResult<SessionListResult>
>("sessions:sessionSearchInternal")
const sessionCreateReference = makeFunctionReference<
  "mutation",
  {
    clientRequestId: string
    metadata: Record<string, string>
    organizationId: string
    primaryAgentId: string
    projectPath?: string
    serverId: string
    title: string
    userId: string
  },
  ConvexResult<{ created: boolean; session: SessionRecord }>
>("sessions:sessionCreateInternal")
const sessionUpdateReference = makeFunctionReference<
  "mutation",
  { organizationId: string; sessionId: string; title: string; userId: string },
  ConvexResult<SessionRecord>
>("sessions:sessionUpdateInternal")
const sessionArchiveReference = makeFunctionReference<
  "mutation",
  { organizationId: string; sessionId: string; userId: string },
  ConvexResult<SessionRecord>
>("sessions:sessionArchiveInternal")
const sessionPinReference = makeFunctionReference<
  "mutation",
  { organizationId: string; pinned: boolean; sessionId: string; userId: string },
  ConvexResult<SessionRecord>
>("sessions:sessionPinInternal")
const sessionDeleteReference = makeFunctionReference<
  "mutation",
  { organizationId: string; sessionId: string; userId: string },
  ConvexResult<SessionRecord>
>("sessions:sessionDeleteInternal")
const noteListReference = makeFunctionReference<"query", { userId: string }, ConvexResult<NoteRecord[]>>(
  "notes:noteListInternal",
)
const noteLoadReference = makeFunctionReference<
  "query",
  { noteId: string; userId: string },
  ConvexResult<NoteRecord | undefined>
>("notes:noteLoadInternal")
const noteDetailReference = makeFunctionReference<
  "query",
  { noteId: string; userId: string },
  ConvexResult<NoteRecord | undefined>
>("notes:noteDetailInternal")
const noteCreateReference = makeFunctionReference<
  "mutation",
  { content: string; createdAt: number; id: string; projectPath: string | null; updatedAt: number; userId: string },
  ConvexResult<NoteRecord>
>("notes:noteCreateInternal")
const noteUpdateReference = makeFunctionReference<
  "mutation",
  { content: string; id: string; projectPath: string | null; updatedAt: number; userId: string },
  ConvexResult<NoteRecord>
>("notes:noteUpdateInternal")
const noteDeleteReference = makeFunctionReference<
  "mutation",
  { noteId: string; userId: string },
  ConvexResult<NoteRecord>
>("notes:noteDeleteInternal")
const noteReorderReference = makeFunctionReference<
  "mutation",
  { direction: "up" | "down"; id: string; projectPath: string | null; userId: string },
  ConvexResult<NoteRecord | undefined>
>("notes:noteReorderInternal")

export function sessionNoteConvexClientCreate(url: string, adminKey: string): Result<SessionNoteConvexClient> {
  const op = "sessionNoteConvexClientCreate"
  try {
    const client = new ConvexHttpClient(url, { logger: false, skipConvexDeploymentUrlCheck: true })
    const adminClient = client as ConvexHttpClient & { setAdminAuth: (key: string) => void }
    adminClient.setAdminAuth(adminKey)
    return createResult({
      sessionArchive: (userId, organizationId, sessionId) =>
        sessionNoteConvexMutation(client, "sessionArchive", sessionArchiveReference, {
          organizationId,
          sessionId,
          userId,
        }),
      sessionCreate: (userId, organizationId, input) =>
        sessionNoteConvexMutation(client, "sessionCreate", sessionCreateReference, {
          ...input,
          organizationId,
          userId,
        }),
      sessionDelete: (userId, organizationId, sessionId) =>
        sessionNoteConvexMutation(client, "sessionDelete", sessionDeleteReference, {
          organizationId,
          sessionId,
          userId,
        }),
      sessionDetail: (userId, organizationId, sessionId) =>
        sessionNoteConvexQuery(client, "sessionDetail", sessionDetailReference, { organizationId, sessionId, userId }),
      sessionList: (userId, organizationId, options) =>
        sessionNoteConvexQuery(client, "sessionList", sessionListReference, { ...options, organizationId, userId }),
      sessionLoad: (userId, organizationId, sessionId) =>
        sessionNoteConvexQuery(client, "sessionLoad", sessionLoadReference, { organizationId, sessionId, userId }),
      sessionSearch: (userId, organizationId, search, options) =>
        sessionNoteConvexQuery(client, "sessionSearch", sessionSearchReference, {
          ...options,
          organizationId,
          search,
          userId,
        }),
      sessionPin: (userId, organizationId, sessionId, pinned) =>
        sessionNoteConvexMutation(client, "sessionPin", sessionPinReference, {
          organizationId,
          pinned,
          sessionId,
          userId,
        }),
      sessionUpdate: (userId, organizationId, sessionId, title) =>
        sessionNoteConvexMutation(client, "sessionUpdate", sessionUpdateReference, {
          organizationId,
          sessionId,
          title,
          userId,
        }),
      noteCreate: (userId, input) =>
        sessionNoteConvexMutation(client, "noteCreate", noteCreateReference, { ...input, userId }),
      noteDelete: (userId, noteId) =>
        sessionNoteConvexMutation(client, "noteDelete", noteDeleteReference, { noteId, userId }),
      noteDetail: (userId, noteId) =>
        sessionNoteConvexQuery(client, "noteDetail", noteDetailReference, { noteId, userId }),
      noteList: (userId) => sessionNoteConvexQuery(client, "noteList", noteListReference, { userId }),
      noteLoad: (userId, noteId) => sessionNoteConvexQuery(client, "noteLoad", noteLoadReference, { noteId, userId }),
      noteReorder: (userId, input) =>
        sessionNoteConvexMutation(client, "noteReorder", noteReorderReference, { ...input, userId }),
      noteUpdate: (userId, input) =>
        sessionNoteConvexMutation(client, "noteUpdate", noteUpdateReference, { ...input, userId }),
    })
  } catch (_error) {
    return createResultError(op, "The Convex session client could not be created.")
  }
}

async function sessionNoteConvexQuery<T>(
  client: ConvexHttpClient,
  operation: string,
  reference: any,
  args: Record<string, unknown>,
) {
  return sessionNoteConvexCall<T>(operation, () => client.query(reference, args))
}

async function sessionNoteConvexMutation<T>(
  client: ConvexHttpClient,
  operation: string,
  reference: any,
  args: Record<string, unknown>,
) {
  return sessionNoteConvexCall<T>(operation, () => client.mutation(reference, args))
}

async function sessionNoteConvexCall<T>(operation: string, call: () => Promise<unknown>): Promise<Result<T>> {
  try {
    const value = await call()
    if (!sessionNoteConvexResultIs(value))
      return createResultError(`sessionNoteConvex${operation}Call`, "The Convex response is invalid.")
    return value as Result<T>
  } catch (_error) {
    return createResultError(`sessionNoteConvex${operation}Call`, "The Convex session service is unavailable.")
  }
}

function sessionNoteConvexResultIs(value: unknown): value is ConvexResult<unknown> {
  return typeof value === "object" && value !== null && "success" in value && typeof value.success === "boolean"
}
