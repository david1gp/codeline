import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, ne } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"
import type { ProjectFolderId } from "../projectFolderIdSchema.js"
import { type ProjectFolder, projectFolderTable } from "./projectFolderTable.js"

const projectFolderRepositoryNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(projectDiscoveryLimits.maximumLabelLength),
)

export async function projectFolderRepositoryUpdate(
  database: DatabaseExecutor,
  userId: string,
  folderId: ProjectFolderId,
  input: unknown,
): Promise<Result<ProjectFolder>> {
  const op = "projectFolderRepositoryUpdate"
  const parsed = v.safeParse(
    projectFolderRepositoryNameSchema,
    typeof input === "object" && input !== null && "name" in input ? input.name : input,
  )
  if (!parsed.success) return createResultError(op, "The project folder name is invalid.")

  try {
    const [existingFolder] = await database
      .select({ id: projectFolderTable.id })
      .from(projectFolderTable)
      .where(and(eq(projectFolderTable.id, folderId), eq(projectFolderTable.userId, userId)))
      .limit(1)
    if (existingFolder === undefined) return createResultError(op, "The project folder could not be found.")

    const [duplicate] = await database
      .select({ id: projectFolderTable.id })
      .from(projectFolderTable)
      .where(
        and(
          eq(projectFolderTable.userId, userId),
          eq(projectFolderTable.name, parsed.output),
          ne(projectFolderTable.id, folderId),
        ),
      )
      .limit(1)
    if (duplicate !== undefined) return createResultError(op, "The project folder name is already in use.")

    const [folder] = await database
      .update(projectFolderTable)
      .set({ name: parsed.output, updatedAt: new Date() })
      .where(and(eq(projectFolderTable.id, folderId), eq(projectFolderTable.userId, userId)))
      .returning()
    if (folder === undefined) return createResultError(op, "The project folder could not be found.")
    return createResult(folder)
  } catch (error) {
    if (projectFolderNameConflict(error)) return createResultError(op, "The project folder name is already in use.")
    return createResultError(op, "The project folder could not be updated.")
  }
}

function projectFolderNameConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes("project_folder.user_id") && error.message.includes("project_folder.name")
}
