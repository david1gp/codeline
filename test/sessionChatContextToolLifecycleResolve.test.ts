import { expect, test } from "bun:test"
import type { CompactionMessage } from "../src/compaction/compactionMessage.js"
import { sessionChatContextToolLifecycleResolve } from "../src/session/actions/sessionChatContextToolLifecycleResolve.js"

const preparedUserMessage = { id: "prepared-user", sequence: 2 }

test("rejects duplicate assistant tool-call IDs", () => {
  const history: CompactionMessage[] = [
    { role: "user", ...preparedUserMessage },
    {
      role: "assistant",
      toolCalls: [
        { id: "duplicate-call", name: "inspect" },
        { id: "duplicate-call", name: "inspect" },
      ],
    },
    { role: "tool", toolCallId: "duplicate-call" },
  ]

  expect(sessionChatContextToolLifecycleResolve(history, preparedUserMessage)).toMatchObject({ complete: false })
})

test("matches a prepared user by exact durable identity", () => {
  const history: CompactionMessage[] = [
    { content: "prepared", role: "user", ...preparedUserMessage },
    { role: "assistant", toolCalls: [{ id: "call-1", name: "inspect" }] },
    { role: "tool", toolCallId: "call-1" },
  ]

  expect(sessionChatContextToolLifecycleResolve(history, preparedUserMessage)).toMatchObject({
    complete: true,
    suffix: [{ role: "assistant" }, { role: "tool", toolCallId: "call-1" }],
  })
})

test("falls back to sequence when the durable user ID is absent", () => {
  const history: CompactionMessage[] = [
    { content: "prepared", role: "user", sequence: preparedUserMessage.sequence },
    { role: "assistant", toolCalls: [{ id: "call-1", name: "inspect" }] },
    { role: "tool", toolCallId: "call-1" },
  ]

  expect(sessionChatContextToolLifecycleResolve(history, preparedUserMessage)).toMatchObject({ complete: true })
})

test("does not let a conflicting durable ID match by sequence", () => {
  const history: CompactionMessage[] = [
    { content: "prepared", role: "user", id: preparedUserMessage.id, sequence: 99 },
    { role: "assistant", toolCalls: [{ id: "call-1", name: "inspect" }] },
    { role: "tool", toolCallId: "call-1" },
    { content: "different", role: "user", id: "different-user", sequence: preparedUserMessage.sequence },
  ]

  expect(sessionChatContextToolLifecycleResolve(history, preparedUserMessage)).toMatchObject({
    complete: true,
    suffix: [{ role: "assistant" }, { role: "tool", toolCallId: "call-1" }, { role: "user", id: "different-user" }],
  })
})
