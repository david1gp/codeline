import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { sql } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionExecutionSelectionErrorCodes } from "../errors/sessionExecutionSelectionErrorCodes.js"
import { sessionExecutionSelectionDefaultSchema } from "../schema/sessionExecutionSelectionDefaultSchema.js"
import { sessionExecutionSelectionDefaultTable } from "./sessionExecutionSelectionDefaultTable.js"

export async function sessionExecutionSelectionDefaultRepositoryUpsert(
  database: DatabaseExecutor,
  userId: string,
  input: { executionSelection: unknown; projectPath: string },
): Promise<Result<typeof sessionExecutionSelectionDefaultTable.$inferSelect>> {
  const op = "sessionExecutionSelectionDefaultRepositoryUpsert"
  const parsed = v.safeParse(sessionExecutionSelectionDefaultSchema, input)
  if (!parsed.success)
    return createResultErrorCode(
      op,
      "The execution selection default input is invalid.",
      sessionExecutionSelectionErrorCodes.defaultInputInvalid,
    )

  const now = new Date()
  try {
    const [row] = await database
      .insert(sessionExecutionSelectionDefaultTable)
      .values({
        createdAt: now,
        executionSelection: parsed.output.executionSelection,
        id: uuidv7(),
        projectPath: parsed.output.projectPath,
        revision: 1,
        updatedAt: now,
        userId,
      })
      .onConflictDoUpdate({
        target: [sessionExecutionSelectionDefaultTable.userId, sessionExecutionSelectionDefaultTable.projectPath],
        set: {
          executionSelection: parsed.output.executionSelection,
          revision: sql`${sessionExecutionSelectionDefaultTable.revision} + 1`,
          updatedAt: now,
        },
      })
      .returning()
    if (row === undefined)
      return createResultErrorCode(
        op,
        "The execution selection default could not be saved.",
        sessionExecutionSelectionErrorCodes.defaultSaveFailed,
      )
    return createResult(row)
  } catch (_error) {
    return createResultErrorCode(
      op,
      "The execution selection default could not be saved.",
      sessionExecutionSelectionErrorCodes.defaultSaveFailed,
    )
  }
}
