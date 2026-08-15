import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import type { SessionChatState } from "../src/ui/sessionChatStateCreate.js"
import { sessionInitialMessageStateCreate } from "../src/ui/sessionInitialMessageStateCreate.js"

function chatStateCreate(submit: () => Promise<void>) {
  const [draft, setDraft] = createSignal("")
  return {
    attemptCount: () => 0,
    canSubmit: () => draft().trim().length > 0,
    draft,
    draftUpdate: setDraft,
    errorMessage: () => undefined,
    failures: () => [],
    isAborted: () => false,
    isBusy: () => false,
    isStopping: () => false,
    isThinking: () => false,
    keyDownHandle: () => undefined,
    pendingMessages: () => [],
    recoveryStatus: () => "idle" as const,
    stopHandle: () => undefined,
    submit,
    submitHandle: () => undefined,
  } satisfies SessionChatState
}

function stateCreate(options: {
  create: () => Promise<string | null>
  selected?: string | null
  targetAvailable?: boolean
  createError?: string
  ready?: (sessionId: string) => Promise<boolean>
  submit?: () => Promise<void>
}) {
  const [selected, setSelected] = createSignal(options.selected ?? null)
  const chat = chatStateCreate(options.submit ?? (async () => undefined))
  let state: ReturnType<typeof sessionInitialMessageStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionInitialMessageStateCreate({
      chatCreate: () => chat,
      selectedSessionId: selected,
      sessionCreateErrorMessage: () => options.createError,
      sessionCreateStart: async () => {
        const sessionId = await options.create()
        if (sessionId !== null) setSelected(sessionId)
        return sessionId
      },
      sessionReady: options.ready ?? (async (sessionId) => selected() === sessionId),
      sessionTargetAvailable: () => options.targetAvailable ?? true,
    })
    return rootDispose
  })
  return { chat, dispose, setSelected, state: state! }
}

test("sending without a session creates, selects, waits, and dispatches the preserved draft", async () => {
  const calls: string[] = []
  const created = stateCreate({
    create: async () => {
      calls.push("create")
      return "session-1"
    },
    ready: async (sessionId) => {
      calls.push(`ready:${sessionId}`)
      return true
    },
    submit: async () => {
      calls.push("submit")
    },
  })
  created.state.chat.draftUpdate("  hello workspace  ")

  await created.state.chat.submit()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(calls).toEqual(["create", "ready:session-1", "submit"])
  expect(created.state.chat.draft()).toBe("")
  expect(created.state.isVisible()).toBe(false)
  created.dispose()
})

test("duplicate sends share the in-flight create and dispatch", async () => {
  let createCount = 0
  let submitCount = 0
  let releaseSubmit: () => void = () => undefined
  const submitGate = new Promise<void>((resolve) => {
    releaseSubmit = resolve
  })
  const created = stateCreate({
    create: async () => {
      createCount += 1
      return "session-1"
    },
    submit: async () => {
      submitCount += 1
      await submitGate
    },
  })
  created.state.chat.draftUpdate("hello")

  const first = created.state.chat.submit()
  const duplicate = created.state.chat.submit()
  expect(first).toBe(duplicate)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(createCount).toBe(1)
  expect(submitCount).toBe(1)

  releaseSubmit()
  await first
  created.dispose()
})

test("an unavailable target keeps the draft and reports an actionable error", async () => {
  let createCount = 0
  const created = stateCreate({
    create: async () => {
      createCount += 1
      return "session-1"
    },
    targetAvailable: false,
  })
  created.state.chat.draftUpdate("hello")

  await created.state.chat.submit().catch(() => undefined)

  expect(createCount).toBe(0)
  expect(created.state.chat.draft()).toBe("hello")
  expect(created.state.chat.errorMessage()).toBe("Select an available agent before sending.")
  created.dispose()
})

test("a failed create keeps the draft and exposes the create failure", async () => {
  const created = stateCreate({
    create: async () => null,
    createError: "The conversation could not be created. Check the selected agent and try again.",
  })
  created.state.chat.draftUpdate("hello")

  await created.state.chat.submit().catch(() => undefined)

  expect(created.state.chat.draft()).toBe("hello")
  expect(created.state.chat.errorMessage()).toBe(
    "The conversation could not be created. Check the selected agent and try again.",
  )
  expect(created.state.isVisible()).toBe(true)
  created.dispose()
})

test("a failed dispatch keeps the created session and draft for retry", async () => {
  let createCount = 0
  let submitCount = 0
  const created = stateCreate({
    create: async () => {
      createCount += 1
      return "session-1"
    },
    submit: async () => {
      submitCount += 1
      if (submitCount === 1) throw new Error("The message could not be dispatched.")
    },
  })
  created.state.chat.draftUpdate("hello")

  await created.state.chat.submit().catch(() => undefined)
  expect(created.state.chat.draft()).toBe("hello")
  expect(created.state.chat.errorMessage()).toBe("The message could not be dispatched.")

  await created.state.chat.submit()
  expect(createCount).toBe(1)
  expect(submitCount).toBe(2)
  expect(created.state.chat.draft()).toBe("")
  created.dispose()
})
