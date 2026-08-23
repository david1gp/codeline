import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { sessionEtagFetch } from "../session/ui/sessionEtagFetch.js"
import { sessionRenameRequest } from "../session/ui/sessionRenameRequest.js"
import { sessionRenameRequestSchema } from "../session/schema/sessionRenameRequestSchema.js"

export async function sessionSidebarSessionRename(
  sessionId: string,
  title: string,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Result<string>> {
  const op = "sessionSidebarSessionRename"
  const parsed = v.safeParse(sessionRenameRequestSchema, { title })
  if (!parsed.success)
    return createResultError(
      op,
      title.trim().length === 0 ? "Enter a session title." : "Session titles can be at most 500 characters.",
    )

  const etag = await sessionEtagFetch(sessionId, { fetch: fetcher })
  if (!etag.success) return createResultError(op, "The session could not be renamed.")

  const renamed = await sessionRenameRequest(sessionId, parsed.output.title, { etag: etag.data, fetch: fetcher })
  if (renamed.success) return createResult(renamed.data.session.title)
  if (renamed.code === "network_error")
    return createResultError(op, "The session could not be renamed. Check your connection and try again.")
  return createResultError(op, renamed.errorMessage)
}
