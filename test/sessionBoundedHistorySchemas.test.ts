import { expect, test } from "bun:test"
import * as v from "valibot"
import { sessionBoundedSnapshotSchema } from "../src/session/api/sessionBoundedSnapshotSchema.js"
import { sessionChildReferenceSchema } from "../src/session/api/sessionChildReferenceSchema.js"
import { sessionCompactRunInputStateSchema } from "../src/session/api/sessionCompactRunInputStateSchema.js"
import { sessionLatestAnswerSchema } from "../src/session/api/sessionLatestAnswerSchema.js"
import { sessionOlderPageCursorSchema } from "../src/session/api/sessionOlderPageCursorSchema.js"
import { sessionSemanticStepSchema } from "../src/session/api/sessionSemanticStepSchema.js"
import { sessionSnapshotWatermarkSchema } from "../src/session/api/sessionSnapshotWatermarkSchema.js"

const assistantAnswer = {
  agentId: "agent-1",
  clientRequestId: "request-1",
  content: "The answer.",
  createdAt: "2026-08-31T12:00:00.000Z",
  finalizedAt: "2026-08-31T12:00:01.000Z",
  id: "message-1",
  metadata: {},
  role: "assistant",
  sequence: 2,
  sessionId: "session-1",
}
const session = {
  archivedAt: null,
  createdAt: "2026-08-31T12:00:00.000Z",
  id: "session-1",
  metadata: {},
  parentSessionId: null,
  pinned: false,
  primaryAgentId: "agent-1",
  projectPath: "~",
  revision: 1,
  serverId: "server-1",
  title: "Session",
  updatedAt: "2026-08-31T12:00:01.000Z",
}
const state = {
  input: null,
  run: {
    lastSequence: 4,
    partialText: "Working",
    runId: "run-1",
    sessionId: "session-1",
    status: "running",
  },
}

test("snapshot watermarks and older cursors preserve their boundaries", () => {
  expect(v.safeParse(sessionSnapshotWatermarkSchema, 0).success).toBe(true)
  expect(v.safeParse(sessionSnapshotWatermarkSchema, 4).success).toBe(true)
  expect(v.safeParse(sessionSnapshotWatermarkSchema, -1).success).toBe(false)
  expect(v.safeParse(sessionSnapshotWatermarkSchema, 1.5).success).toBe(false)

  expect(v.safeParse(sessionOlderPageCursorSchema, "cursor-opaque").success).toBe(true)
  expect(v.safeParse(sessionOlderPageCursorSchema, "123").success).toBe(false)
  expect(v.safeParse(sessionOlderPageCursorSchema, "").success).toBe(false)
  expect(v.safeParse(sessionOlderPageCursorSchema, "cursor with spaces").success).toBe(false)
})

test("semantic steps are bounded, typed, and strict", () => {
  expect(
    v.safeParse(sessionSemanticStepSchema, {
      id: "step-1",
      kind: "message",
      role: "user",
      sequence: 1,
      summary: "A request",
    }).success,
  ).toBe(true)
  expect(
    v.safeParse(sessionSemanticStepSchema, {
      childReference: { childSessionId: "child-1", parentSessionId: "session-1" },
      id: "step-2",
      kind: "tool",
      sequence: 2,
      summary: "Delegated work",
    }).success,
  ).toBe(true)
  expect(
    v.safeParse(sessionSemanticStepSchema, {
      id: "step-3",
      kind: "unknown",
      sequence: 3,
      summary: "Unknown",
    }).success,
  ).toBe(false)
  expect(
    v.safeParse(sessionSemanticStepSchema, {
      id: "step-3",
      kind: "message",
      role: "user",
      sequence: 0,
      summary: "Invalid boundary",
    }).success,
  ).toBe(false)
  expect(
    v.safeParse(sessionSemanticStepSchema, {
      id: "step-3",
      kind: "run",
      sequence: 3,
      summary: "Run",
      extra: true,
    }).success,
  ).toBe(false)
})

test("latest answers require assistant messages and child references require both IDs", () => {
  expect(v.safeParse(sessionLatestAnswerSchema, assistantAnswer).success).toBe(true)
  expect(v.safeParse(sessionLatestAnswerSchema, null).success).toBe(true)
  expect(v.safeParse(sessionLatestAnswerSchema, { ...assistantAnswer, role: "user" }).success).toBe(false)
  expect(
    v.safeParse(sessionChildReferenceSchema, { childSessionId: "child-1", parentSessionId: "session-1" }).success,
  ).toBe(true)
  expect(v.safeParse(sessionChildReferenceSchema, { childSessionId: "child-1" }).success).toBe(false)
})

test("compact run/input state is nullable per active concern and rejects unbounded text", () => {
  expect(v.safeParse(sessionCompactRunInputStateSchema, state).success).toBe(true)
  expect(v.safeParse(sessionCompactRunInputStateSchema, { input: null, run: null }).success).toBe(true)
  expect(
    v.safeParse(sessionCompactRunInputStateSchema, {
      input: { prompt: "Choose a direction", requestId: "input-1" },
      run: null,
    }).success,
  ).toBe(true)
  expect(
    v.safeParse(sessionCompactRunInputStateSchema, {
      input: null,
      run: { ...state.run, partialText: "x".repeat(16_385) },
    }).success,
  ).toBe(false)
})

test("bounded snapshots cap semantic history and allow an empty or exhausted older page", () => {
  const snapshot = {
    latestAnswer: assistantAnswer,
    olderCursor: "cursor-opaque",
    semanticSteps: [
      { id: "step-1", kind: "message", role: "user", sequence: 1, summary: "A request" },
      { id: "step-2", kind: "message", role: "assistant", sequence: 2, summary: "An answer" },
    ],
    session,
    state,
    throughSeq: 4,
  }
  expect(v.safeParse(sessionBoundedSnapshotSchema, snapshot).success).toBe(true)
  expect(v.safeParse(sessionBoundedSnapshotSchema, { ...snapshot, olderCursor: null, semanticSteps: [] }).success).toBe(
    true,
  )
  expect(
    v.safeParse(sessionBoundedSnapshotSchema, {
      ...snapshot,
      semanticSteps: Array.from({ length: 26 }, (_, index) => ({
        id: `step-${index + 1}`,
        kind: "run",
        sequence: index + 1,
        summary: "Run",
      })),
    }).success,
  ).toBe(false)
  expect(v.safeParse(sessionBoundedSnapshotSchema, { ...snapshot, extra: true }).success).toBe(false)
})
