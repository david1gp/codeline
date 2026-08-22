import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { journalBacklogCursorSelect } from "../src/journal/actions/journalBacklogCursorSelect.js"
import { journalBacklogEventFrameCreate } from "../src/journal/actions/journalBacklogEventFrameCreate.js"
import { streamSseFrameSerialize } from "../src/stream/api/streamSseFrameSerialize.js"

const cursorEncode = (_journalId: unknown, sequence: unknown) => createResult(`cursor-${String(sequence)}`)

test("prefers Last-Event-ID over after and preserves an explicitly empty Last-Event-ID", () => {
  expect(journalBacklogCursorSelect({ after: "after-cursor", lastEventId: "header-cursor" })).toMatchObject({
    data: { cursor: "header-cursor", source: "last-event-id" },
    success: true,
  })
  expect(journalBacklogCursorSelect({ after: "after-cursor", lastEventId: "" })).toMatchObject({
    data: { cursor: undefined, source: "last-event-id" },
    success: true,
  })
  expect(journalBacklogCursorSelect({ after: "after-cursor" })).toMatchObject({
    data: { cursor: "after-cursor", source: "after" },
    success: true,
  })
})

test("maps one journal row to one validated SSE frame", () => {
  const result = journalBacklogEventFrameCreate({ cursorEncode }, "user-1", {
    eventType: "invalidate",
    payload: { resourceId: "session-1", resourceType: "session", revision: 3 },
    sequence: 4,
  })

  expect(result).toMatchObject({
    data: {
      data: {
        eventType: "invalidate",
        id: "cursor-4",
        resourceId: "session-1",
        resourceType: "session",
        revision: 3,
        sequence: 4,
      },
      event: "invalidate",
      id: "cursor-4",
    },
    success: true,
  })
})

test("enforces 128 KiB on the complete serialized SSE frame", () => {
  const result = journalBacklogEventFrameCreate({ cursorEncode }, "user-1", {
    eventType: "delta",
    payload: {
      delta: "x".repeat(128 * 1024),
      deltaKind: "text",
      messageId: "message-1",
      runId: "run-1",
      sessionId: "session-1",
    },
    sequence: 1,
  })

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toContain("valid SSE frame")

  const small = journalBacklogEventFrameCreate({ cursorEncode }, "user-1", {
    eventType: "delta",
    payload: {
      delta: "small",
      deltaKind: "text",
      messageId: "message-1",
      runId: "run-1",
      sessionId: "session-1",
    },
    sequence: 1,
  })
  expect(small.success).toBe(true)
  if (small.success)
    expect(new TextEncoder().encode(streamSseFrameSerialize(small.data)).byteLength).toBeLessThan(128 * 1024)
})
