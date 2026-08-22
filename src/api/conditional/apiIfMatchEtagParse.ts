import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiEtagSchema, type ApiEtag } from "../schema/apiEtagSchema.js"

export function apiIfMatchEtagParse(header: string | undefined): Result<ApiEtag | undefined> {
  const op = "apiIfMatchEtagParse"
  if (header === undefined) return createResult(undefined)

  const values = header
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  if (values.length !== 1) return createResultError(op, "If-Match must contain one strong ETag.")

  const parsed = v.safeParse(apiEtagSchema, values[0])
  if (!parsed.success) return createResultError(op, "If-Match must contain one strong ETag.")
  return createResult(parsed.output)
}
