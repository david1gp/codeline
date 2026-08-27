import { createResult, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { skillSelectionDefaultTable } from "./skillSelectionDefaultTable.js"

export async function skillSelectionDefaultRepositoryDelete(
  database: DatabaseExecutor,
  userId: string,
  projectPath: string,
): Promise<Result<typeof skillSelectionDefaultTable.$inferSelect | undefined>> {
  const op = "skillSelectionDefaultRepositoryDelete"
  try {
    const [row] = await database
      .delete(skillSelectionDefaultTable)
      .where(
        and(eq(skillSelectionDefaultTable.userId, userId), eq(skillSelectionDefaultTable.projectPath, projectPath)),
      )
      .returning()
    return createResult(row)
  } catch (_error) {
    return { success: false, op, errorMessage: "The skill selection default could not be deleted." }
  }
}
