import { expect, test } from "bun:test"
import { sessionStreamInFlightDerive } from "../src/ui/sessionStreamInFlightDerive.js"

test("in-flight stream projection maps activities and assistant output while excluding user text", () => {
  const group = sessionStreamInFlightDerive([
    { content: "user text", id: "user", role: "user" },
    {
      activities: [
        { detail: "reason", id: "thinking-1", kind: "thinking", label: "Thinking", status: "active" },
        { detail: "src/index.ts", id: "tool-1", kind: "tool-call", label: "read_file" },
        { id: "result-1", kind: "tool-result", label: "Result", status: "success" },
      ],
      content: "assistant output",
      id: "assistant",
      role: "assistant",
    },
  ])

  expect(group).toEqual({
    entries: [
      { detail: "reason", id: "assistant-thinking-1", kind: "thinking", label: "Thinking", status: "active" },
      { detail: "src/index.ts", id: "assistant-tool-1", kind: "tool", label: "read_file" },
      { id: "assistant-result-1", kind: "tool", label: "Result", status: "success" },
      { detail: "assistant output", id: "assistant-output", kind: "output", label: "Output" },
    ],
    id: "in-flight",
    label: "In flight",
    status: "streaming",
    streamId: "in-flight",
  })
})

test("in-flight stream projection is absent when messages have no renderable entries", () => {
  expect(
    sessionStreamInFlightDerive([
      { content: "", role: "user" },
      { content: "", role: "assistant" },
    ]),
  ).toBeUndefined()
})

test("in-flight delegated tool activity only links a child in the active run and attempt", () => {
  const group = sessionStreamInFlightDerive(
    [
      {
        activities: [
          {
            id: "tool-call-delegate-call",
            kind: "tool-call",
            label: "delegate_task",
            toolCallId: "delegate-call",
          },
        ],
        content: "",
        role: "assistant",
      },
    ],
    [
      {
        childRunId: "other-child-run",
        delegationKey: "delegate-call",
        id: "delegation-other",
        parentAttemptId: "other-attempt",
        parentRunId: "other-run",
        task: "Inspect another run.",
      },
      {
        childRunId: "child-run",
        delegationKey: "delegate-call",
        id: "delegation-1",
        parentAttemptId: "parent-attempt",
        parentRunId: "parent-run",
        task: "Inspect the project.",
      },
    ],
    { parentAttemptId: "parent-attempt", parentRunId: "parent-run" },
  )

  expect(group?.entries[0]).toMatchObject({
    delegation: { childRunId: "child-run", childStreamId: "run-child:child-run" },
    label: "delegate_task",
  })
})

test("in-flight delegated activity reuses a persisted child for a different tool key", () => {
  const group = sessionStreamInFlightDerive(
    [
      {
        activities: [
          {
            agentId: "worker",
            id: "tool-call-new-key",
            kind: "tool-call",
            label: "delegate_task",
            task: "  Inspect the project.  ",
            toolCallId: "new-key",
          },
        ],
        content: "",
        role: "assistant",
      },
    ],
    [
      {
        childRunId: "child-run",
        delegationKey: "original-key",
        id: "delegation-1",
        parentAttemptId: "parent-attempt",
        parentRunId: "parent-run",
        task: "Inspect the project.",
      },
      {
        childRunId: "different-child-run",
        delegationKey: "different-key",
        id: "delegation-2",
        parentAttemptId: "other-attempt",
        parentRunId: "other-parent-run",
        task: "Inspect the project.",
      },
    ],
    { parentAttemptId: "parent-attempt", parentRunId: "parent-run" },
    [
      {
        id: "parent-run",
        snapshot: { target: { agentId: "parent-agent", serverId: "server" } },
      },
      {
        id: "child-run",
        snapshot: { target: { agentId: "worker", serverId: "server" } },
      },
      {
        id: "different-child-run",
        snapshot: { target: { agentId: "worker", serverId: "server" } },
      },
    ],
  )

  expect(group?.entries[0]).toMatchObject({
    delegation: { childRunId: "child-run", childStreamId: "run-child:child-run" },
    label: "delegate_task",
  })
})

test("in-flight delegated activity follows the child into its latest retry stream", () => {
  const messages = [
    {
      activities: [
        {
          agentId: "worker",
          id: "tool-call-delegate",
          kind: "tool-call" as const,
          label: "delegate_task",
          task: "Inspect the project.",
          toolCallId: "delegate-call",
        },
      ],
      content: "",
      role: "assistant",
    },
  ]
  const delegations = [
    {
      childRunId: "child-run",
      delegationKey: "delegate-call",
      id: "delegation-1",
      parentAttemptId: "parent-attempt",
      parentRunId: "parent-run",
      task: "Inspect the project.",
    },
  ]
  const scope = { parentAttemptId: "parent-attempt", parentRunId: "parent-run" }
  const initial = sessionStreamInFlightDerive(messages, delegations, scope, [
    { id: "parent-run", snapshot: { target: { agentId: "parent-agent", serverId: "server" } } },
    {
      attempts: [{ streamId: "run-child:child-run" }],
      id: "child-run",
      snapshot: { target: { agentId: "worker", serverId: "server" } },
      streamId: "run-child:child-run",
    },
  ])
  const retried = sessionStreamInFlightDerive(messages, delegations, scope, [
    { id: "parent-run", snapshot: { target: { agentId: "parent-agent", serverId: "server" } } },
    {
      attempts: [{ streamId: "run-child:child-run" }, { streamId: "child-attempt-2-stream" }],
      id: "child-run",
      snapshot: { target: { agentId: "worker", serverId: "server" } },
      streamId: "run-child:child-run",
    },
  ])

  expect(initial?.entries[0]).toMatchObject({
    delegation: { childRunId: "child-run", childStreamId: "run-child:child-run" },
  })
  expect(retried?.entries[0]).toMatchObject({
    delegation: { childRunId: "child-run", childStreamId: "child-attempt-2-stream" },
  })
})

test("in-flight delegated activity does not cross-link a different agent", () => {
  const group = sessionStreamInFlightDerive(
    [
      {
        activities: [
          {
            agentId: "reviewer",
            id: "tool-call-new-key",
            kind: "tool-call",
            label: "delegate_task",
            task: "Inspect the project.",
            toolCallId: "new-key",
          },
        ],
        content: "",
        role: "assistant",
      },
    ],
    [
      {
        childRunId: "child-run",
        delegationKey: "original-key",
        id: "delegation-1",
        parentAttemptId: "parent-attempt",
        parentRunId: "parent-run",
        task: "Inspect the project.",
      },
    ],
    { parentAttemptId: "parent-attempt", parentRunId: "parent-run" },
    [
      {
        id: "parent-run",
        snapshot: { target: { agentId: "parent-agent", serverId: "server" } },
      },
      {
        id: "child-run",
        snapshot: { target: { agentId: "worker", serverId: "server" } },
      },
    ],
  )

  expect(group?.entries[0]?.delegation).toBeUndefined()
})
