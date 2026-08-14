import { For, Show } from "solid-js"
import { simulateEventPresentation } from "./simulateEventPresentation.js"
import type { SimulateSimulatorEmittedEvent } from "./simulateSimulatorState.js"

export function SimulateTranscript(props: { events: readonly SimulateSimulatorEmittedEvent[] }) {
  return (
    <ol class="m-0 flex list-none flex-col gap-2 p-0" aria-label="Simulated execution events">
      <For each={props.events}>
        {(emitted) => {
          const presentation = simulateEventPresentation(emitted.event)
          return (
            <li
              class="rounded-md border border-[#d8dce3] bg-white px-3 py-2"
              classList={{
                "border-[#ead39c] bg-[#fff9e9]": presentation.tone === "thinking",
                "border-[#b9c8e2] bg-[#f4f7fd]": presentation.tone === "tool" || presentation.tone === "file",
                "border-[#a8d5bd] bg-[#f2fbf6]": presentation.tone === "success",
                "border-[#e0a9a9] bg-[#fdf3f3]": presentation.tone === "error",
                "border-[#c9cedb] bg-[#f3f4f7]": presentation.tone === "aborted",
              }}
              data-simulate-event-type={emitted.event.eventType}
              data-simulate-event-tone={presentation.tone}
            >
              <div class="flex flex-wrap items-center gap-2 font-mono text-[10px] text-[#5f6879]">
                <span class="tracking-[0.08em] uppercase">{presentation.label}</span>
                <span>attempt {emitted.attemptOrdinal}</span>
                <span>#{emitted.sequence}</span>
                <span class="ml-auto">{emitted.elapsedMs}ms</span>
              </div>
              <p class="m-0 mt-1 break-words text-xs leading-5 text-[#18202b]">{presentation.detail}</p>
            </li>
          )
        }}
      </For>
      <Show when={props.events.length === 0}>
        <li class="rounded-md border border-[#d8dce3] border-dashed px-3 py-6 text-center text-xs text-[#5f6879]">
          No events yet. Run the scenario to emit deterministic events.
        </li>
      </Show>
    </ol>
  )
}
