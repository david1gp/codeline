import { For, Show } from "solid-js"
import type { Accessor } from "solid-js"
import type { CodelineExecution } from "../providers/schema/codelineExecutionSchema.js"
import { chatComposerStateCreate } from "./chatComposerStateCreate.js"
import { transientMessagesResolve } from "./transientMessagesResolve.js"

type SessionChatProps = {
  codelineExecution: Accessor<CodelineExecution | null>
  durableMessages: () => ReadonlyArray<{ content: string; role: string }>
  sessionId: string
}

export function SessionChat(props: SessionChatProps) {
  const composer = chatComposerStateCreate({ codelineExecution: props.codelineExecution, sessionId: props.sessionId })
  const pending = () => transientMessagesResolve(composer.transientMessages(), props.durableMessages())

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
    event.preventDefault()
    composer.submit()
  }

  return (
    <section class="grid min-h-0 gap-3 px-7 pb-6 max-[760px]:px-3.5 max-[760px]:pb-3.5" aria-label="Chat input">
      <Show when={pending().length > 0}>
        <ol
          class="mx-auto grid max-h-[30vh] w-[min(760px,100%)] list-none gap-6 overflow-y-auto p-0"
          aria-label="In-flight messages"
        >
          <For each={pending()}>
            {(message) => (
              <li
                class="border-l-2 border-dashed border-[#657838] pl-4"
                classList={{ "!border-[#454a3d]": message.role === "assistant" }}
              >
                <span
                  class="font-mono text-[10px] font-bold tracking-[0.12em] text-[#d8ff72] uppercase"
                  classList={{ "!text-[#9da392]": message.role === "assistant" }}
                >
                  {message.role}
                </span>
                <p class="mt-2 mb-0 overflow-wrap-anywhere whitespace-pre-wrap text-sm leading-[1.75] text-[#d7d9d1]">
                  {message.content}
                </p>
              </li>
            )}
          </For>
        </ol>
      </Show>

      <form
        class="grid gap-2.5 rounded-xl border border-[#30342a] bg-[#1c1f19] p-3 shadow-[0_18px_48px_rgb(0_0_0_/_18%)]"
        aria-label="Chat composer"
        onSubmit={(event) => {
          event.preventDefault()
          composer.submit()
        }}
      >
        <Show when={composer.errorMessage()}>
          {(message) => (
            <p class="m-0 text-xs text-[#e08a7a]" role="alert">
              {message()}
            </p>
          )}
        </Show>
        <Show when={composer.recoveryStatus() === "stale"}>
          <p class="m-0 text-xs text-[#e08a7a]" role="alert">
            The saved response is stale and could not be recovered.
          </p>
        </Show>

        <textarea
          class="min-h-[62px] w-full resize-y rounded-lg border border-[#25281f] bg-transparent p-2.5 text-[13px] leading-[1.6] text-[#d7d9d1] disabled:text-[#777d70]"
          aria-label="Message"
          placeholder="Send a message. Enter sends, Shift+Enter adds a newline."
          rows={3}
          disabled={composer.isBusy()}
          value={composer.draft()}
          onInput={(event) => composer.setDraft(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />

        <div class="flex items-center justify-end gap-2.5">
          <Show when={composer.recoveryStatus() === "recovering"}>
            <span class="mr-auto font-mono text-[10px] text-[#9da392]" role="status" aria-live="polite">
              Recovering saved response...
            </span>
          </Show>
          <Show when={composer.recoveryStatus() === "terminal"}>
            <span class="mr-auto font-mono text-[10px] text-[#9da392]" role="status" aria-live="polite">
              Response complete.
            </span>
          </Show>
          <Show when={composer.isBusy()}>
            <Show when={composer.recoveryStatus() !== "recovering"}>
              <span class="mr-auto font-mono text-[10px] text-[#9da392]" role="status" aria-live="polite">
                Streaming response...
              </span>
            </Show>
            <button
              class="cursor-pointer rounded-lg border border-[#546333] bg-[#2b341c] px-3.5 py-2 text-[#d8ff72]"
              type="button"
              onClick={composer.stop}
            >
              Stop
            </button>
          </Show>
          <button
            class="cursor-pointer rounded-lg border border-[#546333] bg-[#2b341c] px-3.5 py-2 text-[#d8ff72] disabled:cursor-not-allowed disabled:border-[#3a4032] disabled:bg-[#292d24] disabled:text-[#6f7468]"
            type="submit"
            disabled={!composer.canSubmit()}
          >
            Send
          </button>
        </div>
      </form>
    </section>
  )
}
