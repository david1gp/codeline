import { createResultError } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { projectPathReferenceResolve } from "../../project/projectPathReferenceResolve.js"
import { skillSelectionDefaultRepositoryUpsert } from "../db/skillSelectionDefaultRepositoryUpsert.js"
import { skillSelectionDefaultRequestSchema } from "../schema/skillSelectionDefaultRequestSchema.js"

export async function skillSelectionDefaultUpsert(
  database: DatabaseClient,
  userId: string,
  input: unknown,
  options: { projectRootDirs?: readonly string[] } = {},
): ReturnType<typeof skillSelectionDefaultRepositoryUpsert> {
  const parsed = v.safeParse(skillSelectionDefaultRequestSchema, input)
  if (!parsed.success)
    return createResultError("skillSelectionDefaultUpsert", "The skill selection default is invalid.")
  const project = await projectPathReferenceResolve(parsed.output.projectPath, options.projectRootDirs ?? [])
  if (!project.success) return createResultError("skillSelectionDefaultUpsert", "The project path is invalid.")
  return skillSelectionDefaultRepositoryUpsert(database, userId, {
    override: parsed.output.override,
    presetName: parsed.output.presetName,
    projectPath: project.data,
  })
}
