import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../../api/errors/apiErrorResponseSchema.js"
import { runCancelResponseSchema, type RunCancelResponse } from "./runCancelResponseSchema.js"

type RunCancelCommandOptions = {
  clientRunId: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  sessionId: string
}

export async function runCancelCommand(options: RunCancelCommandOptions): Promise<Result<RunCancelResponse>> {
  const op = "runCancelCommand"
  if (options.clientRunId.length === 0 || options.sessionId.length === 0) {
    return createResultError(op, "The run cancellation identifiers are required.")
  }

  let response: Response
  try {
    response = await (options.fetcher ?? globalThis.fetch)(
      `/api/sessions/${encodeURIComponent(options.sessionId)}/runs/${encodeURIComponent(options.clientRunId)}/cancel`,
      {
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    )
  } catch (_error) {
    return createResultError(
      op,
      "The run cancellation request could not be completed. Check your connection and try again.",
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (_error) {
    return createResultError(op, "The run cancellation response is invalid.")
  }

  if (!response.ok) {
    const parsedError = v.safeParse(apiErrorResponseSchema, body)
    return createResultError(
      op,
      parsedError.success ? parsedError.output.error.message : "The run cancellation request could not be completed.",
    )
  }

  const parsed = v.safeParse(runCancelResponseSchema, body)
  if (!parsed.success) return createResultError(op, "The run cancellation response is invalid.")
  return createResult(parsed.output)
}
