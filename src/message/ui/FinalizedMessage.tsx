import type { finalizedMessageCopyStateCreate } from "./finalizedMessageCopyStateCreate.js"
import { MessageBody } from "./MessageBody.js"

type FinalizedMessageProps = {
  content: string
  role: "assistant" | "user"
  state: ReturnType<typeof finalizedMessageCopyStateCreate>
}

export function FinalizedMessage(props: FinalizedMessageProps) {
  return (
    <article
      class="border-l-2 border-accent-border pl-4"
      classList={{ "!border-line-strong": props.role === "assistant" }}
      data-message-role={props.role}
    >
      <div class="flex min-h-7 items-center justify-between gap-3">
        <span
          class="font-mono text-[10px] font-bold tracking-[0.12em] text-accent uppercase"
          classList={{ "!text-faint": props.role === "assistant" }}
        >
          {props.role}
        </span>
        <div class="flex items-center gap-2">
          <span aria-live="polite" class="font-mono text-[10px] text-subtle" role="status">
            {props.state.status() === "copied" ? "Copied" : props.state.status() === "error" ? "Copy failed" : ""}
          </span>
          <button
            aria-label={`Copy ${props.role} message`}
            class="min-h-7 rounded border border-line-strong px-2 font-mono text-[10px] font-bold tracking-[0.08em] text-subtle uppercase hover:border-accent-border hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={props.state.copy}
            type="button"
          >
            Copy
          </button>
        </div>
      </div>
      <MessageBody content={props.content} />
    </article>
  )
}
