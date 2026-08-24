import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import { type RunCancelResponse, runCancelResponseSchema } from "../api/runCancelResponseSchema.js"
import { runCancelInputSchema } from "../schema/runCancelInputSchema.js"

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

  const client = apiHttpClientCreate({ fetch: options.fetcher ?? globalThis.fetch })
  return client.post({
    body: {},
    op,
    path: `/api/sessions/${encodeURIComponent(options.sessionId)}/runs/${encodeURIComponent(options.clientRunId)}/cancel`,
    requestSchema: runCancelInputSchema,
    responseSchema: runCancelResponseSchema,
  })
}
