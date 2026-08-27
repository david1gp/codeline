import { expect, test } from "bun:test"
import { type SessionStreamEntry, sessionStreamGroupsDerive } from "../src/ui/sessionStreamGroupsDerive.js"

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

test("stream groups link delegated tool calls to their child stream", () => {
  const groups = sessionStreamGroupsDerive({
    delegations: [
      {
        childRunId: "child-run",
        delegationKey: "delegate-call",
        id: "delegation-1",
        parentAttemptId: "parent-attempt",
        parentRunId: "parent-run",
        task: "Ask the subagent to inspect the project.",
      },
    ],
    events: [
      event({
        createdAt: 1,
        eventType: "tool_start",
        id: "delegate-start",
        payload: { toolCallId: "delegate-call", toolName: "delegate_task" },
        sequence: 1,
        streamId: "parent-stream",
      }),
    ],
    runs: [
      run({
        attempts: [{ id: "parent-attempt", ordinal: 1, status: "running", streamId: "parent-stream" }],
        createdAt: 1,
        id: "parent-run",
        status: "running",
        streamId: "parent-run-stream",
      }),
      run({
        attempts: [{ id: "child-attempt", ordinal: 1, status: "running", streamId: "child-stream" }],
        createdAt: 2,
        id: "child-run",
        status: "running",
        streamId: "child-run-stream",
      }),
    ],
  })

  expect(groups[0]?.entries[0]).toMatchObject({
    delegation: {
      childRunId: "child-run",
      childStreamId: "child-stream",
      id: "delegation-1",
      task: "Ask the subagent to inspect the project.",
    },
    label: "delegate_task",
  })
})

