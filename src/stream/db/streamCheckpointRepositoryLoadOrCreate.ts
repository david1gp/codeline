import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { streamCheckpointTable } from "./streamCheckpointTable.js"

export async function streamCheckpointRepositoryLoadOrCreate(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  streamId: string,
): Promise<Result<{ created: boolean; checkpoint: typeof streamCheckpointTable.$inferSelect }>> {
  const op = "streamCheckpointRepositoryLoadOrCreate"
  if (streamId.length === 0) return createResultError(op, "The stream ID is required.")

  try {
    const [session] = await database
      .select({ archivedAt: sessionTable.archivedAt })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .for("update")
      .limit(1)
    if (session === undefined) return createResultError(op, "The session could not be found.")

    const [existing] = await database
      .select()
      .from(streamCheckpointTable)
      .where(and(eq(streamCheckpointTable.sessionId, sessionId), eq(streamCheckpointTable.streamId, streamId)))
      .limit(1)
    if (existing !== undefined) return createResult({ created: false, checkpoint: existing })
    if (session.archivedAt !== null) return createResultError(op, "The session is archived.")

    const [created] = await database
      .insert(streamCheckpointTable)
      .values({ id: uuidv7(), sessionId, streamId, lastSequence: 0 })
      .onConflictDoNothing({ target: [streamCheckpointTable.sessionId, streamCheckpointTable.streamId] })
      .returning()
    if (created !== undefined) return createResult({ created: true, checkpoint: created })

    const [concurrent] = await database
      .select()
      .from(streamCheckpointTable)
      .where(and(eq(streamCheckpointTable.sessionId, sessionId), eq(streamCheckpointTable.streamId, streamId)))
      .limit(1)
    if (concurrent !== undefined) return createResult({ created: false, checkpoint: concurrent })
    return createResultError(op, "The stream checkpoint could not be created.")
  } catch (_error) {
    return createResultError(op, "The stream checkpoint could not be loaded.")
  }
}
