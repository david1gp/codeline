export type ChatCommandDraft = {
  /** Raw text after the command token, before tokenization. */
  argumentsText: string
  /** True once the token is terminated by whitespace, so the name stops growing. */
  isNameComplete: boolean
  /** Raw command token as typed, without the leading slash. */
  token: string
}

/**
 * Splits a composer draft into its slash-command token and argument text.
 * Returns undefined for ordinary prose, so the composer only takes over the
 * arrow keys while a command is actually being written.
 */
export function chatCommandDraftParse(draft: string): ChatCommandDraft | undefined {
  if (typeof draft !== "string") return undefined
  // Leading whitespace is tolerated, but a slash that starts a later line is prose.
  const trimmed = draft.replace(/^[\t ]+/u, "")
  if (!trimmed.startsWith("/")) return undefined
  const rest = trimmed.slice(1)
  const match = /^([^\s]*)([\t ]+)?([\s\S]*)$/u.exec(rest)
  if (match === null) return undefined
  return {
    argumentsText: match[3] ?? "",
    isNameComplete: (match[2] ?? "").length > 0,
    token: match[1] ?? "",
  }
}
