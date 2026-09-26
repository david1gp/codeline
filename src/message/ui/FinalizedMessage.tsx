import { Show } from "solid-js"
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
      class="group flex min-w-0 flex-col"
      classList={{ "items-end": props.role === "user" }}
      data-message-role={props.role}
    >
      <Show when={props.role === "assistant"}>
        <div class="mb-1 text-[11px] text-faint">Assistant</div>
      </Show>
      <div
        class="min-w-0 break-words"
        classList={{
          "max-w-[85%] rounded-xl border border-accent-border bg-accent-soft px-3 py-2 text-sm leading-relaxed":
            props.role === "user",
          "w-full": props.role === "assistant",
        }}
      >
        <MessageBody content={props.content} />
      </div>
      <div class="mt-1 flex min-h-6 items-center gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <span aria-live="polite" class="text-[11px] text-subtle" role="status">
          {props.state.status() === "copied" ? "Copied" : props.state.status() === "error" ? "Copy failed" : ""}
        </span>
        <button
          aria-label={`Copy ${props.role} message`}
          class="rounded-md px-1.5 py-0.5 text-[11px] text-faint hover:bg-surface-hover hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={props.state.copy}
          type="button"
        >
          Copy
        </button>
      </div>
    </article>
  )
}
