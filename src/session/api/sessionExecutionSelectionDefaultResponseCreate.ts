import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { sessionExecutionSelectionDefaultTable } from "../db/sessionExecutionSelectionDefaultTable.js"
import {
  type SessionExecutionSelectionDefaultResponse,
  sessionExecutionSelectionDefaultResponseSchema,
} from "./sessionExecutionSelectionDefaultResponseSchema.js"

function timestampSerialize(value: Date | string): string | undefined {
  if (typeof value === "string") return value
  if (Number.isNaN(value.getTime())) return undefined
  return value.toISOString()
}

export function sessionExecutionSelectionDefaultResponseCreate(
  row: typeof sessionExecutionSelectionDefaultTable.$inferSelect,
): Result<SessionExecutionSelectionDefaultResponse> {
  const op = "sessionExecutionSelectionDefaultResponseCreate"
  const createdAt = timestampSerialize(row.createdAt)
  const updatedAt = timestampSerialize(row.updatedAt)
  if (createdAt === undefined || updatedAt === undefined)
    return createResultError(op, "The execution selection default timestamp is invalid.")

  const parsed = v.safeParse(sessionExecutionSelectionDefaultResponseSchema, {
    createdAt,
    executionSelection: row.executionSelection,
    projectPath: row.projectPath,
    revision: row.revision,
    updatedAt,
  })
  if (!parsed.success) return createResultError(op, "The execution selection default response is invalid.")
  return createResult(parsed.output)
}
