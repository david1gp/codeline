import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import {
  type SessionViewAcknowledgementResponse,
  sessionViewAcknowledgementResponseSchema,
} from "./sessionViewAcknowledgementResponseSchema.js"

export function sessionViewAcknowledgementResponseCreate(input: {
  acknowledgedFinishedAt: Date | null
  sessionId: string
}): Result<SessionViewAcknowledgementResponse> {
  const parsed = v.safeParse(sessionViewAcknowledgementResponseSchema, {
    acknowledgedFinishedAt: input.acknowledgedFinishedAt?.toISOString() ?? null,
    sessionId: input.sessionId,
  })
  if (!parsed.success)
    return createResultError("sessionViewAcknowledgementResponseCreate", "The session view response is invalid.")
  return createResult(parsed.output)
}
