import { createResult, type Result } from "@adaptive-ds/result"
import * as v from "valibot"

/**
 * Schema-constrained subagent results. The child still returns text, but when
 * that text is JSON we validate it here so parents consume typed findings
 * instead of parsing prose. Pairs with background delegations: research and
 * review children return `{ findings: [...] }`-shaped payloads.
 */
export function structuredTaskResultParse<T extends v.GenericSchema>(
  text: string,
  schema: T,
): Result<v.InferOutput<T>> {
  const op = "structuredTaskResultParse"
  const trimmed = text.trim()
  if (trimmed.length === 0) return { errorMessage: "The structured result is empty.", op, success: false }
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(trimmed)
  } catch {
    // Allow a single fenced code block, as models often wrap JSON answers.
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
    if (fenced?.[1] === undefined) return { errorMessage: "The result is not JSON.", op, success: false }
    try {
      parsedJson = JSON.parse(fenced[1] ?? "")
    } catch {
      return { errorMessage: "The result is not valid JSON.", op, success: false }
    }
  }
  const validated = v.safeParse(schema, parsedJson)
  if (!validated.success)
    return { errorMessage: "The structured result does not match the expected schema.", op, success: false }
  return createResult(validated.output)
}

export const subagentFindingsSchema = v.strictObject({
  findings: v.array(
    v.strictObject({
      detail: v.string(),
      file: v.optional(v.string()),
      severity: v.picklist(["info", "low", "medium", "high"]),
      title: v.string(),
    }),
  ),
})

export type SubagentFindings = v.InferOutput<typeof subagentFindingsSchema>
