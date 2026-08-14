export function projectMimeTypeIsMarkdown(mimeType: string): boolean {
  return mimeType.split(";", 1)[0]?.trim().toLowerCase() === "text/markdown"
}
