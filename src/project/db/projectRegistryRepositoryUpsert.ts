import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { type Project, projectTable } from "./projectTable.js"

const projectRegistryRepositoryUpsertInputSchema = v.strictObject({
  displayName: v.optional(v.nullable(v.string())),
  path: v.string(),
})

export async function projectRegistryRepositoryUpsert(
  database: DatabaseExecutor,
  userId: string,
  input: unknown,
  displayName?: string | null,
): Promise<Result<Project>> {
  const op = "projectRegistryRepositoryUpsert"
  const parsed = v.safeParse(
    projectRegistryRepositoryUpsertInputSchema,
    typeof input === "string" ? { displayName, path: input } : input,
  )
  if (!parsed.success) return createResultError(op, "The project registration input is invalid.")
  if (!path.isAbsolute(parsed.output.path) || path.resolve(parsed.output.path) !== parsed.output.path) {
    return createResultError(op, "The project path must be canonical and absolute.")
  }

  const now = new Date()
  try {
    const [project] = await database
      .insert(projectTable)
      .values({
        createdAt: now,
        displayName: parsed.output.displayName ?? null,
        id: uuidv7(),
        path: parsed.output.path,
        updatedAt: now,
        userId,
      })
      .onConflictDoUpdate({
        target: [projectTable.userId, projectTable.path],
        set: {
          ...(parsed.output.displayName === undefined ? {} : { displayName: parsed.output.displayName }),
          updatedAt: now,
        },
      })
      .returning()
    if (project === undefined) return createResultError(op, "The project could not be saved.")
    return createResult(project)
  } catch (_error) {
    return createResultError(op, "The project could not be saved.")
  }
}
