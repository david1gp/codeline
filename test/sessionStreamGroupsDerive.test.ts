import { expect, test } from "bun:test"
import { sessionStreamGroupsDerive } from "../src/ui/sessionStreamGroupsDerive.js"

type StreamInput = Parameters<typeof sessionStreamGroupsDerive>[0]
type StreamEvent = StreamInput["events"][number]
type StreamRun = StreamInput["runs"][number]

function event(input: StreamEvent): StreamEvent {
  return input
}

function run(input: StreamRun): StreamRun {
  return input
}

test("stream groups order runs, retries, and same-sequence events deterministically", () => {
  const groups = sessionStreamGroupsDerive({
    events: [
      event({
        createdAt: 1,
        eventType: "text_delta",
        id: "retry-b",
        payload: { delta: "B" },
        sequence: 2,
        streamId: "a-retry",
      }),
      event({
        createdAt: 1,
        eventType: "text_delta",
        id: "run-a",
        payload: { delta: "A" },
        sequence: 1,
        streamId: "a-run",
      }),
      event({
        createdAt: 1,
        eventType: "text_delta",
        id: "attempt-1",
        payload: { delta: "1" },
        sequence: 1,
        streamId: "a-attempt-1",
      }),
      event({
        createdAt: 1,
        eventType: "text_delta",
        id: "retry-a",
        payload: { delta: "a" },
        sequence: 2,
        streamId: "a-retry",
      }),
      event({
        createdAt: 1,
        eventType: "text_delta",
        id: "run-b",
        payload: { delta: "B" },
        sequence: 1,
        streamId: "b-run",
      }),
      event({
        createdAt: 1,
        eventType: "text_delta",
        id: "retry-run",
        payload: { delta: "R" },
        sequence: 1,
        streamId: "a-retry",
      }),
    ],
    runs: [
      run({
        attempts: [
          { ordinal: 2, status: "failed", streamId: "a-retry" },
          { ordinal: 1, status: "failed", streamId: "a-attempt-1" },
        ],
        createdAt: 100,
        id: "run-a",
        status: "failed",
        streamId: "a-run",
      }),
      run({
        attempts: [],
        createdAt: 100,
        id: "run-b",
        status: "succeeded",
        streamId: "b-run",
      }),
    ],
  })

  expect(groups.map((group) => group.id)).toEqual(["a-run", "a-attempt-1", "a-retry", "b-run"])
  expect(groups.map((group) => group.status)).toEqual(["failed", "failed", "failed", "succeeded"])
  expect(groups.find((group) => group.id === "a-retry")?.entries).toEqual([
    { detail: "RaB", id: "retry-run", kind: "output", label: "Output" },
  ])
})

test("stream groups coalesce adjacent text deltas and flush around activity", () => {
  const groups = sessionStreamGroupsDerive({
    events: [
      event({
        createdAt: 1,
        eventType: "text_delta",
        id: "one",
        payload: { delta: "one" },
        sequence: 1,
        streamId: "stream",
      }),
      event({
        createdAt: 1,
        eventType: "text_delta",
        id: "two",
        payload: { delta: " two" },
        sequence: 2,
        streamId: "stream",
      }),
      event({
        createdAt: 1,
        eventType: "thinking_status",
        id: "thinking",
        payload: { status: "started" },
        sequence: 3,
        streamId: "stream",
      }),
      event({
        createdAt: 1,
        eventType: "text_delta",
        id: "three",
        payload: { delta: "three" },
        sequence: 4,
        streamId: "stream",
      }),
      event({
        createdAt: 1,
        eventType: "text_delta",
        id: "four",
        payload: { delta: " four" },
        sequence: 5,
        streamId: "stream",
      }),
    ],
    runs: [],
  })

  expect(groups[0]?.entries).toEqual([
    { detail: "one two", id: "one", kind: "output", label: "Output" },
    { id: "thinking", kind: "thinking", label: "Thinking", status: "started" },
    { detail: "three four", id: "three", kind: "output", label: "Output" },
  ])
})

test("stream groups map thinking, tools, written files, and terminal events", () => {
  const output = "x".repeat(401)
  const groups = sessionStreamGroupsDerive({
    events: [
      event({
        createdAt: 1,
        eventType: "thinking_status",
        id: "thinking",
        payload: { status: "started" },
        sequence: 1,
        streamId: "stream",
      }),
      event({
        createdAt: 1,
        eventType: "tool_start",
        id: "tool-start",
        payload: { toolCallId: "call-1", toolName: "read_file" },
        sequence: 2,
        streamId: "stream",
      }),
      event({
        createdAt: 1,
        eventType: "tool_output",
        id: "tool-output",
        payload: { output, truncated: true },
        sequence: 3,
        streamId: "stream",
      }),
      event({
        createdAt: 1,
        eventType: "tool_result",
        id: "tool-result",
        payload: { outcome: "success", result: "done" },
        sequence: 4,
        streamId: "stream",
      }),
      event({
        createdAt: 1,
        eventType: "written_file",
        id: "written",
        payload: { path: "src/index.ts" },
        sequence: 5,
        streamId: "stream",
      }),
      event({
        createdAt: 1,
        eventType: "terminal",
        id: "terminal",
        payload: { code: 0, message: "done", status: "completed" },
        sequence: 6,
        streamId: "stream",
      }),
    ],
    runs: [],
  })

  expect(groups[0]?.entries).toEqual([
    { id: "thinking", kind: "thinking", label: "Thinking", status: "started" },
    { detail: "call-1", id: "tool-start", kind: "tool", label: "read_file", status: "start" },
    { detail: `${"x".repeat(400)}…`, id: "tool-output", kind: "tool", label: "Tool output", status: "truncated" },
    { detail: "done", id: "tool-result", kind: "tool", label: "Tool result", status: "success" },
    { detail: "src/index.ts", id: "written", kind: "written-file", label: "Wrote file" },
    { detail: "0 · done", id: "terminal", kind: "terminal", label: "Terminal", status: "completed" },
  ])
})
