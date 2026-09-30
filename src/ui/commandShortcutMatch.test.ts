import { describe, expect, it } from "bun:test"
import { commandShortcutMatch } from "./commandShortcutMatch.js"

function shortcutEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    altKey: false,
    ctrlKey: true,
    isComposing: false,
    key: "o",
    keyCode: 0,
    metaKey: false,
    shiftKey: true,
    target: null,
    ...overrides,
  } as KeyboardEvent
}

describe("commandShortcutMatch", () => {
  it("matches Ctrl or Cmd+Shift+O without composition", () => {
    expect(commandShortcutMatch(shortcutEvent())).toBe(true)
    expect(commandShortcutMatch(shortcutEvent({ ctrlKey: false, metaKey: true }))).toBe(true)
  })

  it("does not match unrelated modifiers or composition", () => {
    expect(commandShortcutMatch(shortcutEvent({ shiftKey: false }))).toBe(false)
    expect(commandShortcutMatch(shortcutEvent({ altKey: true }))).toBe(false)
    expect(commandShortcutMatch(shortcutEvent({ isComposing: true }))).toBe(false)
    expect(commandShortcutMatch(shortcutEvent({ keyCode: 229 }))).toBe(false)
  })

  it("does not interrupt editable controls", () => {
    const input = {
      closest: () => input,
      isContentEditable: false,
    } as unknown as Element
    expect(commandShortcutMatch(shortcutEvent({ target: input }))).toBe(false)
  })
})
