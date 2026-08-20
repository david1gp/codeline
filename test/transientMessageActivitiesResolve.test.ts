import { expect, test } from "bun:test"
import { transientMessageActivitiesResolve } from "../src/ui/transientMessageActivitiesResolve.js"

test("transient production chat activity maps thinking and tool parts without exposing text parts", () => {
  expect(
    transientMessageActivitiesResolve([
      { content: "ignored text", type: "text" },
      { content: "Reading the workspace", type: "thinking" },
      { id: "call-1", name: "read", output: "src/index.ts", state: "input-available", type: "tool-call" },
      { content: "Read complete", state: "output-available", toolCallId: "call-1", type: "tool-result" },
      { type: "unknown" },
    ] as Array<{ type: string }>),
  ).toEqual([
    { detail: "Reading the workspace", id: "thinking-1", kind: "thinking", label: "Thinking" },
    {
      detail: "src/index.ts",
      id: "tool-call-call-1",
      kind: "tool-call",
      label: "read",
      status: "input-available",
      toolCallId: "call-1",
    },
    {
      detail: "Read complete",
      id: "tool-result-call-1",
      kind: "tool-result",
      label: "Result",
      status: "output-available",
    },
  ])
})

test("transient delegate activity retains its task and target agent identity", () => {
  expect(
    transientMessageActivitiesResolve([
      {
        id: "delegate-call",
        input: { agentId: "worker", task: "Inspect the project." },
        name: "delegate_task",
        state: "input-complete",
        type: "tool-call",
      },
    ] as unknown as Array<{ type: string }>),
  ).toEqual([
    {
      agentId: "worker",
      id: "tool-call-delegate-call",
      kind: "tool-call",
      label: "delegate_task",
      status: "input-complete",
      task: "Inspect the project.",
      toolCallId: "delegate-call",
    },
  ])
})
