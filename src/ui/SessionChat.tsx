import { For, type JSX, Show } from "solid-js"
import { MessageBody } from "../message/ui/MessageBody.js"
import { ProviderModelSelector } from "../providers/ui/ProviderModelSelector.js"
import type { providerModelSelectorStateCreate } from "../providers/ui/providerModelSelectorStateCreate.js"
import { ChatCommandSuggestions } from "./ChatCommandSuggestions.js"
import { SessionTargetSelector } from "./SessionTargetSelector.js"
import { sessionChatPendingMessagesCreate } from "./sessionChatPendingMessagesCreate.js"
import type { SessionChatState } from "./sessionChatStateCreate.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

export function SessionChat(props: {
  /** Full-height composer used by the creation surface, so the draft owns the pane. */
  isFilling?: boolean
  projectSelector?: JSX.Element
  providerModel?: ReturnType<typeof providerModelSelectorStateCreate>
  sessionTarget?: SessionTargetSelectorState
  state: SessionChatState
}) {
  const pendingMessageState = sessionChatPendingMessagesCreate({
    isBusy: props.state.isBusy,
    messages: props.state.pendingMessages,
    runId: props.state.runId ?? (() => null),
  })

  return (
    <section
      class="px-4 pb-2 max-[760px]:px-3"
      classList={{ "flex min-h-0 flex-1 flex-col": props.isFilling === true, "shrink-0": props.isFilling !== true }}
      aria-label="Chat input"
    >
      <div
        class="mx-auto w-full max-w-[820px] gap-2"
        classList={{
          "flex min-h-0 flex-1 flex-col": props.isFilling === true,
          grid: props.isFilling !== true,
        }}
      >
        <Show when={pendingMessageState.pendingMessages().length > 0}>
          <ol class="grid max-h-[30vh] list-none gap-3 overflow-y-auto p-0" aria-label="In-flight messages">
            <For each={pendingMessageState.pendingMessages()}>
              {(message) => (
                <li class="flex min-w-0 flex-col" classList={{ "items-end": message.role === "user" }}>
                  <Show when={message.role !== "user"}>
                    <span class="mb-1 text-[11px] text-faint">Assistant</span>
                  </Show>
                  <Show when={(message.activities?.length ?? 0) > 0}>
                    <ul class="my-1 grid list-none gap-1 p-0" aria-label="Response activity">
                      <For each={message.activities ?? []}>
                        {(activity) => (
                          <li class="text-[11px] text-faint">
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
                  <div
                    class="min-w-0 break-words"
                    classList={{
                      "max-w-[85%] rounded-xl border border-accent-border bg-accent-soft px-3 py-2 text-sm leading-relaxed":
                        message.role === "user",
                      "w-full": message.role !== "user",
                    }}
                  >
                    <MessageBody content={message.content} isStreaming={message.isStreaming} messageId={message.id} />
                  </div>
                </li>
              )}
            </For>
          </ol>
        </Show>

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
                <li class="text-[11px] text-danger" role="alert">
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

        <form
          class="gap-2"
          classList={{
            "flex min-h-0 flex-1 flex-col": props.isFilling === true,
            grid: props.isFilling !== true,
          }}
          aria-label="Chat composer"
          onSubmit={props.state.submitHandle}
        >
          {props.projectSelector}
          <Show when={props.state.command}>{(command) => <ChatCommandSuggestions state={command()} />}</Show>
          <div
            class="flex min-w-0 items-end gap-2 rounded-[14px] border border-line bg-surface px-3 py-2.5 shadow-[0_1px_2px_var(--shadow-color),0_8px_24px_-12px_var(--shadow-color-strong)] focus-within:border-accent-border"
            classList={{ "min-h-0 flex-1": props.isFilling === true }}
          >
            <textarea
              class="min-h-6 w-full flex-1 resize-none border-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-placeholder disabled:text-disabled"
              classList={{ "h-full": props.isFilling === true, "max-h-[200px]": props.isFilling !== true }}
              aria-label="Message"
              placeholder={
                props.state.readOnlyNotice?.() === undefined
                  ? "Send a message, or type / to run a command.\nEnter sends. Shift+Enter adds a newline."
                  : "Read-only. Sending is unavailable."
              }
              rows={2}
              disabled={props.state.isStopping() || props.state.readOnlyNotice?.() !== undefined}
              value={props.state.draft()}
              // The textarea stays a textbox: the suggestion list is a separately
              // labelled listbox the caret navigates through `aria-activedescendant`,
              // so assistive technology announces the highlighted command without
              // the composer claiming an unsupported combobox role.
              aria-controls={props.state.command?.isSuggesting() === true ? props.state.command.listboxId() : undefined}
              aria-activedescendant={props.state.command?.highlightedOptionId()}
              onInput={(event) => props.state.draftUpdate(event.currentTarget.value)}
              onKeyDown={props.state.keyDownHandle}
            />
            <button
              class="flex shrink-0 cursor-pointer items-center gap-1.5 self-end rounded-lg border-none bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-accent-contrast disabled:cursor-not-allowed disabled:bg-disabled-surface disabled:text-disabled"
              type="submit"
              disabled={!props.state.canSubmit()}
            >
              {props.state.isBusy() ? "Queue" : "Send"}
            </button>
            <Show when={props.state.isBusy()}>
              <button
                class="flex shrink-0 cursor-pointer items-center gap-1.5 self-end rounded-lg border border-accent-border bg-accent-soft px-3.5 py-1.5 text-[13px] font-semibold text-accent disabled:cursor-not-allowed"
                type="button"
                disabled={props.state.isStopping()}
                onClick={props.state.stopHandle}
              >
                Stop
              </button>
            </Show>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-[11px] text-faint">
            <Show when={props.sessionTarget}>
              {(sessionTarget) => <SessionTargetSelector state={sessionTarget()} />}
            </Show>
            <Show when={props.providerModel}>
              {(providerModel) => <ProviderModelSelector state={providerModel()} />}
            </Show>
            <div class="ml-auto flex flex-wrap items-center gap-3">
              <Show when={props.state.isThinking()}>
                <span class="animate-pulse text-accent" role="status" aria-live="polite">
                  Thinking...
                </span>
              </Show>
              <Show when={props.state.isBusy() && props.state.recoveryStatus() !== "recovering"}>
                <span class="animate-pulse" role="status" aria-live="polite">
                  Streaming response...
                </span>
              </Show>
              <Show when={props.state.recoveryStatus() === "recovering"}>
                <span role="status" aria-live="polite">
                  Recovering saved response...
                </span>
              </Show>
              <Show when={props.state.recoveryStatus() === "terminal"}>
                <span role="status" aria-live="polite">
                  Response complete.
                </span>
              </Show>
              <Show when={props.state.attemptCount() > 1}>
                <span role="status" aria-live="polite">
                  Attempt {props.state.attemptCount()}
                </span>
              </Show>
              <Show when={props.state.isAborted()}>
                <span role="status" aria-live="polite">
                  Response cancelled.
                </span>
              </Show>
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}
