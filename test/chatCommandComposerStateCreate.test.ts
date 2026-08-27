import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import type { CommandInspectionSnapshot } from "../src/commands/api/commandInspectionSnapshotSchema.js"
import { chatCommandComposerStateCreate } from "../src/ui/chatCommandComposerStateCreate.js"
import { chatCommandDraftParse } from "../src/ui/chatCommandDraftParse.js"
import { chatCommandKeyDownHandle } from "../src/ui/chatCommandKeyDownHandle.js"
import type { ChatCommandCatalogSource } from "../src/ui/chatCommandView.js"

const digest = `sha256-${createHash("sha256").update("template").digest("hex")}`

function commandCreate(
  name: string,
  template: string,
  overrides: Partial<CommandInspectionSnapshot> = {},
): CommandInspectionSnapshot {
  return {
    name,
    path: `.agents/commands/${name}.md`,
    precedence: 1,
    size: template.length,
    source: "project",
    template,
    templateDigest: digest,
    validation: "valid",
    ...overrides,
  }
}

const commands = [
  commandCreate("review", "Review $1 and $2."),
  commandCreate("git/commit", "Commit $ARGUMENTS", { description: "Commit staged work" }),
  commandCreate("audit", "Run the audit."),
  commandCreate("release", "Release !`git describe`.", {
    agent: "releaser",
    model: "cliproxyapi/opus",
    source: "global",
    subtask: true,
  }),
]

function stateCreate(
  options: {
    catalog?: readonly CommandInspectionSnapshot[]
    isBashEnabled?: boolean
    status?: ChatCommandCatalogSource["status"]
    errorMessage?: string
    initialDraft?: string
  } = {},
) {
  const [draft, setDraft] = createSignal(options.initialDraft ?? "")
  let retries = 0
  const catalog: ChatCommandCatalogSource = {
    commands: () => options.catalog ?? commands,
    errorMessage: () => options.errorMessage,
    isBashEnabled: () => options.isBashEnabled ?? true,
    retry: () => {
      retries += 1
    },
    status: options.status ?? (() => "ready"),
  }
  let state: ReturnType<typeof chatCommandComposerStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = chatCommandComposerStateCreate({
      catalog,
      draft,
      draftUpdate: setDraft,
      idPrefix: "test-command",
    })
    return rootDispose
  })
  return { dispose, draft, retryCount: () => retries, setDraft, state: state! }
}

test("a draft is only a command while it starts with a slash", () => {
  expect(chatCommandDraftParse("/review alpha")).toEqual({
    argumentsText: "alpha",
    isNameComplete: true,
    token: "review",
  })
  expect(chatCommandDraftParse("  /rev")).toEqual({ argumentsText: "", isNameComplete: false, token: "rev" })
  expect(chatCommandDraftParse("/")).toEqual({ argumentsText: "", isNameComplete: false, token: "" })
  expect(chatCommandDraftParse("/review first\nsecond")).toMatchObject({ argumentsText: "first\nsecond" })
  expect(chatCommandDraftParse("review")).toBeUndefined()
  expect(chatCommandDraftParse("prose\n/review")).toBeUndefined()
})

test("suggestions filter and rank by exact, prefix, substring, and trailing segment", () => {
  const { dispose, setDraft, state } = stateCreate()

  expect(state.isCommandDraft()).toBe(false)
  expect(state.suggestions()).toEqual([])

  setDraft("/re")
  expect(state.isCommandDraft()).toBe(true)
  expect(state.isSuggesting()).toBe(true)
  expect(state.suggestions().map(({ name }) => name)).toEqual(["release", "review"])

  setDraft("/commit")
  expect(state.suggestions().map(({ name }) => name)).toEqual(["git/commit"])

  setDraft("/")
  expect(state.suggestions().map(({ name }) => name)).toEqual(["audit", "git/commit", "release", "review"])

  setDraft("/zzz")
  expect(state.suggestions()).toEqual([])
  expect(state.statusMessage()).toBe('No command matches "zzz".')

  dispose()
})

