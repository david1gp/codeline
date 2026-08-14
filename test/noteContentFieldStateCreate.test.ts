import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { markdownHtmlRender } from "../src/markdown/markdownHtmlRender.js"
import { noteContentFieldStateCreate } from "../src/note/ui/noteContentFieldStateCreate.js"
import { noteContentTitleDerive } from "../src/note/ui/noteContentTitleDerive.js"
import { noteViewModeRead } from "../src/note/ui/noteViewModeRead.js"
import { noteViewModeStateCreate } from "../src/note/ui/noteViewModeStateCreate.js"
import { noteViewModeStorageKey } from "../src/note/ui/noteViewModeStorageKey.js"
import type { NoteViewMode } from "../src/note/ui/noteViewModeSchema.js"

test("note content field shows the editor, the preview, or both per view mode", () => {
  const root = createRoot((dispose) => {
    let mode: NoteViewMode = "edit"
    const state = noteContentFieldStateCreate({
      content: () => "Heading\n\nDetail with **bold**.",
      viewMode: () => mode,
    })
    return { dispose, state, modeSet: (value: NoteViewMode) => (mode = value) }
  })

  expect(root.state.isEditorVisible()).toBe(true)
  expect(root.state.isPreviewVisible()).toBe(false)
  expect(root.state.isSplit()).toBe(false)

  root.modeSet("preview")
  expect(root.state.isEditorVisible()).toBe(false)
  expect(root.state.isPreviewVisible()).toBe(true)
  expect(root.state.previewHtml()).toContain("<strong>bold</strong>")

  root.modeSet("split")
  expect(root.state.isEditorVisible()).toBe(true)
  expect(root.state.isPreviewVisible()).toBe(true)
  expect(root.state.isSplit()).toBe(true)
  root.dispose()
})

test("note content field reports empty content and sanitizes preview HTML", () => {
  const root = createRoot((dispose) => ({
    dispose,
    state: noteContentFieldStateCreate({
      content: () => "<script>globalThis.compromised = true</script>\n\n[unsafe](javascript:alert(1))",
      viewMode: () => "preview",
    }),
  }))

  expect(root.state.isPreviewEmpty()).toBe(false)
  expect(root.state.previewHtml()).not.toContain("<script")
  expect(root.state.previewHtml()).toContain('<a href="">unsafe</a>')
  root.dispose()

  const empty = createRoot((dispose) => ({
    dispose,
    state: noteContentFieldStateCreate({ content: () => "  \n", viewMode: () => "preview" }),
  }))
  expect(empty.state.isPreviewEmpty()).toBe(true)
  empty.dispose()
})

test("the shared Markdown renderer backs both notes and finalized messages", () => {
  expect(markdownHtmlRender("```ts\nconst answer = 42\n```")).toContain('<code class="language-ts">')
})

test("the note title comes from the first line with a fallback and a 50 character cap", () => {
  expect(noteContentTitleDerive("")).toBe("New Note")
  expect(noteContentTitleDerive("   \n\n  ")).toBe("New Note")
  expect(noteContentTitleDerive("  Shopping list  \nmilk")).toBe("Shopping list")
  expect(noteContentTitleDerive(`${"a".repeat(80)}\nrest`)).toBe("a".repeat(50))
})

test("the view mode read stays defensive when storage is unavailable", () => {
  expect(globalThis.localStorage).toBeUndefined()
  expect(noteViewModeRead()).toBe("edit")
})

test("the view mode is shared through one defensive global storage key", () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  }
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true })

  expect(noteViewModeRead()).toBe("edit")

  localStorage.setItem(noteViewModeStorageKey, "not-a-mode")
  expect(noteViewModeRead()).toBe("edit")

  const root = createRoot((dispose) => ({ dispose, state: noteViewModeStateCreate() }))
  expect(root.state.viewMode()).toBe("edit")
  root.state.viewModeSelect("split")
  expect(root.state.viewMode()).toBe("split")
  expect(localStorage.getItem(noteViewModeStorageKey)).toBe("split")
  expect(noteViewModeRead()).toBe("split")
  root.dispose()

  Reflect.deleteProperty(globalThis, "localStorage")
})

test("both note pages render the shared switcher, back icon, and debounced title", async () => {
  const field = await Bun.file(new URL("../src/note/ui/NoteContentField.tsx", import.meta.url)).text()
  expect(field).toContain('id="note-content"')
  expect(field).toContain("onInput={props.contentUpdate}")
  expect(field).toContain("innerHTML={")

  const switcher = await Bun.file(new URL("../src/note/ui/NoteViewModeSwitcher.tsx", import.meta.url)).text()
  expect(switcher).toContain("<legend")
  expect(switcher).toContain("Note view mode")
  expect(switcher).toContain("aria-pressed=")
  expect(switcher).toContain("aria-label={option.label}")

  const backLink = await Bun.file(new URL("../src/note/ui/NoteBackLink.tsx", import.meta.url)).text()
  expect(backLink).toContain('aria-hidden="true"')
  expect(backLink).toContain("Back to notes")

  const titleState = await Bun.file(new URL("../src/note/ui/noteTitleStateCreate.ts", import.meta.url)).text()
  expect(titleState).toContain("setTimeout")

  for (const path of ["../src/note/ui/NotePage.tsx", "../src/note/ui/NewNotePage.tsx"]) {
    const source = await Bun.file(new URL(path, import.meta.url)).text()
    expect(source).toContain("<NoteContentField")
    expect(source).toContain("<NoteViewModeSwitcher")
    expect(source).toContain("<NoteBackLink")
    expect(source).toContain("{state.title()}")
    expect(source).not.toContain("<textarea")
  }
})
