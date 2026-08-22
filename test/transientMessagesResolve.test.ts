import { expect, test } from "bun:test"
import { transientMessagesResolve } from "../src/ui/transientMessagesResolve.js"

test("transient turn renders while durable messages have not synchronized", () => {
  const resolved = transientMessagesResolve(
    [
      { content: "hello", id: "u1", role: "user" },
      { content: "Deterministic response: hello", id: "a1", role: "assistant" },
    ],
    [],
  )

  expect(resolved.map((message) => message.id)).toEqual(["u1", "a1"])
})

test("transient entries are removed as matching durable messages synchronize", () => {
  const transient = [
    { content: "hello", id: "u1", role: "user" as const },
    { content: "Deterministic response: hello", id: "a1", role: "assistant" as const },
  ]

  expect(transientMessagesResolve(transient, [{ content: "hello", role: "user" }]).map((m) => m.id)).toEqual(["a1"])
  expect(
    transientMessagesResolve(transient, [
      { content: "hello", role: "user" },
      { content: "Deterministic response: hello", role: "assistant" },
    ]),
  ).toEqual([])
})

test("repeated identical prompts reconcile one durable message at a time", () => {
  const resolved = transientMessagesResolve(
    [
      { content: "hello", id: "u1", role: "user" },
      { content: "hello", id: "u2", role: "user" },
    ],
    [{ content: "hello", role: "user" }],
  )

  expect(resolved.map((message) => message.id)).toEqual(["u2"])
})

test("empty in-flight assistant placeholders are not rendered", () => {
  expect(transientMessagesResolve([{ content: "", id: "a1", role: "assistant" }], [])).toEqual([])
})

test("role mismatch does not reconcile transient content", () => {
  const resolved = transientMessagesResolve(
    [{ content: "hello", id: "u1", role: "user" }],
    [{ content: "hello", role: "assistant" }],
  )

  expect(resolved.map((message) => message.id)).toEqual(["u1"])
})

test("transient messages converge by durable occurrence without dropping repeated prompts", () => {
  const transient = [
    { content: "same prompt", id: "transient-1", role: "user" as const },
    { content: "same prompt", id: "transient-2", role: "user" as const },
    { content: "answer", id: "transient-3", role: "assistant" as const },
  ]

  expect(
    transientMessagesResolve(transient, [
      { content: "same prompt", role: "user" },
      { content: "answer", role: "assistant" },
    ]),
  ).toEqual([{ content: "same prompt", id: "transient-2", role: "user" }])
})
