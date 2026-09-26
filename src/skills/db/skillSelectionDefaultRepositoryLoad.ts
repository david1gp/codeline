import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { skillSelectionDefaultSchema } from "../schema/skillSelectionDefaultSchema.js"
import { skillSelectionDefaultTable } from "./skillSelectionDefaultTable.js"

export async function skillSelectionDefaultRepositoryLoad(
  database: DatabaseExecutor,
  userId: string,
  projectPath: string,
): Promise<Result<typeof skillSelectionDefaultTable.$inferSelect | undefined>> {
  const op = "skillSelectionDefaultRepositoryLoad"
  try {
    const [row] = await database
      .select()
      .from(skillSelectionDefaultTable)
      .where(
        and(eq(skillSelectionDefaultTable.userId, userId), eq(skillSelectionDefaultTable.projectPath, projectPath)),
      )
      .limit(1)
    if (row === undefined) return createResult(undefined)

    const parsed = v.safeParse(skillSelectionDefaultSchema, {
      override: row.selectionOverride,
      presetName: row.presetName,
      projectPath: row.projectPath,
    })
    if (!parsed.success) return createResultError(op, "The stored skill selection default is invalid.")
    return createResult({ ...row, selectionOverride: parsed.output.override, presetName: parsed.output.presetName })
  } catch (_error) {
    return createResultError(op, "The skill selection default could not be loaded.")
  }
}
