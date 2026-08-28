import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)
mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(value: T) => {
    const [get, set] = solidRuntime.createSignal(value)
    return { get, set }
  },
}))

const { demoSessionResourceSelectorStateCreate } = await import(
  "../src/ui/demo/demoSessionResourceSelectorStateCreate.js"
)
const { sessionCreationContextPopoverStateCreate } = await import(
  "../src/ui/sessionCreationContextPopoverStateCreate.js"
)

const popoverSource = await Bun.file(new URL("../src/ui/SessionCreationContextPopover.tsx", import.meta.url)).text()
const sidebarSource = await Bun.file(new URL("../src/ui/SessionCreationResourceSidebar.tsx", import.meta.url)).text()

const projectSnapshot = {
  canonicalPath: "/repo/AGENTS.md",
  content: "Root instructions.",
  digest: `sha256-${"a".repeat(64)}`,
  path: "AGENTS.md",
  precedence: 0,
  scope: ".",
  size: 18,
  source: "project" as const,
  validation: "valid" as const,
}
const capturedSnapshot = {
  digest: `sha256-${"b".repeat(64)}`,
  path: "src/AGENTS.md",
  precedence: 1,
  scope: "src",
  size: 40,
  source: "project" as const,
  validation: "valid" as const,
}

function stateCreate() {
  return solidRuntime.createRoot(() => {
    const demo = demoSessionResourceSelectorStateCreate(() => "ready")
    const [contents, contentsSet] = solidRuntime.createSignal<Readonly<Record<string, string>>>({
      "/repo/AGENTS.md": projectSnapshot.content,
    })
    const resources = {
      ...demo,
      instructionContent: (canonicalPath: string) => contents()[canonicalPath],
      instructionContentChange: (canonicalPath: string, value: string) =>
        contentsSet({ ...contents(), [canonicalPath]: value }),
      instructionSnapshots: () => [projectSnapshot, capturedSnapshot],
    }
    return { contents, resources, state: sessionCreationContextPopoverStateCreate(() => resources) }
  })
}

test("every included source exposes its canonical path and context estimate", () => {
  const { state } = stateCreate()

  expect(state.sources()).toEqual([
    {
      canonicalPath: "/repo/AGENTS.md",
      characterCount: 18,
      content: "Root instructions.",
      estimatedTokens: 5,
      isEditable: true,
      path: "AGENTS.md",
      scope: ".",
      source: "project",
    },
    {
      canonicalPath: undefined,
      characterCount: 40,
      content: "",
      estimatedTokens: 10,
      // Captured sources carry no content, so they stay read-only.
      isEditable: false,
      path: "src/AGENTS.md",
      scope: "src",
      source: "project",
    },
  ])
})

test("the total estimate sums the system prompt and every included source", () => {
  const { state } = stateCreate()

  // 35 prompt characters plus 18 and 40 instruction characters.
  expect(state.totalCharacterCount()).toBe(93)
  expect(state.totalEstimatedTokens()).toBe(24)
})

test("editing a source content updates its estimate through the session-scoped setter", () => {
  const { contents, state } = stateCreate()

  state.sourceContentChange("/repo/AGENTS.md", "Longer root instructions here.")

  expect(contents()["/repo/AGENTS.md"]).toBe("Longer root instructions here.")
  expect(state.sources()[0]).toMatchObject({ characterCount: 30, estimatedTokens: 8 })
})

test("clearing an available source reports zero characters and tokens", () => {
  const { state } = stateCreate()

  state.sourceContentChange("/repo/AGENTS.md", "")

  expect(state.sources()[0]).toMatchObject({ characterCount: 0, estimatedTokens: 0 })
  expect(state.sources()[1]).toMatchObject({ characterCount: 40, estimatedTokens: 10 })
})

test("the popover renders editable prompt and source content in the creation sidebar", () => {
  expect(popoverSource).toContain('from "#ui/interactive/popover/CorvuPopover.jsx"')
  expect(popoverSource).toContain('from "#ui/input/textarea/Textarea.jsx"')
  expect(popoverSource).toContain("state.agentPromptChange")
  expect(popoverSource).toContain("state.sourceContentChange")
  expect(popoverSource).toContain("entry.canonicalPath")
  expect(popoverSource).toContain("state.totalEstimatedTokens()")
  // The selection stays session-scoped, so the popover never persists a default.
  expect(popoverSource).toContain("Prompt and instruction edits apply to the new session only.")
  expect(popoverSource).not.toContain("fetch(")
  // Compact styling stays responsive on narrow viewports.
  expect(popoverSource).toContain("max-[760px]:w-[calc(100vw-2rem)]")

  expect(sidebarSource).toContain("<SessionCreationContextPopover")
})
