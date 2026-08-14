import { For, Show } from "solid-js"
import { MessageBody } from "../message/ui/MessageBody.js"
import type { SessionChatState } from "./sessionChatStateCreate.js"

export function SessionChat(props: { state: SessionChatState }) {
  return (
    <section class="grid min-h-0 gap-3 px-7 pb-6 max-[760px]:px-3.5 max-[760px]:pb-3.5" aria-label="Chat input">
      <Show when={props.state.pendingMessages().length > 0}>
        <ol
          class="mx-auto grid max-h-[30vh] w-[min(760px,100%)] list-none gap-6 overflow-y-auto p-0"
          aria-label="In-flight messages"
        >
          <For each={props.state.pendingMessages()}>
            {(message) => (
              <li
                class="border-l-2 border-dashed border-accent-border pl-4"
                classList={{ "!border-line-strong": message.role === "assistant" }}
              >
                <span
                  class="font-mono text-[10px] font-bold tracking-[0.12em] text-accent uppercase"
                  classList={{ "!text-faint": message.role === "assistant" }}
                >
                  {message.role}
                </span>
                <Show when={(message.activities?.length ?? 0) > 0}>
                  <ul class="my-1.5 grid list-none gap-1 p-0" aria-label="Response activity">
                    <For each={message.activities ?? []}>
                      {(activity) => (
                        <li class="font-mono text-[10px] text-faint">
                          <span class="text-accent">{activity.kind}</span>
                          <span> · {activity.label}</span>
                          <Show when={activity.status}>{(status) => <span> · {status()}</span>}</Show>
                          <Show when={activity.detail}>
                            {(detail) => <span class="text-placeholder"> · {detail().slice(0, 160)}</span>}
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
                <MessageBody content={message.content} />
              </li>
            )}
          </For>
        </ol>
      </Show>

      <form
        class="grid gap-2.5 rounded-xl border border-line bg-surface-raised p-3 shadow-[0_18px_48px_var(--shadow-color)]"
        aria-label="Chat composer"
        onSubmit={props.state.submitHandle}
      >
        <Show when={props.state.errorMessage()}>
          {(message) => (
            <p class="m-0 text-xs text-danger" role="alert">
              {message()}
            </p>
          )}
        </Show>
        <Show when={props.state.failures().length > 0}>
          <ul class="m-0 grid list-none gap-1 p-0" aria-label="Run failures">
            <For each={props.state.failures()}>
              {(failure) => (
                <li class="font-mono text-[10px] text-danger" role="alert">
                  {failure.code} · {failure.message}
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={props.state.recoveryStatus() === "stale"}>
          <p class="m-0 text-xs text-danger" role="alert">
            The saved response is stale and could not be recovered.
          </p>
        </Show>

        <textarea
          class="min-h-[62px] w-full resize-y rounded-lg border border-line-subtle bg-transparent p-2.5 text-[13px] leading-[1.6] text-foreground placeholder:text-placeholder disabled:text-disabled"
          aria-label="Message"
          placeholder="Send a message. Enter sends, Shift+Enter adds a newline."
          rows={3}
          disabled={props.state.isBusy()}
          value={props.state.draft()}
          onInput={(event) => props.state.draftUpdate(event.currentTarget.value)}
          onKeyDown={props.state.keyDownHandle}
        />

        <div class="flex items-center justify-end gap-2.5">
          <Show when={props.state.isThinking()}>
            <span class="mr-auto font-mono text-[10px] text-accent" role="status" aria-live="polite">
              Thinking...
            </span>
          </Show>
          <Show when={props.state.attemptCount() > 1}>
            <span class="font-mono text-[10px] text-faint" role="status" aria-live="polite">
              Attempt {props.state.attemptCount()}
            </span>
          </Show>
          <Show when={props.state.isAborted()}>
            <span class="font-mono text-[10px] text-faint" role="status" aria-live="polite">
              Response cancelled.
            </span>
          </Show>
          <Show when={props.state.recoveryStatus() === "recovering"}>
            <span class="mr-auto font-mono text-[10px] text-faint" role="status" aria-live="polite">
              Recovering saved response...
            </span>
          </Show>
          <Show when={props.state.recoveryStatus() === "terminal"}>
            <span class="mr-auto font-mono text-[10px] text-faint" role="status" aria-live="polite">
              Response complete.
            </span>
          </Show>
          <Show when={props.state.isBusy()}>
            <Show when={props.state.recoveryStatus() !== "recovering"}>
              <span class="mr-auto font-mono text-[10px] text-faint" role="status" aria-live="polite">
                Streaming response...
              </span>
            </Show>
            <button
              class="cursor-pointer rounded-lg border border-accent-border bg-accent-soft px-3.5 py-2 text-accent"
              type="button"
              disabled={props.state.isStopping()}
              onClick={props.state.stopHandle}
            >
              Stop
            </button>
          </Show>
          <button
            class="cursor-pointer rounded-lg border border-accent-border bg-accent-soft px-3.5 py-2 text-accent disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled-surface disabled:text-disabled"
            type="submit"
            disabled={!props.state.canSubmit()}
          >
            Send
          </button>
        </div>
      </form>
    </section>
  )
}
