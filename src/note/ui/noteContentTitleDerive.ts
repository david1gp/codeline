const titleMaxLength = 50

export function noteContentTitleDerive(content: string) {
  const [firstLine = ""] = content.split(/\r?\n/)
  const title = firstLine.trim()
  if (title === "") return "New Note"
  return title.length > titleMaxLength ? title.slice(0, titleMaxLength) : title
}
