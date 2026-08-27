import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { agentInstructionsSnapshotResolve } from "../../instructions/actions/agentInstructionsSnapshotResolve.js"
import { runExecutionManifestSchema } from "../../run/schema/runExecutionManifestSchema.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { skillSelectionSchema } from "../../skills/schema/skillSelectionSchema.js"
import { sessionMetadataSchema } from "../schema/sessionMetadataSchema.js"
import { sessionTable } from "./sessionTable.js"

export async function sessionRepositoryLoad(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<
  Result<{
    agent: typeof agentTable.$inferSelect
    server: typeof serverTable.$inferSelect
    session: typeof sessionTable.$inferSelect
  }>
> {
  const op = "sessionRepositoryLoad"

  try {
    const [row] = await database
      .select({ agent: agentTable, server: serverTable, session: sessionTable })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .innerJoin(
        agentTable,
        and(eq(sessionTable.primaryAgentId, agentTable.id), eq(agentTable.serverId, sessionTable.serverId)),
      )
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)

    if (row !== undefined) {
      const instructionSnapshot = agentInstructionsSnapshotResolve(row.session.instructionSnapshot)
      if (!instructionSnapshot.success) return createResultError(op, "The session instruction snapshot is invalid.")
      const skillSelection = v.safeParse(skillSelectionSchema, row.session.skillSelection)
      if (!skillSelection.success) return createResultError(op, "The session skill selection is invalid.")
      const metadata = v.safeParse(sessionMetadataSchema, row.session.metadata)
      if (!metadata.success) return createResultError(op, "The session metadata is invalid.")
      const executionManifest =
        row.session.executionManifest === null
          ? { success: true as const, output: null }
          : v.safeParse(runExecutionManifestSchema, row.session.executionManifest)
      if (!executionManifest.success) return createResultError(op, "The session execution manifest is invalid.")
      return createResult({
        ...row,
        session: {
          ...row.session,
          executionManifest: executionManifest.output,
          instructionSnapshot: instructionSnapshot.data,
          metadata: metadata.output,
          skillSelection: skillSelection.output,
        },
      })
    }
    return createResultError(op, "The session could not be found.")
  } catch (_error) {
    return createResultError(op, "The session could not be loaded.")
  }
}