test("suggestions carry the metadata the list renders and close once the name is complete", () => {
  const { dispose, setDraft, state } = stateCreate()

  setDraft("/rel")
  expect(state.suggestions()[0]).toMatchObject({
    agent: "releaser",
    isHighlighted: true,
    model: "cliproxyapi/opus",
    name: "release",
    source: "global",
    subtask: true,
  })

  // Once a separator is typed the detail preview replaces the list.
  setDraft("/release ")
  expect(state.isSuggesting()).toBe(false)
  expect(state.suggestions()).toEqual([])
  expect(state.preview()?.name).toBe("release")

  dispose()
})

test("keyboard navigation moves, wraps, jumps to edges, and completes the highlighted command", () => {
  const { dispose, draft, setDraft, state } = stateCreate()
  setDraft("/")

  expect(state.suggestions().find(({ isHighlighted }) => isHighlighted)?.name).toBe("audit")
  state.highlightMove(1)
  expect(state.suggestions().find(({ isHighlighted }) => isHighlighted)?.name).toBe("git/commit")
  state.highlightMove(-1)
  expect(state.suggestions().find(({ isHighlighted }) => isHighlighted)?.name).toBe("audit")
  // Moving up from the first entry wraps to the last.
  state.highlightMove(-1)
  expect(state.suggestions().find(({ isHighlighted }) => isHighlighted)?.name).toBe("review")

  state.highlightEdge("first")
  expect(state.highlightedOptionId()).toBe("test-command-option-audit")
  state.highlightEdge("last")
  expect(state.highlightedOptionId()).toBe("test-command-option-review")

  state.select()
  expect(draft()).toBe("/review ")

  dispose()
})

test("pointer highlighting and selection preserve the typed arguments", () => {
  const { dispose, draft, setDraft, state } = stateCreate()
  setDraft("/re")

  state.highlightSet("review")
  expect(state.highlightedOptionId()).toBe("test-command-option-review")
  // An unknown name never moves the highlight.
  state.highlightSet("missing")
  expect(state.highlightedOptionId()).toBe("test-command-option-review")

  // Selection rewrites only the command token and keeps the typed arguments.
  setDraft("/rev alpha beta")
  state.select("review")
  expect(draft()).toBe("/review alpha beta")

  state.select("missing")
  expect(draft()).toBe("/review alpha beta")

  dispose()
})

test("the key handler consumes navigation, completion, and dismissal while suggesting", () => {
  const { dispose, draft, setDraft, state } = stateCreate()
  setDraft("/rev")

  const eventCreate = (key: string, shiftKey = false) => {
    let prevented = false
    return {
      event: {
        isComposing: false,
        key,
        preventDefault: () => {
          prevented = true
        },
        shiftKey,
      } as KeyboardEvent,
      wasPrevented: () => prevented,
    }
  }

  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
    const { event, wasPrevented } = eventCreate(key)
    expect(chatCommandKeyDownHandle(event, state)).toBe(true)
    expect(wasPrevented()).toBe(true)
  }

  const enter = eventCreate("Enter")
  expect(chatCommandKeyDownHandle(enter.event, state)).toBe(true)
  expect(draft()).toBe("/review ")

  // After completion the list is closed, so Enter falls through to submission.
  const submitEnter = eventCreate("Enter")
  expect(chatCommandKeyDownHandle(submitEnter.event, state)).toBe(false)
  expect(submitEnter.wasPrevented()).toBe(false)

  setDraft("/rev")
  const shiftEnter = eventCreate("Enter", true)
  expect(chatCommandKeyDownHandle(shiftEnter.event, state)).toBe(false)
  const composing = { isComposing: true, key: "Enter", preventDefault: () => undefined } as KeyboardEvent
  expect(chatCommandKeyDownHandle(composing, state)).toBe(false)

  const escapeEvent = eventCreate("Escape")
  expect(chatCommandKeyDownHandle(escapeEvent.event, state)).toBe(true)
  expect(state.isSuggesting()).toBe(false)
  // Continuing to type reopens the list instead of leaving it dismissed.
  setDraft("/revi")
  expect(state.isSuggesting()).toBe(true)

  dispose()
})

