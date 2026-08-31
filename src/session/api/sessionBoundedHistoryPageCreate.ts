import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { SessionBoundedHistoryPage } from "./sessionBoundedHistoryPageSchema.js"
import { sessionBoundedHistoryPageSchema } from "./sessionBoundedHistoryPageSchema.js"

export function sessionBoundedHistoryPageCreate(input: {
  hasMore: boolean
  nextCursor: string | null
  semanticSteps: SessionBoundedHistoryPage["semanticSteps"]
  throughSeq: number
}): Result<SessionBoundedHistoryPage> {
  const op = "sessionBoundedHistoryPageCreate"
  const parsed = v.safeParse(sessionBoundedHistoryPageSchema, input)
  if (!parsed.success) return createResultError(op, "The bounded session history page is invalid.")
  return createResult(parsed.output)
}
