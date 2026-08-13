import { markdownHtmlRender } from "../../markdown/markdownHtmlRender.js"

export function finalizedMessageHtmlRender(content: string) {
  return markdownHtmlRender(content)
}
