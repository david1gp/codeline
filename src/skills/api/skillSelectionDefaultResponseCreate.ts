import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { skillSelectionDefaultTable } from "../db/skillSelectionDefaultTable.js"
import {
  type SkillSelectionDefaultResponse,
  skillSelectionDefaultResponseSchema,
} from "./skillSelectionDefaultResponseSchema.js"

function timestampSerialize(value: Date | string): string | undefined {
  if (typeof value === "string") return value
  if (Number.isNaN(value.getTime())) return undefined
  return value.toISOString()
}

export function skillSelectionDefaultResponseCreate(
  row: typeof skillSelectionDefaultTable.$inferSelect,
): Result<SkillSelectionDefaultResponse> {
  const op = "skillSelectionDefaultResponseCreate"
  const createdAt = timestampSerialize(row.createdAt)
  const updatedAt = timestampSerialize(row.updatedAt)
  if (createdAt === undefined || updatedAt === undefined)
    return createResultError(op, "The skill selection default timestamp is invalid.")
  const response = v.safeParse(skillSelectionDefaultResponseSchema, {
    createdAt,
    override: row.selectionOverride,
    presetName: row.presetName,
    projectPath: row.projectPath,
    revision: row.revision,
    updatedAt,
  })
  if (!response.success) return createResultError(op, "The skill selection default response is invalid.")
  return createResult(response.output)
}
