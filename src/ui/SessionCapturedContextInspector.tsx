import { For, Match, Show, Switch } from "solid-js"
import { Textarea } from "#ui/input/textarea/Textarea.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { sessionCapturedContextInspectorStateCreate } from "./sessionCapturedContextInspectorStateCreate.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

const labelClass = "m-0 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase"
const metaClass = "m-0 text-[11px] text-faint"
const pathClass = "m-0 break-all font-mono text-[11px] text-faint"
const rowClass = "grid gap-0.5 rounded-md border border-line-subtle bg-surface px-2.5 py-1.5"
const promptClass =
  "!max-h-[200px] !min-h-[96px] !rounded-md !border-line !bg-surface !px-2 !py-1.5 !font-mono !text-xs"

/**
 * Read-only view of the execution context a created session captured. Everything
 * rendered here is immutable by construction, so the panel exposes no setters.
 */
export function SessionCapturedContextInspector(props: { idPrefix?: string; state: SessionResourceSelectorView }) {
  const state = sessionCapturedContextInspectorStateCreate(() => props.state)
  const prefix = () => props.idPrefix ?? "session-captured-context"

  return (
    <section class="grid gap-3 text-xs" aria-labelledby={`${prefix()}-heading`}>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${prefix()}-heading`} class="m-0 text-sm font-semibold tracking-[-0.01em]">
          Captured execution context
        </h3>
        <p class={metaClass} role="status">
          Captured when this session was created and cannot be changed.
        </p>
      </div>

      <Switch>
        <Match when={state.isLoading()}>
          <p class={metaClass} role="status" aria-live="polite">
            Loading the captured execution context…
          </p>
        </Match>

        <Match when={state.errorMessage() !== null}>
          <div class="flex flex-wrap items-center justify-between gap-3" role="alert">
            <p class="m-0 text-xs text-danger">{state.errorMessage()}</p>
            <Button variant="outlineRed" size="sm" onClick={state.retry}>
              Retry
            </Button>
          </div>
        </Match>

        <Match when={!state.hasCapture()}>
          <p class={metaClass} role="status">
            This session was created before the execution context was captured.
          </p>
        </Match>

        <Match when={true}>
          <p class={metaClass}>
            about {state.totalEstimatedTokens()} tokens of prompt and instruction context (estimate)
          </p>

          <label class="grid gap-1.5" for={`${prefix()}-agent-prompt`}>
            <span class={labelClass}>System prompt</span>
            <Show
              when={state.agentPrompt().length > 0}
              fallback={<p class={metaClass}>No system prompt was captured for this session.</p>}
            >
              <Textarea id={`${prefix()}-agent-prompt`} class={promptClass} readOnly value={state.agentPrompt()} />
              <span class={metaClass}>about {state.agentPromptEstimatedTokens()} tokens (estimate)</span>
            </Show>
          </label>

          <div class="grid gap-1.5">
            <p class={labelClass}>Included AGENTS.md sources</p>
            <Show
              when={state.instructions().length > 0}
              fallback={<p class={metaClass}>No instruction files were included.</p>}
            >
              <ul class="m-0 grid list-none gap-1 p-0" aria-label="Captured instruction sources">
                <For each={state.instructions()}>
                  {(entry) => (
                    <li class={rowClass}>
                      <span class="font-semibold text-strong">
                        {entry.path} · {entry.source}
                      </span>
                      <span class={pathClass}>{entry.canonicalPath ?? `${entry.scope} (path not captured)`}</span>
                      <Show when={entry.content !== undefined}>
                        <Textarea
                          aria-label={`Captured instruction content for ${entry.path}`}
                          class={promptClass}
                          readOnly
                          value={entry.content}
                        />
                      </Show>
                      <span class={metaClass}>about {entry.estimatedTokens} tokens (estimate)</span>
                    </li>
                  )}
                </For>
              </ul>
              <p class={metaClass}>about {state.instructionEstimatedTokens()} tokens in total (estimate)</p>
            </Show>
          </div>

          <div class="grid gap-1.5">
            <p class={labelClass}>Skill groups</p>
            <p class={metaClass}>{state.presetName() ?? "No preset was applied."}</p>
            <Show
              when={state.skillGroups().length > 0}
              fallback={<p class={metaClass}>No skill groups were selected.</p>}
            >
              <ul class="m-0 grid list-none gap-1 p-0" aria-label="Captured skill groups">
                <For each={state.skillGroups()}>
                  {(group) => (
                    <li class={rowClass}>
                      <span class="font-semibold text-strong">{group.path}</span>
                      <span class={metaClass}>{group.skillNames.join(", ")}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>

          <div class="grid gap-1.5">
            <p class={labelClass}>Skills</p>
            <Show when={state.skills().length > 0} fallback={<p class={metaClass}>No skills were selected.</p>}>
              <ul class="m-0 grid list-none gap-1 p-0" aria-label="Captured skills">
                <For each={state.skills()}>
                  {(skill) => (
                    <li class={rowClass}>
                      <span class="font-semibold text-strong">
                        {skill.name} · {skill.source}
                      </span>
                      <span class={metaClass}>{skill.description}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>

          <div class="grid gap-1.5">
            <p class={labelClass}>Tools</p>
            <ul class="m-0 grid list-none gap-1 p-0" aria-label="Captured tools">
              <For each={state.tools()}>
                {(agent) => (
                  <li class={rowClass}>
                    <span class="font-semibold text-strong">
                      {agent.agentId} · {agent.isPrimary ? "primary" : "subagent"}
                    </span>
                    <span class={metaClass}>
                      {agent.toolNames.length > 0 ? agent.toolNames.join(", ") : "no tools enabled"}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Match>
      </Switch>
    </section>
  )
}
