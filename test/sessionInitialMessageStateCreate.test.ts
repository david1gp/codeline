import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import type { SessionChatState } from "../src/ui/sessionChatStateCreate.js"
import { sessionInitialMessageStateCreate } from "../src/ui/sessionInitialMessageStateCreate.js"

function chatStateCreate(submit: () => Promise<void>, draftUpdates: string[] = []) {
  const [draft, setDraft] = createSignal("")
  return {
    attemptCount: () => 0,
    canSubmit: () => draft().trim().length > 0,
    draft,
    draftUpdate: (value: string) => {
      draftUpdates.push(value)
      setDraft(value)
    },
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
  const chatCreateCalls: string[] = []
  const sessionChats = new Map<string, ReturnType<typeof chatStateCreate>>()
  const sessionDraftUpdates = new Map<string, string[]>()
  const chatCreate = (sessionId: string) => {
    chatCreateCalls.push(sessionId)
    const existing = sessionChats.get(sessionId)
    if (existing !== undefined) return existing
    const draftUpdates: string[] = []
    const created = chatStateCreate(options.submit ?? (async () => undefined), draftUpdates)
    sessionChats.set(sessionId, created)
    sessionDraftUpdates.set(sessionId, draftUpdates)
    return created
  }
  let state: ReturnType<typeof sessionInitialMessageStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionInitialMessageStateCreate({
      chatCreate,
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
  return { chatCreate, chatCreateCalls, dispose, sessionChats, sessionDraftUpdates, setSelected, state: state! }
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

test("a recovered draft follows newly typed text through the selected composer remount", async () => {
  const created = stateCreate({
    create: async () => "session-1",
    submit: async () => {
      throw new Error("The message could not be dispatched.")
    },
  })
  created.state.chat.draftUpdate("failed submission")

  await created.state.chat.submit().catch(() => undefined)

  expect(created.state.chat.draft()).toBe("failed submission")
  expect(created.state.isVisible()).toBe(true)
  expect(created.chatCreateCalls).toEqual(["session-1"])

  // Editing the recovered initial composer replaces the failed text. Clearing
  // the error remounts the selected-session composer, which must see that draft.
  created.state.chat.draftUpdate("new draft")

  expect(created.state.chat.draft()).toBe("new draft")
  expect(created.state.isVisible()).toBe(false)
  expect(created.chatCreateCalls).toEqual(["session-1"])
  const selectedChat = created.chatCreate("session-1")

  // The keyed selected-session composer reuses the created session's distinct
  // state; remounting it must not resend either forwarded draft update.
  expect(selectedChat).not.toBe(created.state.chat)
  expect(created.chatCreate("session-1")).toBe(selectedChat)
  expect(selectedChat.draft()).toBe("new draft")
  expect(created.sessionDraftUpdates.get("session-1")).toEqual(["failed submission", "new draft"])
  created.dispose()
})

test("a re-keyed selected session does not receive text through the stale composer", async () => {
  const created = stateCreate({
    create: async () => "session-1",
    submit: async () => {
      throw new Error("The message could not be dispatched.")
    },
  })
  created.state.chat.draftUpdate("failed submission")

  await created.state.chat.submit().catch(() => undefined)
  const staleDraftUpdate = created.state.chat.draftUpdate
  const sessionOneChat = created.chatCreate("session-1")
  created.setSelected("session-2")
  await new Promise((resolve) => setTimeout(resolve, 0))
  const sessionTwoChat = created.chatCreate("session-2")
  staleDraftUpdate("new session draft")

  expect(sessionOneChat).not.toBe(sessionTwoChat)
  expect(sessionOneChat.draft()).toBe("failed submission")
  expect(created.sessionDraftUpdates.get("session-1")).toEqual(["failed submission"])
  expect(created.sessionDraftUpdates.get("session-2")).toEqual([])
  expect(sessionTwoChat.draft()).toBe("")
  created.dispose()
})

const commandDigest = `sha256-${"e".repeat(64)}`

function commandCatalogCreate(options: { isBashEnabled?: boolean } = {}) {
  return {
    commands: () => [
      {
        description: "Review a change",
        name: "review",
        path: ".agents/commands/review.md",
        precedence: 1,
        size: 10,
        source: "project" as const,
        template: "Review $1 and $2.",
        templateDigest: commandDigest,
        validation: "valid" as const,
      },
      {
        name: "release",
        path: ".agents/commands/release.md",
        precedence: 1,
        size: 10,
        source: "project" as const,
        template: "Release !`git describe`.",
        templateDigest: commandDigest,
        validation: "valid" as const,
      },
    ],
    errorMessage: () => undefined,
    isBashEnabled: () => options.isBashEnabled ?? true,
    retry: () => undefined,
    status: () => "ready" as const,
  }
}

function commandStateCreate(options: {
  catalog?: ReturnType<typeof commandCatalogCreate>
  submit?: () => Promise<void>
}) {
  const [selected, setSelected] = createSignal<string | null>(null)
  const chat = chatStateCreate(options.submit ?? (async () => undefined))
  const created: Array<{ command?: { arguments: string; name: string }; projectPath?: string }> = []
  let state: ReturnType<typeof sessionInitialMessageStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionInitialMessageStateCreate({
      chatCreate: () => chat,
      commandCatalog: options.catalog ?? commandCatalogCreate(),
      selectedSessionId: selected,
      sessionCreateErrorMessage: () => undefined,
      sessionCreateStart: async (projectPath, command) => {
        created.push({
          ...(command === undefined ? {} : { command }),
          ...(projectPath === undefined ? {} : { projectPath }),
        })
        setSelected("session-command")
        return "session-command"
      },
      sessionReady: async () => true,
      sessionTargetAvailable: () => true,
    })
    return rootDispose
  })
  return { chat, created, dispose, state: state! }
}

test("a pre-session command draft creates the session with the typed invocation and hands off the expansion", async () => {
  const submitted: string[] = []
  const created = commandStateCreate({
    submit: async () => {
      submitted.push("submit")
    },
  })
  created.state.chat.draftUpdate('/review alpha "beta gamma"')

  expect(created.state.chat.command?.preview()?.expandedText).toBe("Review alpha and beta gamma.")
  expect(created.state.chat.canSubmit()).toBe(true)

  await created.state.chat.submit()
  await new Promise((resolve) => setTimeout(resolve, 0))

  // The command travels with creation so its overrides are captured in the
  // immutable selection before the session exists.
  expect(created.created).toEqual([{ command: { arguments: 'alpha "beta gamma"', name: "review" } }])
  // The turn is dispatched through the normal chat path of the created session.
  expect(created.chat.draft()).toBe('/review alpha "beta gamma"')
  expect(submitted).toEqual(["submit"])
  created.dispose()
})

test("a pre-session prose draft creates the session without any command identity", async () => {
  const created = commandStateCreate({})
  created.state.chat.draftUpdate("just prose")

  await created.state.chat.submit()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(created.created).toEqual([{}])
  expect(created.chat.draft()).toBe("just prose")
  created.dispose()
})

test("an invalid pre-session command draft never creates a session and keeps the draft", async () => {
  const created = commandStateCreate({})
  created.state.chat.draftUpdate("/nope ")

  expect(created.state.chat.canSubmit()).toBe(false)
  await created.state.chat.submit()

  expect(created.created).toEqual([])
  expect(created.state.chat.draft()).toBe("/nope ")
  expect(created.state.chat.errorMessage()).toBe('The command "/nope" could not be found in this project.')
  created.dispose()
})

test("a pre-session interpolation command is refused while bash is disabled for the primary agent", async () => {
  const created = commandStateCreate({ catalog: commandCatalogCreate({ isBashEnabled: false }) })
  created.state.chat.draftUpdate("/release now")

  await created.state.chat.submit()

  expect(created.created).toEqual([])
  expect(created.state.chat.errorMessage()).toContain("requires the bash tool to be enabled")
  created.dispose()
})

test("the pre-session composer gives the command affordance ownership of the arrow keys", () => {
  const created = commandStateCreate({})
  created.state.chat.draftUpdate("/re")

  let prevented = false
  created.state.chat.keyDownHandle({
    isComposing: false,
    key: "ArrowDown",
    preventDefault: () => {
      prevented = true
    },
    shiftKey: false,
  } as KeyboardEvent)
  expect(prevented).toBe(true)

  created.state.chat.keyDownHandle({
    isComposing: false,
    key: "Enter",
    preventDefault: () => undefined,
    shiftKey: false,
  } as KeyboardEvent)
  // The first Enter completes the highlighted command instead of submitting a prefix.
  expect(created.created).toEqual([])
  expect(created.state.chat.draft()).toBe("/review ")
  created.dispose()
})
