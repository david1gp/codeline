import { expect, mock, test } from "bun:test"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => import("solid-js/dist/solid.js"))

const { sessionChatPendingMessagesCreate } = await import("../src/ui/sessionChatPendingMessagesCreate.js")

type Message = {
  content: string
  id: string
  role: "assistant" | "user"
}

function messageCreate(id: string, role: Message["role"], content: string): Message {
  return { content, id, role }
}

test("reuses pending message views by ID through immutable updates, removal, and reorder", () => {
  createRoot((dispose) => {
    const [messages, messagesSet] = createSignal<ReadonlyArray<Message>>([
      messageCreate("user-1", "user", "first"),
      messageCreate("assistant-run-1", "assistant", "reply"),
      messageCreate("user-2", "user", "second"),
    ])
    const state = sessionChatPendingMessagesCreate({
      isBusy: () => true,
      messages,
      runId: () => "run-1",
    })

    const first = state.pendingMessages()
    messagesSet([
      messageCreate("user-1", "user", "updated first"),
      messageCreate("assistant-run-1", "assistant", "updated reply"),
      messageCreate("user-2", "user", "updated second"),
    ])
    const updated = state.pendingMessages()

    expect(updated[0]).toBe(first[0])
    expect(updated[1]).toBe(first[1])
    expect(updated[2]).toBe(first[2])
    expect(updated[0]?.content).toBe("updated first")
    expect(updated[1]?.content).toBe("updated reply")

    messagesSet([
      messageCreate("user-2", "user", "updated second again"),
      messageCreate("assistant-run-1", "assistant", "updated reply again"),
    ])
    const reordered = state.pendingMessages()

    expect(reordered).toEqual([first[2]!, first[1]!])
    expect(reordered[0]?.content).toBe("updated second again")
    expect(reordered[1]?.content).toBe("updated reply again")

    messagesSet([messageCreate("user-1", "user", "first again")])
    const readded = state.pendingMessages()
    expect(readded[0]).not.toBe(first[0])

    dispose()
  })
})

test("streams only the active assistant message and clears streaming when inactive", () => {
  createRoot((dispose) => {
    const [messages, messagesSet] = createSignal<ReadonlyArray<Message>>([
      messageCreate("assistant-run-1", "assistant", "active"),
      messageCreate("assistant-run-2", "assistant", "other"),
      messageCreate("user-1", "user", "prompt"),
    ])
    const [runId, runIdSet] = createSignal<string | null>("run-1")
    const [isBusy, isBusySet] = createSignal(true)
    const state = sessionChatPendingMessagesCreate({ isBusy, messages, runId })

    const pending = state.pendingMessages()
    expect(pending.map((message) => message.isStreaming)).toEqual([true, false, false])

    isBusySet(false)
    expect(pending.map((message) => message.isStreaming)).toEqual([false, false, false])

    isBusySet(true)
    runIdSet("run-2")
    expect(pending.map((message) => message.isStreaming)).toEqual([false, true, false])

    messagesSet([messageCreate("assistant-run-2", "assistant", "new active")])
    const next = state.pendingMessages()
    expect(next[0]?.isStreaming).toBe(true)

    runIdSet(null)
    expect(next[0]?.isStreaming).toBe(false)

    dispose()
  })
})