test("stream groups reuse a persisted child for a repeated task with a different tool key", () => {
  const groups = sessionStreamGroupsDerive({
    delegations: [
      {
        childRunId: "child-run",
        delegationKey: "original-key",
        id: "delegation-1",
        parentAttemptId: "parent-attempt",
        parentRunId: "parent-run",
        task: "Inspect the project.",
      },
      {
        childRunId: "different-task-run",
        delegationKey: "different-task-key",
        id: "delegation-2",
        parentAttemptId: "parent-attempt",
        parentRunId: "parent-run",
        task: "Inspect a different project.",
      },
      {
        childRunId: "different-agent-run",
        delegationKey: "different-agent-key",
        id: "delegation-3",
        parentAttemptId: "parent-attempt",
        parentRunId: "parent-run",
        task: "Inspect the project.",
      },
    ],
    events: [
      event({
        createdAt: 1,
        eventType: "TOOL_CALL_START",
        id: "delegate-start-same",
        payload: { toolCallId: "new-key-same", toolCallName: "delegate_task", type: "TOOL_CALL_START" },
        sequence: 1,
        streamId: "parent-stream",
      }),
      event({
        createdAt: 1,
        eventType: "TOOL_CALL_ARGS",
        id: "delegate-args-same",
        payload: {
          delta: '{"agentId":"worker","task":"  Inspect the project.  "}',
          toolCallId: "new-key-same",
          type: "TOOL_CALL_ARGS",
        },
        sequence: 2,
        streamId: "parent-stream",
      }),
      event({
        createdAt: 1,
        eventType: "TOOL_CALL_START",
        id: "delegate-start-different-task",
        payload: { toolCallId: "new-key-different-task", toolCallName: "delegate_task", type: "TOOL_CALL_START" },
        sequence: 3,
        streamId: "parent-stream",
      }),
      event({
        createdAt: 1,
        eventType: "TOOL_CALL_ARGS",
        id: "delegate-args-different-task",
        payload: {
          delta: '{"agentId":"worker","task":"Inspect an unrelated project."}',
          toolCallId: "new-key-different-task",
          type: "TOOL_CALL_ARGS",
        },
        sequence: 4,
        streamId: "parent-stream",
      }),
      event({
        createdAt: 1,
        eventType: "TOOL_CALL_START",
        id: "delegate-start-different-agent",
        payload: { toolCallId: "new-key-different-agent", toolCallName: "delegate_task", type: "TOOL_CALL_START" },
        sequence: 5,
        streamId: "parent-stream",
      }),
      event({
        createdAt: 1,
        eventType: "TOOL_CALL_ARGS",
        id: "delegate-args-different-agent",
        payload: {
          delta: '{"agentId":"reviewer","task":"Inspect the project."}',
          toolCallId: "new-key-different-agent",
          type: "TOOL_CALL_ARGS",
        },
        sequence: 6,
        streamId: "parent-stream",
      }),
    ],
    runs: [
      run({
        attempts: [{ id: "parent-attempt", ordinal: 1, status: "running", streamId: "parent-stream" }],
        createdAt: 1,
        id: "parent-run",
        snapshot: { target: { agentId: "parent-agent", serverId: "server" } },
        status: "running",
        streamId: "parent-run-stream",
      }),
      run({
        attempts: [{ ordinal: 1, status: "running", streamId: "child-stream" }],
        createdAt: 2,
        id: "child-run",
        snapshot: { target: { agentId: "worker", serverId: "server" } },
        status: "running",
        streamId: "child-run-stream",
      }),
      run({
        attempts: [{ ordinal: 1, status: "running", streamId: "different-task-stream" }],
        createdAt: 3,
        id: "different-task-run",
        snapshot: { target: { agentId: "worker", serverId: "server" } },
        status: "running",
        streamId: "different-task-run-stream",
      }),
      run({
        attempts: [{ ordinal: 1, status: "running", streamId: "different-agent-stream" }],
        createdAt: 4,
        id: "different-agent-run",
        snapshot: { target: { agentId: "reviewer", serverId: "server" } },
        status: "running",
        streamId: "different-agent-run-stream",
      }),
    ],
  })

  expect(groups[0]?.entries[0]).toMatchObject({
    delegation: { childRunId: "child-run", delegationKey: "original-key" },
  })
  expect(groups[0]?.entries[1]?.delegation).toBeUndefined()
  expect(groups[0]?.entries[2]).toMatchObject({
    delegation: { childRunId: "different-agent-run", delegationKey: "different-agent-key" },
  })
})

test("stream groups prefer an exact delegation key over logical-task fallback", () => {
  const groups = sessionStreamGroupsDerive({
    delegations: [
      {
        childRunId: "fallback-child",
        delegationKey: "fallback-key",
        id: "delegation-fallback",
        parentAttemptId: "parent-attempt",
        parentRunId: "parent-run",
        task: "Inspect the project.",
      },
      {
        childRunId: "exact-child",
        delegationKey: "exact-key",
        id: "delegation-exact",
        parentAttemptId: "parent-attempt",
        parentRunId: "parent-run",
        task: "Inspect the project.",
      },
    ],
    events: [
      event({
        createdAt: 1,
        eventType: "tool_start",
        id: "delegate-start",
        payload: {
          agentId: "worker",
          task: "Inspect the project.",
          toolCallId: "exact-key",
          toolName: "delegate_task",
        },
        sequence: 1,
        streamId: "parent-stream",
      }),
    ],
    runs: [
      run({
        attempts: [{ id: "parent-attempt", ordinal: 1, status: "running", streamId: "parent-stream" }],
        createdAt: 1,
        id: "parent-run",
        snapshot: { target: { agentId: "parent-agent", serverId: "server" } },
        status: "running",
        streamId: "parent-run-stream",
      }),
      run({
        attempts: [{ ordinal: 1, status: "running", streamId: "fallback-stream" }],
        createdAt: 2,
        id: "fallback-child",
        snapshot: { target: { agentId: "worker", serverId: "server" } },
        status: "running",
        streamId: "fallback-run-stream",
      }),
      run({
        attempts: [{ ordinal: 1, status: "running", streamId: "exact-stream" }],
        createdAt: 3,
        id: "exact-child",
        snapshot: { target: { agentId: "worker", serverId: "server" } },
        status: "running",
        streamId: "exact-run-stream",
      }),
    ],
  })

  expect(groups[0]?.entries[0]?.delegation?.childRunId).toBe("exact-child")
})

