import { finalizedMessageHtmlRender } from "./finalizedMessageHtmlRender.js"

type FinalizedMessageProps = {
  content: string
  role: "assistant" | "user"
}

export function FinalizedMessage(props: FinalizedMessageProps) {
  return (
    <article
      class="border-l-2 border-[#657838] pl-4"
      classList={{ "!border-[#454a3d]": props.role === "assistant" }}
      data-message-role={props.role}
    >
      <span
        class="font-mono text-[10px] font-bold tracking-[0.12em] text-[#d8ff72] uppercase"
        classList={{ "!text-[#9da392]": props.role === "assistant" }}
      >
        {props.role}
      </span>
      <div
        class="mt-2 overflow-wrap-anywhere whitespace-pre-wrap text-sm leading-[1.75] text-[#d7d9d1] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-[#d8ff72] [&_a]:underline [&_code]:rounded [&_code]:bg-[#25281f] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[#30342a] [&_pre]:bg-[#171914] [&_pre]:p-3 [&_pre]:whitespace-pre [&_pre_code]:bg-transparent [&_pre_code]:p-0"
        innerHTML={finalizedMessageHtmlRender(props.content)}
      />
    </article>
  )
}
