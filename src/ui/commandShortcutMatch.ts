export function commandShortcutMatch(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return false
  if (event.key.toLowerCase() !== "o" || event.isComposing || event.keyCode === 229) return false
  const target = event.target
  if (typeof target !== "object" || target === null || !("closest" in target)) return true
  const element = target as HTMLElement
  if (element.isContentEditable) return false
  return !element.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")
}
