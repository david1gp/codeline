import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, desc, eq, ilike, isNull, lt, or, sql } from "drizzle-orm"
import * as v from "valibot"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { metadataSearchPatternCreate } from "../../database/metadataSearchPatternCreate.js"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import { journalSequenceCounterTable } from "../../journal/db/journalSequenceCounterTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { type SessionListCursor, sessionListCursorSchema } from "../api/sessionListCursorSchema.js"
import { sessionListRequestSchema } from "../api/sessionListRequestSchema.js"
import { sessionTable } from "./sessionTable.js"

type SessionListSnapshotDependencies = {
  cursorCodec: {
    encodeDeterministic: (journalId: unknown, sequence: unknown) => Result<string>
  }
}

type SessionListRequestInput = v.InferInput<typeof sessionListRequestSchema>

type SessionListSnapshotRow = {
  agent: typeof agentTable.$inferSelect
  server: typeof serverTable.$inferSelect
  session: typeof sessionTable.$inferSelect
}

function sessionListCursorDecode(cursor: string | undefined): Result<SessionListCursor | undefined> {
  const op = "sessionListCursorDecode"
  if (cursor === undefined) return createResult(undefined)

  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown
    const parsed = v.safeParse(sessionListCursorSchema, decoded)
    if (!parsed.success) return createResultErrorCode(op, "The session list cursor is invalid.", "cursor_invalid")
    return createResult(parsed.output)
  } catch (_error) {
    return createResultErrorCode(op, "The session list cursor is invalid.", "cursor_invalid")
  }
}

function sessionListCursorEncode(cursor: SessionListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

function sessionListHighestSequence(nextSequence: number | undefined): Result<number> {
  const op = "sessionRepositoryListSnapshot"
  if (nextSequence === undefined) return createResult(0)
  if (!Number.isSafeInteger(nextSequence) || nextSequence < 1)
    return createResultErrorCode(op, "The authenticated user's journal counter is invalid.", "journal_unavailable")
  return createResult(nextSequence - 1)
}

function sessionListRepresentationRevision(rows: SessionListSnapshotRow[], asOfSequence: number): number {
  const representation = [
    String(asOfSequence),
    ...rows.map(({ session }) =>
      [session.id, session.revision, session.updatedAt.toISOString(), session.archivedAt?.toISOString() ?? ""].join(
        "\u0000",
      ),
    ),
  ].join("\u0001")
  let hash = 2_166_136_261
  for (const character of representation) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619)
  return hash >>> 0
}

export async function sessionRepositoryListSnapshot(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  options: SessionListRequestInput,
  dependencies: SessionListSnapshotDependencies,
): Promise<
  Result<{
    asOfCursor: string
    nextCursor: string | null
    revision: number
    rows: SessionListSnapshotRow[]
  }>
> {
  const op = "sessionRepositoryListSnapshot"
  const parsedOptions = v.safeParse(sessionListRequestSchema, options)
  if (!parsedOptions.success) return createResultError(op, "The session list request is invalid.")
  const decodedCursor = sessionListCursorDecode(parsedOptions.output.cursor)
  if (!decodedCursor.success) return decodedCursor

  try {
    return await database.transaction(
      async (transaction) => {
        const [user] = await transaction
          .select({ id: applicationUserTable.id })
          .from(applicationUserTable)
          .where(eq(applicationUserTable.id, userId))
          .limit(1)
        if (user === undefined)
          return createResultErrorCode(
            op,
            "The authenticated application user was not found.",
            "authenticated_user_invalid",
          )

        const [counter] = await transaction
          .select({ nextSequence: journalSequenceCounterTable.nextSequence })
          .from(journalSequenceCounterTable)
          .where(eq(journalSequenceCounterTable.userId, user.id))
          .limit(1)
        const highestSequence = sessionListHighestSequence(counter?.nextSequence)
        if (!highestSequence.success) return highestSequence
        const asOfCursor = dependencies.cursorCodec.encodeDeterministic(user.id, highestSequence.data)
        if (!asOfCursor.success) return createResultError(op, asOfCursor.errorMessage)

        const conditions = [
          eq(sessionTable.userId, user.id),
          eq(serverTable.organizationId, organizationId),
          eq(agentTable.serverId, sessionTable.serverId),
        ]
        if (!parsedOptions.output.includeArchived) conditions.push(isNull(sessionTable.archivedAt))
        if (decodedCursor.data !== undefined) {
          const cursorCondition = or(
            lt(sessionTable.updatedAt, sql`${decodedCursor.data.updatedAt}::timestamptz`),
            and(
              eq(sessionTable.updatedAt, sql`${decodedCursor.data.updatedAt}::timestamptz`),
              lt(sessionTable.id, decodedCursor.data.id),
            ),
          )
          if (cursorCondition !== undefined) conditions.push(cursorCondition)
        }
        if (parsedOptions.output.search !== undefined) {
          const pattern = metadataSearchPatternCreate(parsedOptions.output.search)
          const searchCondition = or(
            ilike(sessionTable.title, pattern),
            ilike(sql<string>`${sessionTable.metadata}::text`, pattern),
            ilike(serverTable.name, pattern),
            ilike(agentTable.name, pattern),
            ilike(sql<string>`${serverTable.metadata}::text`, pattern),
            ilike(sql<string>`${agentTable.configuration}::text`, pattern),
          )
          if (searchCondition !== undefined) conditions.push(searchCondition)
        }

        const rows = await transaction
          .select({ agent: agentTable, server: serverTable, session: sessionTable })
          .from(sessionTable)
          .innerJoin(serverTable, eq(sessionTable.serverId, serverTable.id))
          .innerJoin(agentTable, eq(sessionTable.primaryAgentId, agentTable.id))
          .where(and(...conditions))
          .orderBy(desc(sessionTable.updatedAt), desc(sessionTable.id))
          .limit(parsedOptions.output.limit + 1)

        const page = rows.slice(0, parsedOptions.output.limit)
        const last = page.at(-1)
        const nextCursor =
          rows.length > parsedOptions.output.limit && last !== undefined
            ? sessionListCursorEncode({
                id: last.session.id,
                includeArchived: parsedOptions.output.includeArchived,
                kind: "session-list",
                limit: parsedOptions.output.limit,
                organizationId,
                search: parsedOptions.output.search ?? null,
                updatedAt: last.session.updatedAt.toISOString(),
                userId,
                version: 1,
              })
            : null

        return createResult({
          asOfCursor: asOfCursor.data,
          nextCursor,
          revision: sessionListRepresentationRevision(rows, highestSequence.data),
          rows: page,
        })
      },
      { accessMode: "read only", isolationLevel: "repeatable read" },
    )
  } catch (_error) {
    return createResultError(op, "The session list snapshot could not be loaded.")
  }
}
