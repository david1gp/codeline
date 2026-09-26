import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionExecutionSelectionErrorCodes } from "../errors/sessionExecutionSelectionErrorCodes.js"
import { sessionExecutionSelectionDefaultTable } from "./sessionExecutionSelectionDefaultTable.js"

export async function sessionExecutionSelectionDefaultRepositoryDelete(
  database: DatabaseExecutor,
  userId: string,
  projectPath: string,
): Promise<Result<typeof sessionExecutionSelectionDefaultTable.$inferSelect | undefined>> {
  const op = "sessionExecutionSelectionDefaultRepositoryDelete"

  try {
    const [row] = await database
      .delete(sessionExecutionSelectionDefaultTable)
      .where(
        and(
          eq(sessionExecutionSelectionDefaultTable.userId, userId),
          eq(sessionExecutionSelectionDefaultTable.projectPath, projectPath),
        ),
      )
      .returning()
    return createResult(row)
  } catch (_error) {
    return createResultErrorCode(
      op,
      "The execution selection default could not be deleted.",
      sessionExecutionSelectionErrorCodes.defaultDeleteFailed,
    )
  }
}