test("stream groups render persisted chat stream chunks alongside normalized events", () => {
  const groups = sessionStreamGroupsDerive({
    events: [
      event({
        createdAt: 1,
        eventType: "TEXT_MESSAGE_CONTENT",
        id: "chat-text",
        payload: { delta: "hello", type: "TEXT_MESSAGE_CONTENT" },
        sequence: 1,
        streamId: "chat-stream",
      }),
      event({
        createdAt: 1,
        eventType: "REASONING_START",
        id: "chat-thinking",
        payload: { type: "REASONING_START" },
        sequence: 2,
        streamId: "chat-stream",
      }),
      event({
        createdAt: 1,
        eventType: "TOOL_CALL_START",
        id: "chat-tool",
        payload: { toolCallId: "call-1", toolCallName: "read_file", type: "TOOL_CALL_START" },
        sequence: 3,
        streamId: "chat-stream",
      }),
      event({
        createdAt: 1,
        eventType: "RUN_FINISHED",
        id: "chat-terminal",
        payload: { outcome: { type: "success" }, type: "RUN_FINISHED" },
        sequence: 4,
        streamId: "chat-stream",
      }),
    ],
    runs: [],
  })

  expect(groups[0]?.entries).toEqual([
    { detail: "hello", id: "chat-text", kind: "output", label: "Output" },
    { id: "chat-thinking", kind: "thinking", label: "Thinking", status: "started" },
    { detail: "call-1", id: "chat-tool", kind: "tool", label: "read_file", status: "start" },
    { id: "chat-terminal", kind: "terminal", label: "Terminal", status: "completed" },
  ])
})

test("stream groups reuse the unchanged suffix of a large append-only stream", () => {
  const initialEvents = Array.from({ length: 20_000 }, (_, index) =>
    event({
      createdAt: index,
      eventType: "thinking_status",
      id: `thinking-${index}`,
      payload: { status: "active" },
      sequence: index,
      streamId: "large-stream",
    }),
  )
  const entryCache = new Map<string, { entry: SessionStreamEntry; signature: string }>()
  const initial = sessionStreamGroupsDerive({ entryCache, events: initialEvents, runs: [] })
  const appended = sessionStreamGroupsDerive({
    entryCache,
    events: [
      ...initialEvents,
      event({
        createdAt: initialEvents.length,
        eventType: "thinking_status",
        id: `thinking-${initialEvents.length}`,
        payload: { status: "active" },
        sequence: initialEvents.length,
        streamId: "large-stream",
      }),
    ],
    runs: [],
  })

  const initialEntries = initial[0]?.entries ?? []
  const appendedEntries = appended[0]?.entries ?? []
  const reusedCount = appendedEntries.filter(
    (entry, index) => index < initialEntries.length && entry === initialEntries[index],
  ).length

  expect(appendedEntries).toHaveLength(initialEvents.length + 1)
  expect(reusedCount).toBe(512)
  expect(entryCache.size).toBe(512)
})

