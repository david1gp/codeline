import { A } from "@solidjs/router"
import { For } from "solid-js"
import { WorkspacePage } from "../WorkspacePage.js"
import { SimulateInspector } from "./SimulateInspector.js"
import type { simulateAppStateCreate } from "./simulateAppStateCreate.js"

export function SimulateShell(props: { state: ReturnType<typeof simulateAppStateCreate> }) {
  return (
    <div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
      <header class="flex min-h-11 items-center gap-3 overflow-x-auto border-line-subtle border-b bg-surface px-4 py-2 text-xs">
        <span class="shrink-0 font-mono text-[10px] font-bold tracking-[0.12em] text-accent uppercase">Simulation</span>
        <nav class="flex min-w-0 gap-1" aria-label="Simulation scenarios">
          <For each={props.state.scenarios}>
            {(scenario) => (
              <A
                class="shrink-0 rounded-md px-2.5 py-1.5 text-faint no-underline transition-colors hover:bg-surface-hover hover:text-foreground"
                classList={{ "bg-accent-soft text-accent": scenario.href === props.state.scenario().href }}
                href={scenario.href}
                aria-current={scenario.href === props.state.scenario().href ? "page" : undefined}
              >
                {scenario.label}
              </A>
            )}
          </For>
        </nav>
        <span class="ml-auto shrink-0 font-mono text-[10px] text-placeholder">{props.state.scenario().sessionId}</span>
      </header>
      <WorkspacePage state={props.state.workspace} />
      <SimulateInspector state={props.state.inspector} />
    </div>
  )
}
