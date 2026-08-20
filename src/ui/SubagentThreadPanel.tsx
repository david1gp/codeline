import { mdiDockRight } from "@mdi/js"
import { Show } from "solid-js"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { SessionStreamEntryList } from "./SessionStreamEntryList.js"
import type { SelectedSessionView } from "./selectedSessionView.js"
import { subagentThreadPanelStateCreate } from "./subagentThreadPanelStateCreate.js"

export function SubagentThreadPanel(props: { state: SelectedSessionView }) {
  const state = subagentThreadPanelStateCreate(() => props.state)

  return (
    <div class="flex h-full min-h-0 flex-col bg-[var(--background)]">
      <header class="flex h-9 shrink-0 items-center border-[var(--border)] border-b bg-[var(--muted)]">
        <span class="min-w-0 flex-1 truncate px-3 text-xs font-medium text-[var(--foreground)]">Subagent thread</span>
        <ButtonIconOnly
          class="h-full w-9 shrink-0 rounded-none border-[var(--border)] border-y-0 border-r-0 border-l bg-[var(--surface-hover)] p-0 text-[var(--foreground)] hover:text-[var(--accent)]"
          icon={mdiDockRight}
          iconClass="size-4 fill-current dark:fill-current"
          variant="none"
          aria-label="Close subagent thread panel"
          aria-controls="workspace-right-panel"
          aria-expanded="true"
          onClick={state.close}
          title="Close subagent thread panel"
        />
      </header>

      <Show when={state.delegation()} keyed fallback={<p class="m-3 text-[13px] text-faint">No subagent selected.</p>}>
        {(delegation) => (
          <div class="min-h-0 flex-1 overflow-y-auto p-3">
            <p class="m-0 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">Task</p>
            <p class="mt-1 mb-4 whitespace-pre-wrap break-words text-[13px] leading-relaxed">{delegation.task}</p>
            <section aria-label="Subagent execution stream">
              <p class="m-0 mb-2 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">Stream</p>
              <Show
                when={state.group()}
                keyed
                fallback={
                  <p class="m-0 text-[13px] text-faint" role="status">
                    Loading child stream...
                  </p>
                }
              >
                {(group) => (
                  <div class="rounded-xl border border-line-subtle bg-surface px-3 py-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-[12px] font-semibold">{group.label}</span>
                      <Show when={group.status}>
                        {(status) => <span class="text-[11px] text-faint">{status()}</span>}
                      </Show>
                    </div>
                    <div class="mt-2">
                      <SessionStreamEntryList entries={group.entries} onDelegation={props.state.subagentThread.open} />
                    </div>
                  </div>
                )}
              </Show>
            </section>
          </div>
        )}
      </Show>
    </div>
  )
}
