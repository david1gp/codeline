import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"
import { type ProjectFolder, projectFolderTable } from "./projectFolderTable.js"

const projectFolderRepositoryNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(projectDiscoveryLimits.maximumLabelLength),
)

export async function projectFolderRepositoryCreate(
  database: DatabaseExecutor,
  userId: string,
  input: unknown,
): Promise<Result<ProjectFolder>> {
  const op = "projectFolderRepositoryCreate"
  const parsed = v.safeParse(
    projectFolderRepositoryNameSchema,
    typeof input === "object" && input !== null && "name" in input ? input.name : input,
  )
  if (!parsed.success) return createResultError(op, "The project folder name is invalid.")

  try {
    const [existing] = await database
      .select({ id: projectFolderTable.id })
      .from(projectFolderTable)
      .where(and(eq(projectFolderTable.userId, userId), eq(projectFolderTable.name, parsed.output)))
      .limit(1)
    if (existing !== undefined) return createResultError(op, "The project folder name is already in use.")

    const [folder] = await database
      .insert(projectFolderTable)
      .values({ id: uuidv7(), name: parsed.output, userId })
      .returning()
    if (folder === undefined) return createResultError(op, "The project folder could not be created.")
    return createResult(folder)
  } catch (error) {
    if (projectFolderNameConflict(error)) return createResultError(op, "The project folder name is already in use.")
    return createResultError(op, "The project folder could not be created.")
  }
}

function projectFolderNameConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes("project_folder.user_id") && error.message.includes("project_folder.name")
}
