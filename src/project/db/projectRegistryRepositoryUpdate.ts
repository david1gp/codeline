import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectTable, type Project } from "./projectTable.js"

const projectRegistryRepositoryUpdateInputSchema = v.strictObject({ displayName: v.nullable(v.string()) })

export async function projectRegistryRepositoryUpdate(
  database: DatabaseExecutor,
  userId: string,
  projectId: string,
  input: unknown,
): Promise<Result<Project>> {
  const op = "projectRegistryRepositoryUpdate"
  const parsed = v.safeParse(
    projectRegistryRepositoryUpdateInputSchema,
    typeof input === "string" || input === null ? { displayName: input } : input,
  )
  if (!parsed.success) return createResultError(op, "The project update input is invalid.")

  try {
    const [project] = await database
      .update(projectTable)
      .set({ displayName: parsed.output.displayName, updatedAt: new Date() })
      .where(and(eq(projectTable.id, projectId), eq(projectTable.userId, userId)))
      .returning()
    if (project === undefined) return createResultError(op, "The project could not be found.")
    return createResult(project)
  } catch (_error) {
    return createResultError(op, "The project could not be updated.")
  }
}
