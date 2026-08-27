import { expect, test } from "bun:test"

const suggestions = await Bun.file(new URL("../src/ui/ChatCommandSuggestions.tsx", import.meta.url)).text()
const sessionChat = await Bun.file(new URL("../src/ui/SessionChat.tsx", import.meta.url)).text()

test("the suggestion list renders as an accessible listbox with identified options", () => {
  expect(suggestions).toContain('role="listbox"')
  expect(suggestions).toContain('aria-label="Slash commands"')
  expect(suggestions).toContain("id={props.state.listboxId()}")
  expect(suggestions).toContain('role="option"')
  expect(suggestions).toContain("id={props.state.optionId(suggestion.name)}")
  expect(suggestions).toContain("aria-selected={suggestion.isHighlighted}")
  expect(suggestions).toContain("tabIndex={-1}")
})

test("pointer interaction highlights and selects without stealing the composer caret", () => {
  expect(suggestions).toContain("onMouseEnter={() => props.state.highlightSet(suggestion.name)}")
  expect(suggestions).toContain("onMouseDown={(event) => event.preventDefault()}")
  expect(suggestions).toContain("onClick={() => props.state.select(suggestion.name)}")
})

test("the detail preview renders the expansion, placeholders, metadata, and template digest", () => {
  expect(suggestions).toContain("<Show when={props.state.preview()}>")
  expect(suggestions).toContain("{preview().expandedText}")
  expect(suggestions).toContain("preview().declaredPlaceholders")
  expect(suggestions).toContain("{preview().templateDigest}")
  expect(suggestions).toContain("preview().hasShellInterpolation")
  expect(suggestions).toContain("runs bash interpolation")
  expect(suggestions).toContain("runs as subtask")
})

test("status and validation messages are announced and the error offers a retry", () => {
  expect(suggestions).toContain('role="status"')
  expect(suggestions).toContain('role="alert"')
  expect(suggestions).toContain("{props.state.statusMessage()}")
  expect(suggestions).toContain("{props.state.errorMessage()}")
  expect(suggestions).toContain('props.state.status() === "error"')
  expect(suggestions).toContain("onClick={props.state.retry}")
})

test("the view is a pure projection that never owns filtering or expansion", () => {
  expect(suggestions).not.toContain("commandTemplateExpand")
  expect(suggestions).not.toContain("commandArgumentsTokenize")
  expect(suggestions).not.toContain("createSignal")
  expect(suggestions).not.toContain("filter(")
})

test("the composer wires the command affordance into the textarea's ARIA relationships", () => {
  expect(sessionChat).toContain("<ChatCommandSuggestions state={command()} />")
  expect(sessionChat).toContain("aria-controls={props.state.command?.isSuggesting() === true")
  expect(sessionChat).toContain("aria-activedescendant={props.state.command?.highlightedOptionId()}")
  expect(sessionChat).toContain("type / to run a command")
})
