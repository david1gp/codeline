import { finalizedMessageCopyStateCreate } from "./finalizedMessageCopyStateCreate.js"
import { MessageBody } from "./MessageBody.js"

type FinalizedMessageProps = {
  content: string
  role: "assistant" | "user"
}

export function FinalizedMessage(props: FinalizedMessageProps) {
  const state = finalizedMessageCopyStateCreate({ content: () => props.content })

  return (
    <article
      class="border-l-2 border-[#657838] pl-4"
      classList={{ "!border-[#454a3d]": props.role === "assistant" }}
      data-message-role={props.role}
    >
      <div class="flex min-h-7 items-center justify-between gap-3">
        <span
          class="font-mono text-[10px] font-bold tracking-[0.12em] text-[#d8ff72] uppercase"
          classList={{ "!text-[#9da392]": props.role === "assistant" }}
        >
          {props.role}
        </span>
        <div class="flex items-center gap-2">
          <span aria-live="polite" class="font-mono text-[10px] text-[#b8bdae]" role="status">
            {state.status() === "copied" ? "Copied" : state.status() === "error" ? "Copy failed" : ""}
          </span>
          <button
            aria-label={`Copy ${props.role} message`}
            class="min-h-7 rounded border border-[#454a3d] px-2 font-mono text-[10px] font-bold tracking-[0.08em] text-[#d7d9d1] uppercase hover:border-[#657838] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8ff72]"
            onClick={state.copy}
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
