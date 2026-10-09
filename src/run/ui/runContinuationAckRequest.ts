import { createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  runContinuationAckResponseSchema,
  type RunContinuationAckResponse,
} from "../api/runContinuationAckResponseSchema.js"

/**
 * Typed `POST /api/sessions/:sessionId/delegations/:delegationId/continuation-ack`.
 * Acknowledges that a background result was delivered to the parent session
 * via a continuation run, silencing further automatic delivery attempts.
 */
export async function runContinuationAckRequest(
  sessionId: string,
  delegationId: string,
  dependencies: {
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    signal?: AbortSignal
  } = {},
): Promise<Result<RunContinuationAckResponse>> {
  const op = "runContinuationAckRequest"
  if (sessionId.trim().length === 0) return createResultError(op, "The session identifier is required.")
  if (delegationId.trim().length === 0) return createResultError(op, "The delegation identifier is required.")
  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.post({
    body: {},
    op,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/delegations/${encodeURIComponent(delegationId)}/continuation-ack`,
    requestSchema: v.object({}),
    responseSchema: runContinuationAckResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
