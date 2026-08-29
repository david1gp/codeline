import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, desc, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionCompactionTable } from "./sessionCompactionTable.js"

const sessionCompactionBeginInputSchema = v.object({
  coveredSequence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  id: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  sourceRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

type SessionCompactionBeginResult = {
  compaction: typeof sessionCompactionTable.$inferSelect
  created: boolean
}

export async function sessionCompactionRepositoryBegin(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
  input: { coveredSequence: number; id?: string; sourceRevision: number },
): Promise<Result<SessionCompactionBeginResult>> {
  const op = "sessionCompactionRepositoryBegin"
  const parsedInput = v.safeParse(sessionCompactionBeginInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The compaction begin input is invalid.")

  const id = parsedInput.output.id ?? uuidv7()
  return databaseExecutorTransactionRun<SessionCompactionBeginResult>(database, async (transaction) => {
    try {
      const [session] = await transaction
        .select({ session: sessionTable })
        .from(sessionTable)
        .innerJoin(
          serverTable,
          and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
        )
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (session === undefined) return createResultError(op, "The session could not be found.")

      const [existing] = await transaction
        .select()
        .from(sessionCompactionTable)
        .where(eq(sessionCompactionTable.id, id))
        .limit(1)
      if (existing !== undefined) {
        if (
          existing.sessionId !== sessionId ||
          existing.sourceRevision !== parsedInput.output.sourceRevision ||
          existing.coveredSequence !== parsedInput.output.coveredSequence
        )
          return sessionCompactionConflict(op, "The compaction identifier was already used for a different operation.")
        return createResult<SessionCompactionBeginResult>({ compaction: existing, created: false })
      }

      const [active] = await transaction
        .select()
        .from(sessionCompactionTable)
        .where(and(eq(sessionCompactionTable.sessionId, sessionId), eq(sessionCompactionTable.status, "running")))
        .limit(1)
      if (active !== undefined) return sessionCompactionConflict(op, "A compaction is already active for the session.")

      if (parsedInput.output.sourceRevision !== session.session.revision)
        return createResultError(op, "The compaction source revision does not match the session revision.")

      const [latest] = await transaction
        .select({
          compactionVersion: sessionCompactionTable.compactionVersion,
          coveredSequence: sessionCompactionTable.coveredSequence,
          sourceRevision: sessionCompactionTable.sourceRevision,
        })
        .from(sessionCompactionTable)
        .where(eq(sessionCompactionTable.sessionId, sessionId))
        .orderBy(desc(sessionCompactionTable.compactionVersion))
        .limit(1)
      if (
        latest !== undefined &&
        (parsedInput.output.sourceRevision < latest.sourceRevision ||
          parsedInput.output.coveredSequence < latest.coveredSequence)
      )
        return createResultError(op, "The compaction source cannot move backwards.")

      const version = (latest?.compactionVersion ?? 0) + 1
      const [compaction] = await transaction
        .insert(sessionCompactionTable)
        .values({
          compactionVersion: version,
          id,
          sourceRevision: parsedInput.output.sourceRevision,
          coveredSequence: parsedInput.output.coveredSequence,
          sessionId,
          status: "running",
          startedAt: new Date(),
        })
        .returning()
      if (compaction === undefined) return createResultError(op, "The compaction could not be started.")
      return createResult<SessionCompactionBeginResult>({ compaction, created: true })
    } catch (_error) {
      return createResultError(op, "The compaction could not be started.")
    }
  })
}

function sessionCompactionConflict(op: string, errorMessage: string) {
  const result = createResultError(op, errorMessage)
  result.statusCode = 409
  return result
}
