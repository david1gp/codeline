import { markdownHtmlRender } from "../../markdown/markdownHtmlRender.js"

type MessageBodyProps = {
  content: string
}

export function MessageBody(props: MessageBodyProps) {
  return <div class="markdown-content markdown-content--message" innerHTML={markdownHtmlRender(props.content)} />
}
