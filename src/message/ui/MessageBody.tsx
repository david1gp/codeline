import { Show } from "solid-js"
import { messageBodyRenderStateCreate } from "./messageBodyRenderStateCreate.js"

type MessageBodyProps = {
  content: string
  isStreaming?: boolean
  messageId?: string
}

export function MessageBody(props: MessageBodyProps) {
  const state = messageBodyRenderStateCreate({
    content: () => props.content,
    isStreaming: () => props.isStreaming ?? false,
    messageId: () => props.messageId,
  })

  return (
    <Show
      when={state.renderedHtml() !== undefined}
      fallback={
        <div class="markdown-content markdown-content--message markdown-content--message-fallback">{props.content}</div>
      }
    >
      <div class="markdown-content markdown-content--message" innerHTML={state.renderedHtml() ?? ""} />
    </Show>
  )
}
