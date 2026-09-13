import { For, Show } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import type { ChatCommandComposerView } from "./chatCommandView.js"

const metaClass = "rounded border border-line-subtle px-1 py-px text-[10px] text-faint"

/**
 * Slash-command autocomplete list and detail preview for the composer. The view
 * is a pure projection: highlighting, filtering, expansion preview, and every
 * validation message are owned by `chatCommandComposerStateCreate`.
 */
export function ChatCommandSuggestions(props: { state: ChatCommandComposerView }) {
  return (
    <Show when={props.state.isCommandDraft()}>
      <div class="grid gap-2">
        <Show when={props.state.isSuggesting() && props.state.suggestions().length > 0}>
          <div
            class="grid max-h-[220px] gap-0.5 overflow-y-auto rounded-xl border border-line bg-surface-raised p-1"
            id={props.state.listboxId()}
            role="listbox"
            aria-label="Slash commands"
          >
            <For each={props.state.suggestions()}>
              {(suggestion) => (
                <button
                  class="grid w-full cursor-pointer gap-0.5 rounded-lg border-none bg-transparent px-2.5 py-1.5 text-left"
                  classList={{
                    "bg-accent-soft text-accent": suggestion.isHighlighted,
                    "text-foreground": !suggestion.isHighlighted,
                  }}
                  id={props.state.optionId(suggestion.name)}
                  type="button"
                  role="option"
                  aria-selected={suggestion.isHighlighted}
                  tabIndex={-1}
                  onMouseEnter={() => props.state.highlightSet(suggestion.name)}
                  // Pointer selection must not blur the textarea before the draft
                  // is rewritten, so the caret stays where the user was typing.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => props.state.select(suggestion.name)}
                >
                  <span class="flex flex-wrap items-center gap-1.5">
                    <span class="font-mono text-[13px] font-semibold">/{suggestion.name}</span>
                    <span class={metaClass}>{suggestion.source}</span>
                    <Show when={suggestion.subtask}>
                      <span class={metaClass}>subtask</span>
                    </Show>
                    <Show when={suggestion.agent}>{(agent) => <span class={metaClass}>agent {agent()}</span>}</Show>
                    <Show when={suggestion.model}>{(model) => <span class={metaClass}>model {model()}</span>}</Show>
                  </span>
                  <Show when={suggestion.description}>
                    {(description) => (
                      <span class="overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-faint">
                        {description()}
                      </span>
                    )}
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show when={props.state.preview()}>
          {(preview) => (
            <div class="grid gap-1.5 rounded-xl border border-line bg-surface-raised px-3 py-2" aria-live="polite">
              <p class="m-0 flex flex-wrap items-center gap-1.5">
                <span class="font-mono text-[13px] font-semibold text-accent">/{preview().name}</span>
                <span class={metaClass}>{preview().source}</span>
                <Show when={preview().subtask}>
                  <span class={metaClass}>runs as subtask</span>
                </Show>
                <Show when={preview().agent}>{(agent) => <span class={metaClass}>agent {agent()}</span>}</Show>
                <Show when={preview().model}>{(model) => <span class={metaClass}>model {model()}</span>}</Show>
                <Show when={preview().hasShellInterpolation}>
                  <span class={metaClass}>runs bash interpolation</span>
                </Show>
              </p>
              <Show when={preview().description}>
                {(description) => <p class="m-0 text-[11px] text-faint">{description()}</p>}
              </Show>
              <Show when={preview().declaredPlaceholders.length > 0}>
                <p class="m-0 text-[11px] text-faint">
                  Placeholders:{" "}
                  {preview()
                    .declaredPlaceholders.map((name) => `$${name}`)
                    .join(", ")}
                </p>
              </Show>
              <pre class="m-0 max-h-[140px] overflow-auto rounded-lg border border-line-subtle bg-surface px-2.5 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-faint">
                {preview().expandedText}
              </pre>
              <p class="m-0 font-mono text-[10px] break-all text-placeholder">{preview().templateDigest}</p>
            </div>
          )}
        </Show>

        <Show when={props.state.statusMessage()}>
          {(message) => (
            <p class="m-0 text-[11px] text-faint" role="status" aria-live="polite">
              {message()}
            </p>
          )}
        </Show>

        <Show when={props.state.errorMessage()}>
          {(message) => (
            <div class="flex items-center justify-between gap-3" role="alert">
              <p class="m-0 text-[11px] text-danger">{message()}</p>
              <Show when={props.state.status() === "error"}>
                <Button variant="outlineRed" size="sm" onClick={props.state.retry}>
                  Retry
                </Button>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </Show>
  )
}
