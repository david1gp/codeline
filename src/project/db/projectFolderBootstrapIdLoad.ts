import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import type { ProjectFolderBootstrapKey } from "../projectFolderBootstrapKeySchema.js"
import { projectFolderTable } from "./projectFolderTable.js"

export async function projectFolderBootstrapIdLoad(
  database: DatabaseExecutor,
  userId: string,
  key: ProjectFolderBootstrapKey,
): Promise<Result<string | undefined>> {
  const op = "projectFolderBootstrapIdLoad"

  try {
    const [folder] = await database
      .select({ id: projectFolderTable.id })
      .from(projectFolderTable)
      .where(and(eq(projectFolderTable.userId, userId), eq(projectFolderTable.bootstrapKey, key)))
      .limit(1)
    return createResult(folder?.id)
  } catch (_error) {
    return createResultError(op, "The project folder could not be loaded.")
  }
}
