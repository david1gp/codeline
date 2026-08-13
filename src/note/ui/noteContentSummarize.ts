export function noteContentSummarize(content: string) {
  const [firstLine = "", ...remainingLines] = content.split(/\r?\n/)
  const heading = firstLine.trim() || "Untitled note"
  const preview = remainingLines.join("\n").trim()

  return { heading, preview }
}
