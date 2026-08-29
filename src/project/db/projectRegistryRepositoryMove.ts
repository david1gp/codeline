import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectRegistryMoveRequestSchema } from "../api/projectRegistryMoveRequestSchema.js"
import { projectFolderTable } from "./projectFolderTable.js"
import { type Project, projectTable } from "./projectTable.js"

export async function projectRegistryRepositoryMove(
  database: DatabaseExecutor,
  userId: string,
  projectId: string,
  input: unknown,
): Promise<Result<Project>> {
  const op = "projectRegistryRepositoryMove"
  const parsed = v.safeParse(projectRegistryMoveRequestSchema, input)
  if (!parsed.success) return createResultError(op, "The project move input is invalid.")

  try {
    if (parsed.output.folderId !== null) {
      const [folder] = await database
        .select({ id: projectFolderTable.id })
        .from(projectFolderTable)
        .where(and(eq(projectFolderTable.id, parsed.output.folderId), eq(projectFolderTable.userId, userId)))
        .limit(1)
      if (folder === undefined) return createResultError(op, "The project folder could not be found.")
    }

    const [project] = await database
      .update(projectTable)
      .set({ parentFolderId: parsed.output.folderId, updatedAt: new Date() })
      .where(and(eq(projectTable.id, projectId), eq(projectTable.userId, userId)))
      .returning()
    if (project === undefined) return createResultError(op, "The project could not be found.")
    return createResult(project)
  } catch (_error) {
    return createResultError(op, "The project could not be moved.")
  }
}
