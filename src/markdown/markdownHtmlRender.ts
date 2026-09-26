import { micromark } from "micromark"

export function markdownHtmlRender(content: string) {
  return micromark(content, { allowDangerousHtml: false, allowDangerousProtocol: false })
}
