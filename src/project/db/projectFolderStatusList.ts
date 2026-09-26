import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, isNotNull, isNull } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runDelegationTable } from "../../run/db/runDelegationTable.js"
import { runTable } from "../../run/db/runTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { sessionViewTable } from "../../session/db/sessionViewTable.js"
import type { ProjectFolderStatus } from "./projectFolderStatus.js"
import { projectTable } from "./projectTable.js"

const activeRunStatuses = ["accepted", "running"] as const
const endedRunStatuses = ["succeeded", "failed", "aborted"] as const

export async function projectFolderStatusList(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
): Promise<Result<ProjectFolderStatus[]>> {
  const op = "projectFolderStatusList"

  try {
    const rows = await database
      .select({
        activeRunStatus: runTable.status,
        acknowledgedFinishedAt: sessionViewTable.acknowledgedFinishedAt,
        finishedAt: runTable.finishedAt,
        folderId: projectTable.parentFolderId,
        projectId: projectTable.id,
      })
      .from(projectTable)
      .leftJoin(
        sessionTable,
        and(
          eq(sessionTable.userId, projectTable.userId),
          eq(sessionTable.projectPath, projectTable.path),
          isNull(sessionTable.archivedAt),
        ),
      )
      .leftJoin(
        serverTable,
        and(eq(serverTable.id, sessionTable.serverId), eq(serverTable.organizationId, organizationId)),
      )
      .leftJoin(
        runTable,
        and(
          eq(runTable.userId, projectTable.userId),
          eq(runTable.sessionId, sessionTable.id),
          isNotNull(serverTable.id),
        ),
      )
      .leftJoin(
        runDelegationTable,
        and(
          eq(runDelegationTable.childRunId, runTable.id),
          eq(runDelegationTable.userId, projectTable.userId),
          eq(runDelegationTable.sessionId, sessionTable.id),
        ),
      )
      .leftJoin(
        sessionViewTable,
        and(
          eq(sessionViewTable.userId, projectTable.userId),
          eq(sessionViewTable.sessionId, sessionTable.id),
          isNotNull(serverTable.id),
        ),
      )
      .where(and(eq(projectTable.userId, userId), isNull(runDelegationTable.childRunId)))

    const statuses = new Map<string, ProjectFolderStatus>()
    for (const row of rows) {
      const status = statuses.get(row.projectId) ?? {
        active: false,
        folderId: row.folderId,
        projectId: row.projectId,
        unseenEnded: false,
      }
      if (activeRunStatuses.includes(row.activeRunStatus as (typeof activeRunStatuses)[number])) status.active = true
      if (
        endedRunStatuses.includes(row.activeRunStatus as (typeof endedRunStatuses)[number]) &&
        row.finishedAt !== null &&
        (row.acknowledgedFinishedAt === null || row.finishedAt > row.acknowledgedFinishedAt)
      )
        status.unseenEnded = true
      statuses.set(row.projectId, status)
    }
    return createResult([...statuses.values()])
  } catch (_error) {
    return createResultError(op, "The project folder statuses could not be loaded.")
  }
}