test("stream groups invalidate changed events without invalidating neighboring entries", () => {
  const events = [
    event({
      createdAt: 1,
      eventType: "thinking_status",
      id: "thinking",
      payload: { status: "active" },
      sequence: 1,
      streamId: "stream",
    }),
    event({
      createdAt: 2,
      eventType: "written_file",
      id: "written",
      payload: { path: "src/index.ts" },
      sequence: 2,
      streamId: "stream",
    }),
  ]
  const entryCache = new Map<string, { entry: SessionStreamEntry; signature: string }>()
  const initial = sessionStreamGroupsDerive({ entryCache, events, runs: [] })
  const unchanged = sessionStreamGroupsDerive({ entryCache, events: [...events], runs: [] })
  const changed = sessionStreamGroupsDerive({
    entryCache,
    events: [{ ...events[0]!, payload: { status: "complete" } }, events[1]!],
    runs: [],
  })

  expect(unchanged[0]?.entries[0]).toBe(initial[0]?.entries[0])
  expect(changed[0]?.entries[0]).not.toBe(initial[0]?.entries[0])
  expect(changed[0]?.entries[1]).toBe(initial[0]?.entries[1])
})

test("stream groups derive current status, labels, and order around reused entries", () => {
  const events = [
    event({
      createdAt: 1,
      eventType: "thinking_status",
      id: "a-thinking",
      payload: { status: "active" },
      sequence: 1,
      streamId: "stream-a",
    }),
    event({
      createdAt: 2,
      eventType: "thinking_status",
      id: "b-thinking",
      payload: { status: "active" },
      sequence: 1,
      streamId: "stream-b",
    }),
  ]
  const entryCache = new Map<string, { entry: SessionStreamEntry; signature: string }>()
  const initial = sessionStreamGroupsDerive({
    entryCache,
    events,
    runs: [
      run({
        attempts: [{ ordinal: 1, status: "running", streamId: "stream-a" }],
        createdAt: 2,
        id: "run-a",
        status: "running",
        streamId: "run-a-stream",
      }),
      run({
        attempts: [{ ordinal: 1, status: "queued", streamId: "stream-b" }],
        createdAt: 1,
        id: "run-b",
        status: "queued",
        streamId: "run-b-stream",
      }),
    ],
  })
  const updated = sessionStreamGroupsDerive({
    entryCache,
    events,
    runs: [
      run({
        attempts: [{ ordinal: 2, status: "succeeded", streamId: "stream-a" }],
        createdAt: 1,
        id: "run-a",
        status: "succeeded",
        streamId: "run-a-stream",
      }),
      run({
        attempts: [{ ordinal: 1, status: "failed", streamId: "stream-b" }],
        createdAt: 2,
        id: "run-b",
        status: "failed",
        streamId: "run-b-stream",
      }),
    ],
  })

  expect(initial.map((group) => group.id)).toEqual(["stream-b", "stream-a"])
  expect(updated.map((group) => group.id)).toEqual(["stream-a", "stream-b"])
  expect(updated.map((group) => group.label)).toEqual(["Attempt 2", "Attempt 1"])
  expect(updated.map((group) => group.status)).toEqual(["succeeded", "failed"])
  expect(updated[0]?.entries[0]).toBe(initial[1]?.entries[0])
  expect(updated[1]?.entries[0]).toBe(initial[0]?.entries[0])
})

