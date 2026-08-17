import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../api/errors/apiErrorResponseSchema.js"

export async function sessionSidebarSessionDelete(
  sessionId: string,
  fetcher: typeof fetch = fetch,
): Promise<Result<true>> {
  const op = "sessionSidebarSessionDelete"
  try {
    const response = await fetcher(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" })
    if (response.ok) return createResult(true)
    const body: unknown = await response.json().catch(() => undefined)
    const error = v.safeParse(apiErrorResponseSchema, body)
    return createResultError(op, error.success ? error.output.error.message : "The session could not be deleted.")
  } catch (_error) {
    return createResultError(op, "The session could not be deleted. Check your connection and try again.")
  }
}
