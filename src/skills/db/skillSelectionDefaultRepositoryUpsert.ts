import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { sql } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { skillSelectionDefaultSchema } from "../schema/skillSelectionDefaultSchema.js"
import { skillSelectionDefaultTable } from "./skillSelectionDefaultTable.js"

export async function skillSelectionDefaultRepositoryUpsert(
  database: DatabaseExecutor,
  userId: string,
  input: { override: unknown; presetName: unknown; projectPath: string },
): Promise<Result<typeof skillSelectionDefaultTable.$inferSelect>> {
  const op = "skillSelectionDefaultRepositoryUpsert"
  const parsed = v.safeParse(skillSelectionDefaultSchema, input)
  if (!parsed.success) return createResultError(op, "The skill selection default input is invalid.")

  const now = new Date()
  try {
    const [row] = await database
      .insert(skillSelectionDefaultTable)
      .values({
        createdAt: now,
        id: uuidv7(),
        projectPath: parsed.output.projectPath,
        presetName: parsed.output.presetName,
        revision: 1,
        selectionOverride: parsed.output.override,
        updatedAt: now,
        userId,
      })
      .onConflictDoUpdate({
        target: [skillSelectionDefaultTable.userId, skillSelectionDefaultTable.projectPath],
        set: {
          presetName: parsed.output.presetName,
          revision: sql`${skillSelectionDefaultTable.revision} + 1`,
          selectionOverride: parsed.output.override,
          updatedAt: now,
        },
      })
      .returning()
    if (row === undefined) return createResultError(op, "The skill selection default could not be saved.")
    return createResult(row)
  } catch (_error) {
    return createResultError(op, "The skill selection default could not be saved.")
  }
}