test("the preview renders the locally expanded text, placeholders, and shell interpolation flag", () => {
  const { dispose, setDraft, state } = stateCreate()

  setDraft('/review alpha "beta gamma"')
  expect(state.preview()).toMatchObject({
    argumentsText: 'alpha "beta gamma"',
    declaredPlaceholders: ["1", "2"],
    expandedText: "Review alpha and beta gamma.",
    hasShellInterpolation: false,
    name: "review",
    source: "project",
    subtask: false,
    templateDigest: digest,
  })

  setDraft("/git/commit tidy up")
  expect(state.preview()).toMatchObject({
    declaredPlaceholders: ["ARGUMENTS"],
    description: "Commit staged work",
    expandedText: "Commit tidy up",
  })

  setDraft("/audit the parser")
  expect(state.preview()).toMatchObject({
    declaredPlaceholders: [],
    expandedText: "Run the audit.\n\nthe parser",
  })

  setDraft("/release now")
  expect(state.preview()).toMatchObject({ hasShellInterpolation: true, subtask: true })

  dispose()
})

test("validation messages are deterministic for empty, malformed, and unknown commands", () => {
  const { dispose, setDraft, state } = stateCreate()

  setDraft("plain prose")
  expect(state.errorMessage()).toBeUndefined()

  setDraft("/")
  expect(state.errorMessage()).toBe("Type a command name after the slash.")

  setDraft("/Review")
  expect(state.errorMessage()).toContain("is not a valid command name")

  setDraft("/rev")
  // A prefix with matches is still being typed, so it is not an error yet.
  expect(state.errorMessage()).toBeUndefined()

  setDraft("/nope ")
  expect(state.errorMessage()).toBe('The command "/nope" could not be found in this project.')

  setDraft('/review "unterminated')
  expect(state.errorMessage()).toContain("unterminated quote")

  dispose()
})

test("shell interpolation is refused locally when bash is disabled for the primary agent", () => {
  const enabled = stateCreate({ initialDraft: "/release now" })
  expect(enabled.state.errorMessage()).toBeUndefined()
  expect(enabled.state.invocation()).toEqual({ arguments: "now", name: "release" })
  enabled.dispose()

  const disabled = stateCreate({ initialDraft: "/release now", isBashEnabled: false })
  expect(disabled.state.errorMessage()).toContain("requires the bash tool to be enabled")
  expect(disabled.state.invocation()).toBeUndefined()
  // A command without interpolation is unaffected.
  disabled.setDraft("/audit now")
  expect(disabled.state.errorMessage()).toBeUndefined()
  disabled.dispose()
})

test("the resolved invocation carries only the command name and raw arguments", () => {
  const { dispose, setDraft, state } = stateCreate()

  setDraft('/review alpha "beta gamma"')
  expect(state.invocation()).toEqual({ arguments: 'alpha "beta gamma"', name: "review" })

  setDraft("/review")
  expect(state.invocation()).toEqual({ arguments: "", name: "review" })

  setDraft("/rev")
  expect(state.invocation()).toBeUndefined()

  setDraft("plain prose")
  expect(state.invocation()).toBeUndefined()

  dispose()
})

test("loading, unavailable, and error catalog states suppress suggestions and surface a retry", () => {
  const loading = stateCreate({ initialDraft: "/rev", status: () => "loading" })
  expect(loading.state.isSuggesting()).toBe(false)
  expect(loading.state.statusMessage()).toBe("Loading commands...")
  expect(loading.state.errorMessage()).toBeUndefined()
  loading.dispose()

  const unavailable = stateCreate({ initialDraft: "/rev", status: () => "unavailable" })
  expect(unavailable.state.statusMessage()).toBe("Commands are unavailable for this conversation.")
  unavailable.dispose()

  const failed = stateCreate({
    errorMessage: "The command catalog request failed.",
    initialDraft: "/rev",
    status: () => "error",
  })
  expect(failed.state.status()).toBe("error")
  expect(failed.state.errorMessage()).toBe("The command catalog request failed.")
  expect(failed.state.isSuggesting()).toBe(false)
  failed.state.retry()
  expect(failed.retryCount()).toBe(1)
  failed.dispose()
})

test("listbox and option ids are namespaced by the composer prefix", () => {
  const { dispose, setDraft, state } = stateCreate()
  expect(state.listboxId()).toBe("test-command-listbox")
  expect(state.optionId("review")).toBe("test-command-option-review")

  // The highlighted descendant is only advertised while the listbox is open.
  setDraft("/review ")
  expect(state.highlightedOptionId()).toBeUndefined()

  dispose()
})
