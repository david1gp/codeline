import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { sessionExecutionSelectionErrorCodes } from "../errors/sessionExecutionSelectionErrorCodes.js"
import { sessionExecutionSelectionDefaultSchema } from "../schema/sessionExecutionSelectionDefaultSchema.js"
import { sessionExecutionSelectionDefaultTable } from "./sessionExecutionSelectionDefaultTable.js"

export async function sessionExecutionSelectionDefaultRepositoryLoad(
  database: DatabaseExecutor,
  userId: string,
  projectPath: string,
): Promise<Result<typeof sessionExecutionSelectionDefaultTable.$inferSelect | undefined>> {
  const op = "sessionExecutionSelectionDefaultRepositoryLoad"

  try {
    const [row] = await database
      .select()
      .from(sessionExecutionSelectionDefaultTable)
      .where(
        and(
          eq(sessionExecutionSelectionDefaultTable.userId, userId),
          eq(sessionExecutionSelectionDefaultTable.projectPath, projectPath),
        ),
      )
      .limit(1)
    if (row === undefined) return createResult(undefined)

    const parsed = v.safeParse(sessionExecutionSelectionDefaultSchema, {
      executionSelection: row.executionSelection,
      projectPath: row.projectPath,
    })
    if (!parsed.success)
      return createResultErrorCode(
        op,
        "The stored execution selection default is invalid.",
        sessionExecutionSelectionErrorCodes.storedDefaultInvalid,
      )
    return createResult({ ...row, executionSelection: parsed.output.executionSelection })
  } catch (_error) {
    return createResultErrorCode(
      op,
      "The execution selection default could not be loaded.",
      sessionExecutionSelectionErrorCodes.defaultLoadFailed,
    )
  }
}
