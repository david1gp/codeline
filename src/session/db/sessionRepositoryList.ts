import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm"
import * as v from "valibot"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { metadataSearchPatternCreate } from "../../database/metadataSearchPatternCreate.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "./sessionTable.js"

const sessionCursorSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  updatedAt: v.pipe(v.string(), v.minLength(1)),
})

type SessionCursor = v.InferOutput<typeof sessionCursorSchema>

function sessionCursorDecode(cursor: string | undefined): Result<SessionCursor | undefined> {
  const op = "sessionCursorDecode"
  if (cursor === undefined) return createResult(undefined)

  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown
    const parsed = v.safeParse(sessionCursorSchema, decoded)
    if (!parsed.success) return createResultError(op, "The session list cursor is invalid.")
    return createResult(parsed.output)
  } catch (_error) {
    return createResultError(op, "The session list cursor is invalid.")
  }
}

function sessionCursorEncode(cursor: SessionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

export async function sessionRepositoryList(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  options: { cursor?: string; includeArchived: boolean; limit: number; search?: string },
): Promise<
  Result<{
    nextCursor: string | null
    rows: Array<{
      agent: typeof agentTable.$inferSelect
      cursorUpdatedAt: string
      server: typeof serverTable.$inferSelect
      session: typeof sessionTable.$inferSelect
    }>
  }>
> {
  const op = "sessionRepositoryList"
  const decodedCursor = sessionCursorDecode(options.cursor)
  if (!decodedCursor.success) return decodedCursor

  try {
    const conditions = [
      eq(sessionTable.userId, userId),
      eq(serverTable.organizationId, organizationId),
      eq(agentTable.serverId, sessionTable.serverId),
    ]
    if (!options.includeArchived) conditions.push(isNull(sessionTable.archivedAt))
    if (decodedCursor.data !== undefined) {
      const cursorTimestamp = new Date(decodedCursor.data.updatedAt)
      if (Number.isNaN(cursorTimestamp.getTime())) return createResultError(op, "The sessions could not be loaded.")
      const cursorCondition = or(
        lt(sessionTable.updatedAt, cursorTimestamp),
        and(eq(sessionTable.updatedAt, cursorTimestamp), lt(sessionTable.id, decodedCursor.data.id)),
      )
      if (cursorCondition !== undefined) conditions.push(cursorCondition)
    }
    if (options.search !== undefined) {
      const pattern = metadataSearchPatternCreate(options.search)
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

    const rows = await database
      .select({
        agent: agentTable,
        cursorUpdatedAt: sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ', ${sessionTable.updatedAt} / 1000.0, 'unixepoch')`,
        server: serverTable,
        session: sessionTable,
      })
      .from(sessionTable)
      .innerJoin(serverTable, eq(sessionTable.serverId, serverTable.id))
      .innerJoin(agentTable, eq(sessionTable.primaryAgentId, agentTable.id))
      .where(and(...conditions))
      .orderBy(desc(sessionTable.updatedAt), desc(sessionTable.id))
      .limit(options.limit + 1)

    const page = rows.slice(0, options.limit)
    const last = page.at(-1)
    const nextCursor =
      rows.length > options.limit && last !== undefined
        ? sessionCursorEncode({ id: last.session.id, updatedAt: last.cursorUpdatedAt })
        : null

    return createResult({ nextCursor, rows: page })
  } catch (_error) {
    return createResultError(op, "The sessions could not be loaded.")
  }
}
