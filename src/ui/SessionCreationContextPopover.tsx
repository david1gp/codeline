import { mdiTextBoxOutline } from "@adaptive-ds/mdi/mdiTextBoxOutline.js"
import { For, Show } from "solid-js"
import { Textarea } from "#ui/input/textarea/Textarea.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { CorvuPopover } from "#ui/interactive/popover/CorvuPopover.jsx"
import { sessionCreationContextPopoverStateCreate } from "./sessionCreationContextPopoverStateCreate.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

const labelClass = "m-0 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase"
const metaClass = "m-0 text-[11px] text-faint"
const pathClass = "m-0 break-all font-mono text-[11px] text-faint"
const editorClass = "!min-h-[120px] !rounded-md !border-line !bg-surface !px-2 !py-1.5 !font-mono !text-xs"

export function SessionCreationContextPopover(props: { idPrefix?: string; state: SessionResourceSelectorView }) {
  const state = sessionCreationContextPopoverStateCreate(() => props.state)
  const prefix = () => props.idPrefix ?? "session-creation-context"

  return (
    <CorvuPopover
      icon={mdiTextBoxOutline}
      buttonChildren={<span class="text-xs">Prompt and context</span>}
      variant={buttonVariant.outline}
      class="!w-full !justify-start !px-2 !py-1 !text-xs"
      innerClass="max-h-[70vh] w-[min(560px,calc(100vw-2rem))] overflow-y-auto border border-line bg-surface-raised text-foreground shadow-lg max-[760px]:w-[calc(100vw-2rem)]"
      open={state.open()}
      onOpenChange={state.openChange}
    >
      <div class="grid gap-3">
        <div>
          <p class={labelClass}>Effective context</p>
          <p class={metaClass}>
            about {state.totalEstimatedTokens()} tokens · {state.totalCharacterCount()} characters (estimate)
          </p>
        </div>

        <label class="grid gap-1.5" for={`${prefix()}-agent-prompt`}>
          <span class={labelClass}>System prompt</span>
          <Textarea
            id={`${prefix()}-agent-prompt`}
            class={editorClass}
            readOnly={!state.isMutable()}
            value={state.agentPrompt()}
            onInput={(event) => state.agentPromptChange(event.currentTarget.value)}
          />
          <span class={metaClass}>about {state.agentPromptEstimatedTokens()} tokens (estimate)</span>
        </label>

        <div class="grid gap-1.5">
          <p class={labelClass}>Included AGENTS.md sources</p>
          <Show
            when={state.sources().length > 0}
            fallback={<p class={metaClass}>No instruction files are included for this project.</p>}
          >
            <For each={state.sources()}>
              {(entry, index) => (
                <div class="grid gap-1 rounded-md border border-line-subtle px-2 py-2">
                  <p class="m-0 text-xs font-semibold">
                    {entry.path} · {entry.source}
                  </p>
                  <p class={pathClass}>{entry.canonicalPath ?? `${entry.scope} (path not captured)`}</p>
                  <Show
                    when={entry.isEditable && entry.canonicalPath}
                    fallback={<p class={metaClass}>Content is not editable for this source.</p>}
                  >
                    {(canonicalPath) => (
                      <Textarea
                        id={`${prefix()}-source-${index()}`}
                        aria-label={`Instruction content for ${entry.path}`}
                        class={editorClass}
                        value={entry.content}
                        onInput={(event) => state.sourceContentChange(canonicalPath(), event.currentTarget.value)}
                      />
                    )}
                  </Show>
                  <p class={metaClass}>about {entry.estimatedTokens} tokens (estimate)</p>
                </div>
              )}
            </For>
          </Show>
        </div>

        <p class={metaClass}>Prompt and instruction edits apply to the new session only.</p>
      </div>
    </CorvuPopover>
  )
}
