import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { sessionCompactionTable } from "./sessionCompactionTable.js"

const sessionCompactionFailInputSchema = v.object({
  compactionId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  errorMessage: v.pipe(v.string(), v.trim(), v.minLength(1)),
})

type SessionCompactionFailResult = {
  compaction: typeof sessionCompactionTable.$inferSelect
  changed: boolean
}

export async function sessionCompactionRepositoryFail(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
  input: { compactionId: string; errorMessage: string },
): Promise<Result<SessionCompactionFailResult>> {
  const op = "sessionCompactionRepositoryFail"
  const parsedInput = v.safeParse(sessionCompactionFailInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The compaction failure input is invalid.")

  return databaseExecutorTransactionRun<SessionCompactionFailResult>(database, async (transaction) => {
    try {
      const [session] = await transaction
        .select({ id: sessionTable.id })
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
      if (compaction.status === "failed") {
        if (compaction.errorMessage !== parsedInput.output.errorMessage)
          return sessionCompactionConflict(op, "The compaction has already failed with different details.")
        return createResult<SessionCompactionFailResult>({ changed: false, compaction })
      }
      if (compaction.status !== "running") return sessionCompactionConflict(op, "The compaction is not active.")

      const [updated] = await transaction
        .update(sessionCompactionTable)
        .set({ completedAt: new Date(), errorMessage: parsedInput.output.errorMessage, status: "failed" })
        .where(
          and(
            eq(sessionCompactionTable.id, compaction.id),
            eq(sessionCompactionTable.sessionId, sessionId),
            eq(sessionCompactionTable.status, "running"),
          ),
        )
        .returning()
      if (updated === undefined) return createResultError(op, "The compaction could not be marked failed.")
      return createResult<SessionCompactionFailResult>({ changed: true, compaction: updated })
    } catch (_error) {
      return createResultError(op, "The compaction could not be marked failed.")
    }
  })
}

function sessionCompactionConflict(op: string, errorMessage: string) {
  const result = createResultError(op, errorMessage)
  result.statusCode = 409
  return result
}
