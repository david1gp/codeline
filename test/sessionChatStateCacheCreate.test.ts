import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import { sessionChatStateCacheCreate } from "../src/ui/sessionChatStateCacheCreate.js"
import type { SessionChatState } from "../src/ui/sessionChatStateCreate.js"

/**
 * `useChat` cannot be instantiated under `bun test` (the Solid entry resolves to
 * type declarations), so the cache is exercised with a composer stub that keeps
 * the same draft/submission semantics as `sessionChatStateCreate`.
 */
function chatStateStubCreate(options: { sessionId: string }) {
  const [draft, setDraft] = createSignal("")
  let disposed = false
  const state = {
    canSubmit: () => draft().trim().length > 0,
    draft,
    draftUpdate: setDraft,
    errorMessage: () => undefined,
    isBusy: () => false,
    isStopping: () => false,
    keyDownHandle: () => {},
    pendingMessages: () => [],
    recoveryStatus: () => "idle" as const,
    sessionId: options.sessionId,
    stopHandle: () => {},
    submitHandle: () => {},
    wasDisposed: () => disposed,
    markDisposed: () => {
      disposed = true
    },
  }
  return state
}

function cacheCreate() {
  const created: Array<ReturnType<typeof chatStateStubCreate>> = []
  const chatCreate = sessionChatStateCacheCreate({
    chatStateCreate: ((options: { sessionId: string }) => {
      const state = chatStateStubCreate(options)
      created.push(state)
      return state as unknown as SessionChatState
    }) as never,
    codelineExecution: () => null,
    durableMessages: () => [],
  })
  return { chatCreate: chatCreate as unknown as (id: string) => ReturnType<typeof chatStateStubCreate>, created }
}

test("repeated accessor reads reuse one composer so the draft survives and submission enables", () => {
  createRoot((dispose) => {
    const { chatCreate, created } = cacheCreate()

    const first = chatCreate("session/1")
    first.draftUpdate("hello workspace")
    const second = chatCreate("session/1")

    expect(second).toBe(first)
    expect(created.length).toBe(1)
    expect(second.draft()).toBe("hello workspace")
    expect(second.canSubmit()).toBe(true)

    dispose()
  })
})

test("selecting another session replaces the composer with an empty draft", () => {
  createRoot((dispose) => {
    const { chatCreate, created } = cacheCreate()

    const first = chatCreate("session/1")
    first.draftUpdate("hello workspace")
    const other = chatCreate("session/2")

    expect(other).not.toBe(first)
    expect(created.length).toBe(2)
    expect(other.sessionId).toBe("session/2")
    expect(other.draft()).toBe("")
    expect(other.canSubmit()).toBe(false)
    expect(chatCreate("session/2")).toBe(other)

    dispose()
  })
})

test("selected session state builds the chat accessor from the per-session cache", async () => {
  const view = await Bun.file(new URL("../src/ui/SelectedSession.tsx", import.meta.url)).text()
  const state = await Bun.file(new URL("../src/ui/selectedSessionStateCreate.ts", import.meta.url)).text()

  expect(view).toContain("props.state.chatCreate(sessionId)")
  expect(state).toContain("sessionChatStateCacheCreate")
  expect(state).not.toContain("chatCreate: (sessionId: string) =>")
})
