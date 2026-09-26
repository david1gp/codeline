import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"

type JournalBacklogCursorSelection = {
  cursor: string | undefined
  source: "after" | "last-event-id" | "none"
}

export function journalBacklogCursorSelect(input: {
  after?: unknown
  lastEventId?: unknown
}): Result<JournalBacklogCursorSelection> {
  const op = "journalBacklogCursorSelect"

  if (input.lastEventId !== undefined) {
    if (typeof input.lastEventId !== "string")
      return createResultErrorCode(op, "The Last-Event-ID cursor is invalid.", "cursor_invalid")
    if (input.lastEventId === "") return createResult({ cursor: undefined, source: "last-event-id" })
    return createResult({ cursor: input.lastEventId, source: "last-event-id" })
  }

  if (input.after === undefined) return createResult({ cursor: undefined, source: "none" })
  if (typeof input.after !== "string")
    return createResultErrorCode(op, "The after cursor is invalid.", "cursor_invalid")
  return createResult({ cursor: input.after, source: "after" })
}
