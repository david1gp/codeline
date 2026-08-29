import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, desc, eq, lt, sql } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { sessionCompactionCoverageValidate } from "./sessionCompactionCoverageValidate.js"
import { sessionCompactionTable } from "./sessionCompactionTable.js"

const sessionCompactionFinalizeInputSchema = v.object({
  compactionId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  summary: v.pipe(v.string(), v.trim(), v.minLength(1)),
})

type SessionCompactionFinalizeResult = {
  compaction: typeof sessionCompactionTable.$inferSelect
  session: typeof sessionTable.$inferSelect
  changed: boolean
}

export async function sessionCompactionRepositoryFinalize(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
  input: { compactionId: string; summary: string },
): Promise<Result<SessionCompactionFinalizeResult>> {
  const op = "sessionCompactionRepositoryFinalize"
  const parsedInput = v.safeParse(sessionCompactionFinalizeInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The compaction finalize input is invalid.")

  return databaseExecutorTransactionRun<SessionCompactionFinalizeResult>(database, async (transaction) => {
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

      const [compaction] = await transaction
        .select()
        .from(sessionCompactionTable)
        .where(
          and(
            eq(sessionCompactionTable.id, parsedInput.output.compactionId),
            eq(sessionCompactionTable.sessionId, sessionId),
          ),
        )
        .limit(1)
      if (compaction === undefined) return createResultError(op, "The compaction could not be found.")
      if (compaction.status === "succeeded") {
        if (compaction.summary !== parsedInput.output.summary)
          return sessionCompactionConflict(op, "The compaction has already been finalized with different content.")
        return createResult<SessionCompactionFinalizeResult>({ changed: false, compaction, session: session.session })
      }
      if (compaction.status !== "running") return sessionCompactionConflict(op, "The compaction is not active.")
      if (session.session.revision < compaction.sourceRevision)
        return createResultError(op, "The session revision is older than the compaction source.")
      if (session.session.revision > compaction.sourceRevision)
        return sessionCompactionConflict(op, "The session changed during compaction.")

      const coverage = await sessionCompactionCoverageValidate(transaction, sessionId, compaction.coveredSequence)
      if (!coverage.success) return createResultError(op, coverage.errorMessage)

      const [previous] = await transaction
        .select({
          coveredSequence: sessionCompactionTable.coveredSequence,
          sourceRevision: sessionCompactionTable.sourceRevision,
        })
        .from(sessionCompactionTable)
        .where(
          and(
            eq(sessionCompactionTable.sessionId, sessionId),
            eq(sessionCompactionTable.status, "succeeded"),
            lt(sessionCompactionTable.compactionVersion, compaction.compactionVersion),
          ),
        )
        .orderBy(desc(sessionCompactionTable.compactionVersion))
        .limit(1)
      if (
        previous !== undefined &&
        (compaction.sourceRevision < previous.sourceRevision || compaction.coveredSequence < previous.coveredSequence)
      )
        return createResultError(op, "The compaction source cannot move backwards.")

      const now = new Date()
      const [updatedCompaction] = await transaction
        .update(sessionCompactionTable)
        .set({ completedAt: now, status: "succeeded", summary: parsedInput.output.summary })
        .where(
          and(
            eq(sessionCompactionTable.id, compaction.id),
            eq(sessionCompactionTable.sessionId, sessionId),
            eq(sessionCompactionTable.status, "running"),
          ),
        )
        .returning()
      if (updatedCompaction === undefined) return createResultError(op, "The compaction could not be finalized.")

      const [updatedSession] = await transaction
        .update(sessionTable)
        .set({ revision: sql`${sessionTable.revision} + 1`, updatedAt: now })
        .where(
          and(
            eq(sessionTable.id, sessionId),
            eq(sessionTable.userId, userId),
            eq(sessionTable.revision, compaction.sourceRevision),
          ),
        )
        .returning()
      if (updatedSession === undefined) return createResultError(op, "The session could not be advanced.")

      return createResult<SessionCompactionFinalizeResult>({
        changed: true,
        compaction: updatedCompaction,
        session: updatedSession,
      })
    } catch (_error) {
      return createResultError(op, "The compaction could not be finalized.")
    }
  })
}

function sessionCompactionConflict(op: string, errorMessage: string) {
  const result = createResultError(op, errorMessage)
  result.statusCode = 409
  return result
}
