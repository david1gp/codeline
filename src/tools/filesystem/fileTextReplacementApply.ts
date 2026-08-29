import { FileSystemError } from "./fileSystemError.js"

function normalizeLineEndings(content: string): string {
  return content.replaceAll("\r\n", "\n")
}

function replacementApply(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
  displayPath: string,
): { content: string; replacements: number } {
  const normalizedContent = normalizeLineEndings(content)
  const hasBom = normalizedContent.startsWith("\uFEFF")
  const contentBody = hasBom ? normalizedContent.slice(1) : normalizedContent
  const oldText = normalizeLineEndings(oldString)
  const newText = normalizeLineEndings(newString)

  if (oldText.length === 0) {
    throw new FileSystemError("old_string must be a non-empty string", "FS_EDIT_NOT_FOUND")
  }

  const matches: number[] = []
  let searchFrom = 0
  while (true) {
    const match = contentBody.indexOf(oldText, searchFrom)
    if (match === -1) break
    matches.push(match)
    searchFrom = match + oldText.length
  }

  if (matches.length === 0) {
    throw new FileSystemError(`old_string was not found in "${displayPath}"`, "FS_EDIT_NOT_FOUND")
  }
  if (!replaceAll && matches.length > 1) {
    throw new FileSystemError(
      `old_string matched ${matches.length} times in "${displayPath}"; provide a more specific old_string or set replace_all to true`,
      "FS_AMBIGUOUS_EDIT",
    )
  }

  const firstMatch = matches[0] ?? 0
  const replacement = replaceAll
    ? contentBody.split(oldText).join(newText)
    : `${contentBody.slice(0, firstMatch)}${newText}${contentBody.slice(firstMatch + oldText.length)}`
  const result = `${hasBom ? "\uFEFF" : ""}${replacement}`
  if (result === normalizedContent) {
    throw new FileSystemError(`replacement made no changes to "${displayPath}"`, "FS_EDIT_NOT_FOUND")
  }

  return { content: result, replacements: replaceAll ? matches.length : 1 }
}

export function fileTextReplacementApply(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
  displayPath: string,
): { content: string; replacements: number } {
  return replacementApply(content, oldString, newString, replaceAll, displayPath)
}
