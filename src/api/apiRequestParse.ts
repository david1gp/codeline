import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"

export function apiRequestParse<TSchema extends v.GenericSchema>(
  op: string,
  schema: TSchema,
  input: unknown,
): Result<v.InferOutput<TSchema>> {
  const parsed = v.safeParse(schema, input)
  if (!parsed.success) return createResultError(op, "The request is invalid.")
  return createResult(parsed.output)
}
