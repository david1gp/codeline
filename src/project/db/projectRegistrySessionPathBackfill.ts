import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { projectRegistryPathCanonicalize } from "../projectRegistryPathCanonicalize.js"
import { projectTable } from "./projectTable.js"

export async function projectRegistrySessionPathBackfill(
  database: DatabaseExecutor,
  rootDirs: readonly string[],
): Promise<Result<void>> {
  const op = "projectRegistrySessionPathBackfill"

  try {
    const sessions = await database
      .select({ userId: sessionTable.userId, projectPath: sessionTable.projectPath })
      .from(sessionTable)

    for (const session of sessions) {
      const project = await projectRegistryPathCanonicalize(session.projectPath, rootDirs)
      if (!project.success) continue

      const [existing] = await database
        .select({ id: projectTable.id })
        .from(projectTable)
        .where(and(eq(projectTable.userId, session.userId), eq(projectTable.path, project.data)))
        .limit(1)
      if (existing !== undefined) continue

      await database
        .insert(projectTable)
        .values({
          id: uuidv7(),
          userId: session.userId,
          path: project.data,
          displayName: null,
        })
        .onConflictDoNothing({ target: [projectTable.userId, projectTable.path] })
    }

    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The session project paths could not be backfilled.")
  }
}
