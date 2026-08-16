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
