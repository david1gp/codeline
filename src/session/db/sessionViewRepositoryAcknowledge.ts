import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runDelegationTable } from "../../run/db/runDelegationTable.js"
import { runTable } from "../../run/db/runTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "./sessionTable.js"
import { sessionViewTable } from "./sessionViewTable.js"

const sessionViewTerminalStatuses = ["succeeded", "failed", "aborted"]

export async function sessionViewRepositoryAcknowledge(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<Result<{ acknowledgedFinishedAt: Date | null; changed: boolean }>> {
  const op = "sessionViewRepositoryAcknowledge"

  try {
    const [session] = await database
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (session === undefined) return createResultError(op, "The session could not be found.")

    const [latestTerminalRun] = await database
      .select({ finishedAt: runTable.finishedAt })
      .from(runTable)
      .leftJoin(
        runDelegationTable,
        and(
          eq(runDelegationTable.childRunId, runTable.id),
          eq(runDelegationTable.userId, userId),
          eq(runDelegationTable.sessionId, sessionId),
        ),
      )
      .where(
        and(
          eq(runTable.userId, userId),
          eq(runTable.sessionId, sessionId),
          inArray(runTable.status, sessionViewTerminalStatuses),
          isNotNull(runTable.finishedAt),
          isNull(runDelegationTable.childRunId),
        ),
      )
      .orderBy(desc(runTable.finishedAt), desc(runTable.id))
      .limit(1)

    const [currentView] = await database
      .select()
      .from(sessionViewTable)
      .where(and(eq(sessionViewTable.userId, userId), eq(sessionViewTable.sessionId, sessionId)))
      .limit(1)
    const finishedAt = latestTerminalRun?.finishedAt ?? null
    if (finishedAt === null || (currentView !== undefined && currentView.acknowledgedFinishedAt >= finishedAt))
      return createResult({ acknowledgedFinishedAt: currentView?.acknowledgedFinishedAt ?? null, changed: false })

    const now = new Date()
    if (currentView === undefined) {
      const [created] = await database
        .insert(sessionViewTable)
        .values({
          acknowledgedFinishedAt: finishedAt,
          createdAt: now,
          sessionId,
          updatedAt: now,
          userId,
        })
        .returning()
      if (created === undefined) return createResultError(op, "The session view could not be saved.")
      return createResult({ acknowledgedFinishedAt: created.acknowledgedFinishedAt, changed: true })
    }

    const [updated] = await database
      .update(sessionViewTable)
      .set({ acknowledgedFinishedAt: finishedAt, updatedAt: now })
      .where(
        and(
          eq(sessionViewTable.userId, userId),
          eq(sessionViewTable.sessionId, sessionId),
          lt(sessionViewTable.acknowledgedFinishedAt, finishedAt),
        ),
      )
      .returning()
    if (updated === undefined) return createResultError(op, "The session view could not be saved.")
    return createResult({ acknowledgedFinishedAt: updated.acknowledgedFinishedAt, changed: true })
  } catch (_error) {
    return createResultError(op, "The session view could not be saved.")
  }
}
