import type { ChatCommandComposerView } from "./chatCommandView.js"

/**
 * Keyboard ownership while the slash-command suggestion listbox is open. Returns
 * true when the command affordance consumed the event, so the composer neither
 * submits the draft nor moves the caret behind the user's back.
 */
export function chatCommandKeyDownHandle(event: KeyboardEvent, command: ChatCommandComposerView): boolean {
  if (event.isComposing) return false
  if (event.key === "Escape" && command.isSuggesting()) {
    event.preventDefault()
    command.dismiss()
    return true
  }
  if (!command.isSuggesting()) return false
  if (event.key === "ArrowDown") {
    event.preventDefault()
    command.highlightMove(1)
    return true
  }
  if (event.key === "ArrowUp") {
    event.preventDefault()
    command.highlightMove(-1)
    return true
  }
  if (event.key === "Home" || event.key === "End") {
    event.preventDefault()
    command.highlightEdge(event.key === "Home" ? "first" : "last")
    return true
  }
  // Enter and Tab complete the highlighted command instead of sending a draft that
  // is still only a prefix, so the first Enter never submits a partial command name.
  if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
    if (command.suggestions().length === 0) return false
    event.preventDefault()
    command.select()
    return true
  }
  return false
}
