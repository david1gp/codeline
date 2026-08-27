import { createResult, createResultError, type Result } from "@adaptive-ds/result"

const commandPlaceholderPattern = /\$\{(ARGUMENTS|[0-9]+)\}|\$(ARGUMENTS|[0-9]+)/gu

function commandPlaceholderValueResolve(
  name: string,
  argumentsText: string,
  argumentsList: readonly string[],
  lastPosition: number,
): string {
  if (name === "ARGUMENTS") return argumentsText
  const index = Number.parseInt(name, 10) - 1
  if (Number.parseInt(name, 10) === lastPosition) return argumentsList.slice(index).join(" ")
  return index >= 0 ? (argumentsList[index] ?? "") : ""
}

/** Names of the placeholders a template declares, in first-occurrence order. */
export function commandTemplatePlaceholderNames(template: string): readonly string[] {
  const seen: string[] = []
  for (const match of template.matchAll(commandPlaceholderPattern)) {
    const name = match[1] ?? match[2]
    if (name !== undefined && !seen.includes(name)) seen.push(name)
  }
  return seen
}

/**
 * Substitutes `$ARGUMENTS` and positional placeholders, appending the argument
 * text when the template declares no placeholder at all.
 */
export function commandTemplateExpand(
  template: string,
  argumentsText: string,
  argumentsList: readonly string[],
): Result<string> {
  const op = "commandTemplateExpand"
  const positions = [...template.matchAll(commandPlaceholderPattern)]
    .map((match) => match[1] ?? match[2])
    .filter((name): name is string => name !== undefined && name !== "ARGUMENTS")
    .map((name) => Number.parseInt(name, 10))
  const lastPosition = positions.length === 0 ? 0 : Math.max(...positions)
  let foundPlaceholder = false
  let previous = 0
  let expanded = ""
  for (const match of template.matchAll(commandPlaceholderPattern)) {
    const name = match[1] ?? match[2]
    if (name === undefined) continue
    if (name !== "ARGUMENTS" && Number.parseInt(name, 10) < 1)
      return createResultError(op, "Command positional placeholders must start at $1.")
    foundPlaceholder = true
    expanded +=
      template.slice(previous, match.index) +
      commandPlaceholderValueResolve(name, argumentsText, argumentsList, lastPosition)
    previous = match.index + match[0].length
  }
  expanded += template.slice(previous)
  if (!foundPlaceholder && argumentsText.length > 0)
    expanded = expanded.trimEnd().length === 0 ? argumentsText : `${expanded.trimEnd()}\n\n${argumentsText}`
  const trimmed = expanded.trim()
  if (trimmed.length === 0) return createResultError(op, "The expanded command is empty.")
  if (trimmed.length > 100_000) return createResultError(op, "The expanded command exceeds the maximum length.")
  return createResult(trimmed)
}
