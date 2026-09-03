import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm"
import * as v from "valibot"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { metadataSearchPatternCreate } from "../../database/metadataSearchPatternCreate.js"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import { journalSequenceCounterTable } from "../../journal/db/journalSequenceCounterTable.js"
import { projectTable } from "../../project/db/projectTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import type { SessionListCursor } from "../api/sessionListCursorSchema.js"
import { sessionListRequestSchema } from "../api/sessionListRequestSchema.js"
import type { SessionListCursorCodec } from "./sessionListCursorCodecCreate.js"
import { sessionTable } from "./sessionTable.js"

type SessionListSnapshotDependencies = {
  cursorCodec: {
    encodeGlobalSequence: (journalId: unknown, globalSequence: unknown) => Result<string>
    sessionList: SessionListCursorCodec
  }
}

type SessionListRequestInput = v.InferInput<typeof sessionListRequestSchema>

type SessionListSnapshotRow = {
  agent: typeof agentTable.$inferSelect
  projectId: string | null
  server: typeof serverTable.$inferSelect
  session: typeof sessionTable.$inferSelect
}

function sessionListCursorRequestValidate(
  cursor: SessionListCursor,
  userId: string,
  organizationId: string,
  options: v.InferOutput<typeof sessionListRequestSchema>,
): Result<SessionListCursor> {
  const op = "sessionListCursorRequestValidate"
  if (cursor.userId !== userId || cursor.organizationId !== organizationId)
    return createResultErrorCode(
      op,
      "The session list cursor does not belong to the authenticated request.",
      "cursor_owner_mismatch",
    )
  if (
    cursor.includeArchived !== options.includeArchived ||
    cursor.limit !== options.limit ||
    cursor.search !== (options.search ?? null)
  )
    return createResultErrorCode(op, "The session list cursor does not match the request.", "cursor_invalid")
  return createResult(cursor)
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
    ...rows.map(({ projectId, session }) =>
      [
        session.id,
        session.revision,
        session.updatedAt.toISOString(),
        session.archivedAt?.toISOString() ?? "",
        projectId ?? "",
      ].join("\u0000"),
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
  const decodedCursor = dependencies.cursorCodec.sessionList.decode(parsedOptions.output.cursor)
  if (!decodedCursor.success) return decodedCursor
  const validatedCursor =
    decodedCursor.data === undefined
      ? createResult<SessionListCursor | undefined>(undefined)
      : sessionListCursorRequestValidate(decodedCursor.data, userId, organizationId, parsedOptions.output)
  if (!validatedCursor.success) return validatedCursor

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
        const asOfCursor = dependencies.cursorCodec.encodeGlobalSequence(user.id, highestSequence.data)
        if (!asOfCursor.success) return createResultError(op, asOfCursor.errorMessage)

        const conditions = [
          eq(sessionTable.userId, user.id),
          eq(serverTable.organizationId, organizationId),
          eq(agentTable.serverId, sessionTable.serverId),
        ]
        if (!parsedOptions.output.includeArchived) conditions.push(isNull(sessionTable.archivedAt))
        if (validatedCursor.data !== undefined) {
          const cursorTimestamp = new Date(validatedCursor.data.updatedAt)
          const cursorCondition = or(
            lt(sessionTable.updatedAt, cursorTimestamp),
            and(eq(sessionTable.updatedAt, cursorTimestamp), lt(sessionTable.id, validatedCursor.data.id)),
          )
          if (cursorCondition !== undefined) conditions.push(cursorCondition)
        }
        if (parsedOptions.output.search !== undefined) {
          const pattern = metadataSearchPatternCreate(parsedOptions.output.search)
          const searchCondition = or(
            sql`lower(${sessionTable.title}) like lower(${pattern}) escape ${"\\"}`,
            sql`lower(${sessionTable.metadata}) like lower(${pattern}) escape ${"\\"}`,
            sql`lower(${serverTable.name}) like lower(${pattern}) escape ${"\\"}`,
            sql`lower(${agentTable.name}) like lower(${pattern}) escape ${"\\"}`,
            sql`lower(${serverTable.metadata}) like lower(${pattern}) escape ${"\\"}`,
            sql`lower(${agentTable.configuration}) like lower(${pattern}) escape ${"\\"}`,
          )
          if (searchCondition !== undefined) conditions.push(searchCondition)
        }

        const rows = await transaction
          .select({ agent: agentTable, projectId: projectTable.id, server: serverTable, session: sessionTable })
          .from(sessionTable)
          .innerJoin(serverTable, eq(sessionTable.serverId, serverTable.id))
          .innerJoin(agentTable, eq(sessionTable.primaryAgentId, agentTable.id))
          .leftJoin(
            projectTable,
            and(eq(projectTable.userId, sessionTable.userId), eq(projectTable.path, sessionTable.projectPath)),
          )
          .where(and(...conditions))
          .orderBy(desc(sessionTable.updatedAt), desc(sessionTable.id))
          .limit(parsedOptions.output.limit + 1)

        const page = rows.slice(0, parsedOptions.output.limit)
        const last = page.at(-1)
        let nextCursor: string | null = null
        if (rows.length > parsedOptions.output.limit && last !== undefined) {
          const encoded = dependencies.cursorCodec.sessionList.encode({
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
          if (!encoded.success) return createResultError(op, encoded.errorMessage)
          nextCursor = encoded.data
        }

        return createResult({
          asOfCursor: asOfCursor.data,
          nextCursor,
          revision: sessionListRepresentationRevision(rows, highestSequence.data),
          rows: page,
        })
      },
      { behavior: "deferred" },
    )
  } catch (_error) {
    return createResultError(op, "The session list snapshot could not be loaded.")
  }
}
