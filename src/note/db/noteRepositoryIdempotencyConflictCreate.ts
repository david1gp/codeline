import { createResultErrorCode, type ResultErr } from "@adaptive-ds/result"

export function noteRepositoryIdempotencyConflictCreate(op: string): ResultErr {
  const result = createResultErrorCode(
    op,
    "The idempotency key was already used for a different request.",
    "idempotency_conflict",
  )
  result.statusCode = 409
  return result
}
