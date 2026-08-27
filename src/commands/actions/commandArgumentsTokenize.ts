import { createResult, createResultError, type Result } from "@adaptive-ds/result"

export type CommandArgumentsTokenization = { text: string; values: string[] }

/**
 * Shell-like tokenization of a command argument string. Quoting and escaping are
 * resolved once here so the server expansion and the composer preview cannot
 * disagree about what a draft will expand to.
 */
export function commandArgumentsTokenize(
  value: readonly string[] | string | undefined,
): Result<CommandArgumentsTokenization> {
  const op = "commandArgumentsTokenize"
  if (value === undefined) return createResult({ text: "", values: [] })
  if (Array.isArray(value)) {
    if (value.some((argument) => typeof argument !== "string" || argument.includes("\0")))
      return createResultError(op, "Command arguments must be valid text.")
    const values = [...value]
    const text = values.join(" ")
    if (text.length > 100_000) return createResultError(op, "Command arguments exceed the maximum length.")
    return createResult({ text, values })
  }
  if (typeof value !== "string" || value.includes("\0") || value.length > 100_000)
    return createResultError(op, "Command arguments exceed the maximum length.")

  const values: string[] = []
  let current = ""
  let quote: "double" | "single" | undefined
  let escaped = false
  let tokenStarted = false
  const push = () => {
    if (!tokenStarted) return
    values.push(current)
    current = ""
    tokenStarted = false
  }
  for (const character of value) {
    if (escaped) {
      current += character
      escaped = false
      tokenStarted = true
      continue
    }
    if (quote === "single") {
      if (character === "'") quote = undefined
      else current += character
      tokenStarted = true
      continue
    }
    if (quote === "double") {
      if (character === '"') {
        quote = undefined
        tokenStarted = true
      } else if (character === "\\") {
        escaped = true
        tokenStarted = true
      } else {
        current += character
        tokenStarted = true
      }
      continue
    }
    if (character === "\\") {
      escaped = true
      tokenStarted = true
      continue
    }
    if (character === "'") {
      quote = "single"
      tokenStarted = true
      continue
    }
    if (character === '"') {
      quote = "double"
      tokenStarted = true
      continue
    }
    if (/\s/u.test(character)) {
      push()
      continue
    }
    current += character
    tokenStarted = true
  }
  if (escaped) return createResultError(op, "Command arguments end with an incomplete escape.")
  if (quote !== undefined) return createResultError(op, "Command arguments contain an unterminated quote.")
  push()
  return createResult({ text: value, values })
}
