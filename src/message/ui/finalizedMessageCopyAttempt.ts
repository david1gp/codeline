type FinalizedMessageCopyAttemptOptions = {
  content: string
  writeText?: (text: string) => Promise<void>
}

export async function finalizedMessageCopyAttempt(options: FinalizedMessageCopyAttemptOptions) {
  if (!options.writeText) return "error" as const

  try {
    await options.writeText(options.content)
    return "copied" as const
  } catch {
    return "error" as const
  }
}
