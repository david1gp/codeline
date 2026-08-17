import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../api/errors/apiErrorResponseSchema.js"
import { sessionRenameRequestSchema } from "../session/schema/sessionRenameRequestSchema.js"

export async function sessionSidebarSessionRename(
  sessionId: string,
  title: string,
  fetcher: typeof fetch = fetch,
): Promise<Result<string>> {
  const op = "sessionSidebarSessionRename"
  const parsed = v.safeParse(sessionRenameRequestSchema, { title })
  if (!parsed.success)
    return createResultError(
      op,
      title.trim().length === 0 ? "Enter a session title." : "Session titles can be at most 500 characters.",
    )

  try {
    const response = await fetcher(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      body: JSON.stringify(parsed.output),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    if (response.ok) return createResult(parsed.output.title)
    const body: unknown = await response.json().catch(() => undefined)
    const error = v.safeParse(apiErrorResponseSchema, body)
    return createResultError(op, error.success ? error.output.error.message : "The session could not be renamed.")
  } catch (_error) {
    return createResultError(op, "The session could not be renamed. Check your connection and try again.")
  }
}
