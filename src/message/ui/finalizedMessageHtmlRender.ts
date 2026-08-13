import { micromark } from "micromark"

export function finalizedMessageHtmlRender(content: string) {
  return micromark(content, { allowDangerousHtml: false, allowDangerousProtocol: false })
}
