export function noteLineCount(content: string): number {
  if (content === "") return 0
  return content.split(/\r?\n/).length
}
