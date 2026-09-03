import { expect, test } from "bun:test"
import type { SessionDetailEvent } from "../src/session/api/sessionDetailEventSchema.js"
import { sessionDetailSemanticStepCreate } from "../src/session/client/sessionDetailSemanticStepCreate.js"

type SessionDetailEntryEvent = Extract<SessionDetailEvent, { eventType: "entry" }>

function sessionDetailToolEventCreate(payload: SessionDetailEntryEvent["payload"]): SessionDetailEntryEvent {
  return {
    changePosition: 1,
    entryId: "entry-1",
    eventType: "entry",
    id: "cursor-1",
    kind: "tool",
    payload,
    position: 1,
    sessionId: "session-1",
    sourceDetailId: "detail-1",
    sourceId: "run-1",
    sourceType: "tool",
  }
}

test("preserves a nested child reference and its child session ID", () => {
  const result = sessionDetailSemanticStepCreate(
    sessionDetailToolEventCreate({
      childReference: {
        childRunId: "child-run-1",
        childSessionId: "child-session-1",
        delegationId: "delegation-1",
        parentSessionId: "session-1",
      },
      toolName: "delegate",
    }),
  )

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data).toEqual({
    childReference: {
      childRunId: "child-run-1",
      childSessionId: "child-session-1",
      delegationId: "delegation-1",
      parentSessionId: "session-1",
    },
    detailId: "detail-1",
    id: "entry-1",
    kind: "tool",
    runId: "run-1",
    sequence: 1,
    summary: "delegate",
  })
})

test("falls back to flattened child reference fields including the child session ID", () => {
  const result = sessionDetailSemanticStepCreate(
    sessionDetailToolEventCreate({
      childRunId: "child-run-1",
      childSessionId: "child-session-1",
      delegationId: "delegation-1",
      parentSessionId: "session-1",
      toolName: "delegate",
    }),
  )

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data).toEqual({
    childReference: {
      childRunId: "child-run-1",
      childSessionId: "child-session-1",
      delegationId: "delegation-1",
      parentSessionId: "session-1",
    },
    detailId: "detail-1",
    id: "entry-1",
    kind: "tool",
    runId: "run-1",
    sequence: 1,
    summary: "delegate",
  })
})
