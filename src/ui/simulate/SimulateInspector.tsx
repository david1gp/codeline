import { For, Show } from "solid-js"
import type { SimulateInspectorState } from "./simulateInspectorStateCreate.js"

export function SimulateInspector(props: { state: SimulateInspectorState }) {
  return (
    <section class="border-line-subtle border-t bg-surface px-4 py-2" aria-label="Simulation state inspector">
      <button
        class="cursor-pointer rounded-md border border-line-subtle bg-transparent px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-faint uppercase"
        type="button"
        aria-controls="simulation-inspector-panel"
        aria-expanded={props.state.isExpanded()}
        onClick={props.state.expandedToggle}
      >
        Inspector
      </button>

      <Show when={props.state.isExpanded()}>
        <div
          class="mt-2 grid gap-4 font-mono text-[10px] text-faint min-[761px]:grid-cols-2"
          id="simulation-inspector-panel"
        >
          <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1" aria-label="Frontend transport state">
            <dt class="text-accent">recovery</dt>
            <dd class="m-0">{props.state.frontend().recoveryStatus}</dd>
            <dt class="text-accent">busy</dt>
            <dd class="m-0">{String(props.state.frontend().isBusy)}</dd>
            <dt class="text-accent">thinking</dt>
            <dd class="m-0">{String(props.state.frontend().isThinking)}</dd>
            <dt class="text-accent">aborted</dt>
            <dd class="m-0">{String(props.state.frontend().isAborted)}</dd>
            <dt class="text-accent">attempts</dt>
            <dd class="m-0">{props.state.frontend().attemptCount}</dd>
            <dt class="text-accent">failures</dt>
            <dd class="m-0">
              {props.state
                .frontend()
                .failures.map((failure) => failure.code)
                .join(", ") || "none"}
            </dd>
          </dl>

          <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1" aria-label="Synchronized backend state">
            <dt class="text-accent">run</dt>
            <dd class="m-0">{props.state.run()?.status ?? (props.state.isLoading() ? "loading" : "none")}</dd>
            <dt class="text-accent">cancellation</dt>
            <dd class="m-0">{props.state.run()?.cancellationKind ?? "none"}</dd>
            <dt class="text-accent">failure</dt>
            <dd class="m-0">
              <Show when={props.state.failure()} fallback="none">
                {(failure) => (
                  <>
                    {failure().code} · {failure().message}
                  </>
                )}
              </Show>
            </dd>
            <dt class="text-accent">stream</dt>
            <dd class="m-0 truncate">{props.state.streamId() ?? "none"}</dd>
            <dt class="text-accent">attempts</dt>
            <dd class="m-0">
              <For each={props.state.attempts()} fallback={<span>none</span>}>
                {(attempt) => (
                  <span class="mr-2">
                    #{attempt.ordinal} {attempt.status}
                  </span>
                )}
              </For>
            </dd>
            <dt class="text-accent">events</dt>
            <dd class="m-0">{props.state.eventTotal()}</dd>
            <dt class="text-accent">by type</dt>
            <dd class="m-0">
              <For each={props.state.eventCounts()} fallback={<span>none</span>}>
                {(entry) => (
                  <span class="mr-2">
                    {entry.eventType}×{entry.count}
                  </span>
                )}
              </For>
            </dd>
          </dl>
        </div>
      </Show>
    </section>
  )
}