test("stream groups invalidate delegation entries when delegation or run context changes", () => {
  const eventInput = event({
    createdAt: 1,
    eventType: "tool_start",
    id: "delegate-start",
    payload: { toolCallId: "delegate-call", toolName: "delegate_task" },
    sequence: 1,
    streamId: "parent-stream",
  })
  const entryCache = new Map<string, { entry: SessionStreamEntry; signature: string }>()
  const parentRun = run({
    attempts: [{ id: "parent-attempt", ordinal: 1, status: "running", streamId: "parent-stream" }],
    createdAt: 1,
    id: "parent-run",
    snapshot: { target: { agentId: "worker", serverId: "server" } },
    status: "running",
    streamId: "parent-run-stream",
  })
  const childRun = run({
    attempts: [{ ordinal: 1, status: "running", streamId: "child-stream-1" }],
    createdAt: 2,
    id: "child-run",
    snapshot: { target: { agentId: "worker", serverId: "server" } },
    status: "running",
    streamId: "child-run-stream",
  })
  const delegation = {
    childRunId: "child-run",
    delegationKey: "delegate-call",
    id: "delegation-1",
    parentAttemptId: "parent-attempt",
    parentRunId: "parent-run",
    task: "Inspect the project.",
  }
  const initial = sessionStreamGroupsDerive({
    delegations: [delegation],
    entryCache,
    events: [eventInput],
    runs: [parentRun, childRun],
  })
  const unchanged = sessionStreamGroupsDerive({
    delegations: [delegation],
    entryCache,
    events: [eventInput],
    runs: [parentRun, childRun],
  })
  const changedDelegation = sessionStreamGroupsDerive({
    delegations: [{ ...delegation, childRunId: "replacement-child" }],
    entryCache,
    events: [eventInput],
    runs: [
      parentRun,
      childRun,
      run({
        attempts: [{ ordinal: 1, status: "running", streamId: "replacement-stream" }],
        createdAt: 3,
        id: "replacement-child",
        snapshot: { target: { agentId: "worker", serverId: "server" } },
        status: "running",
        streamId: "replacement-run-stream",
      }),
    ],
  })
  const changedChildContext = sessionStreamGroupsDerive({
    delegations: [delegation],
    entryCache,
    events: [eventInput],
    runs: [parentRun, { ...childRun, snapshot: { target: { agentId: "reviewer", serverId: "server" } } }],
  })
  const retriedChild = sessionStreamGroupsDerive({
    delegations: [delegation],
    entryCache,
    events: [eventInput],
    runs: [
      parentRun,
      {
        ...childRun,
        attempts: [...(childRun.attempts ?? []), { ordinal: 2, status: "running", streamId: "child-stream-2" }],
      },
    ],
  })
  const changedParentContext = sessionStreamGroupsDerive({
    delegations: [delegation],
    entryCache,
    events: [eventInput],
    runs: [{ ...parentRun, snapshot: { target: { agentId: "reviewer", serverId: "server" } } }, childRun],
  })

  expect(unchanged[0]?.entries[0]).toBe(initial[0]?.entries[0])
  expect(changedDelegation[0]?.entries[0]).not.toBe(initial[0]?.entries[0])
  expect(changedDelegation[0]?.entries[0]?.delegation).toMatchObject({
    childRunId: "replacement-child",
    childStreamId: "replacement-stream",
  })
  expect(changedChildContext[0]?.entries[0]).not.toBe(initial[0]?.entries[0])
  expect(changedChildContext[0]?.entries[0]?.delegation).toBeUndefined()
  expect(retriedChild[0]?.entries[0]).not.toBe(initial[0]?.entries[0])
  expect(retriedChild[0]?.entries[0]?.delegation).toMatchObject({ childStreamId: "child-stream-2" })
  expect(changedParentContext[0]?.entries[0]).not.toBe(initial[0]?.entries[0])
  expect(changedParentContext[0]?.entries[0]?.delegation).toBeUndefined()
})

test("stream groups evict the oldest durable entries while retaining the newest entries", () => {
  const events = Array.from({ length: 513 }, (_, index) =>
    event({
      createdAt: index,
      eventType: "thinking_status",
      id: `thinking-${index}`,
      payload: { status: "active" },
      sequence: index,
      streamId: "bounded-stream",
    }),
  )
  const entryCache = new Map<string, { entry: SessionStreamEntry; signature: string }>()
  const initial = sessionStreamGroupsDerive({ entryCache, events, runs: [] })
  const evicted = sessionStreamGroupsDerive({ entryCache, events: [events[0]!], runs: [] })
  const retained = sessionStreamGroupsDerive({ entryCache, events: [events.at(-1)!], runs: [] })

  expect(entryCache.size).toBe(512)
  expect(evicted[0]?.entries[0]).not.toBe(initial[0]?.entries[0])
  expect(retained[0]?.entries[0]).toBe(initial[0]?.entries.at(-1))
})
