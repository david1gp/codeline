import { A } from "@solidjs/router"
import { For, Show } from "solid-js"
import { SimulateTranscript } from "./SimulateTranscript.js"
import type { simulateAppStateCreate } from "./simulateAppStateCreate.js"
import { simulatePhaseLabel } from "./simulatePhaseLabel.js"
import { simulateScenarioHref } from "./simulateScenarioHref.js"
import { simulateScenarioRegistry } from "./simulateScenarioRegistry.js"

export function SimulateShell(props: { state: ReturnType<typeof simulateAppStateCreate> }) {
  return (
    <main class="min-h-dvh overflow-x-hidden bg-[#f5f6f8] text-[#18202b] [font-family:Inter,ui-sans-serif,system-ui,sans-serif]">
      <header class="flex min-h-11 flex-wrap items-center gap-3 border-[#d8dce3] border-b bg-white px-3 py-2 text-xs">
        <A
          class="flex items-center gap-2 font-semibold no-underline"
          href="/simulate"
          aria-label="Codeline simulation home"
        >
          <span class="grid size-6 place-items-center rounded-md bg-[#202938] font-mono text-[11px] text-white">
            C/
          </span>
          <span>Codeline simulation</span>
        </A>
        <nav class="flex min-w-0 gap-1 overflow-x-auto" aria-label="Simulation scenarios">
          <For each={simulateScenarioRegistry}>
            {(scenario) => (
              <A
                class="shrink-0 rounded-md px-2.5 py-1.5 text-[#5f6879] no-underline transition-colors hover:bg-[#eef1f5] hover:text-[#18202b]"
                classList={{ "bg-[#e8eefb] text-[#2459ad]": scenario.slug === props.state.scenario().slug }}
                href={simulateScenarioHref(scenario.slug)}
                aria-current={scenario.slug === props.state.scenario().slug ? "page" : undefined}
              >
                {scenario.label}
              </A>
            )}
          </For>
        </nav>
        <span class="ml-auto shrink-0 font-mono text-[10px] tracking-[0.08em] text-[#5f6879] uppercase">
          simulation only
        </span>
      </header>

      <div class="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_320px] gap-4 p-4 max-[900px]:grid-cols-1">
        <section class="min-w-0" aria-label="Simulated transcript">
          <h1 class="m-0 text-lg font-semibold tracking-[-0.03em]">{props.state.scenario().label}</h1>
          <p class="mt-1 mb-3 text-xs leading-5 text-[#5f6879]">{props.state.scenario().description}</p>

          <div class="mb-3 rounded-md border border-[#d8dce3] bg-white px-3 py-2">
            <p class="m-0 font-mono text-[10px] tracking-[0.1em] text-[#5f6879] uppercase">Prompt</p>
            <p class="m-0 mt-1 text-xs leading-5">{props.state.scenario().prompt}</p>
          </div>

          <div
            class="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-[#d8dce3] bg-white px-3 py-2"
            role="group"
            aria-label="Simulation controls"
          >
            <button
              type="button"
              class="rounded-md bg-[#202938] px-3 py-1.5 text-[11px] text-white disabled:opacity-40"
              disabled={!props.state.canPlay()}
              onClick={() => props.state.play()}
              data-simulate-control="play"
            >
              Run
            </button>
            <button
              type="button"
              class="rounded-md border border-[#ccd2dc] px-3 py-1.5 text-[11px] disabled:opacity-40"
              disabled={!props.state.canPause()}
              onClick={() => props.state.pause()}
              data-simulate-control="pause"
            >
              Pause
            </button>
            <button
              type="button"
              class="rounded-md border border-[#ccd2dc] px-3 py-1.5 text-[11px] disabled:opacity-40"
              disabled={!props.state.canRetry()}
              onClick={() => props.state.retry()}
              data-simulate-control="retry"
            >
              Retry now
            </button>
            <button
              type="button"
              class="rounded-md bg-[#a33d3d] px-3 py-1.5 text-[11px] text-white disabled:opacity-40"
              disabled={!props.state.canStop()}
              onClick={() => props.state.stop()}
              data-simulate-control="stop"
            >
              Stop
            </button>
            <button
              type="button"
              class="rounded-md border border-[#ccd2dc] px-3 py-1.5 text-[11px] disabled:opacity-40"
              disabled={!props.state.canReset()}
              onClick={() => props.state.reset()}
              data-simulate-control="reset"
            >
              Reset
            </button>
            <label class="ml-auto flex items-center gap-2 font-mono text-[10px] text-[#5f6879]" for="simulate-speed">
              Speed
              <select
                id="simulate-speed"
                class="rounded-md border border-[#ccd2dc] bg-white px-2 py-1 text-[11px] text-[#18202b]"
                value={String(props.state.speed.get())}
                onChange={(event) => props.state.speed.set(Number(event.currentTarget.value))}
              >
                <For each={props.state.speedOptions}>
                  {(option) => <option value={String(option.multiplier)}>{option.label}</option>}
                </For>
              </select>
            </label>
          </div>

          <Show when={props.state.assistantText() !== ""}>
            <div class="mb-3 rounded-md border border-[#d8dce3] bg-white px-3 py-2">
              <p class="m-0 font-mono text-[10px] tracking-[0.1em] text-[#5f6879] uppercase">Assistant text</p>
              <p class="m-0 mt-1 text-sm leading-6" data-simulate-assistant-text>
                {props.state.assistantText()}
              </p>
            </div>
          </Show>

          <SimulateTranscript events={props.state.snapshot().events} />
        </section>

        <aside class="min-w-0" aria-label="Simulation diagnostics">
          <div class="rounded-md border border-[#d8dce3] bg-white p-3">
            <h2 class="m-0 text-xs font-semibold tracking-[-0.02em]">Diagnostics</h2>
            <p
              role="status"
              aria-live="polite"
              class="m-0 mt-2 rounded-md bg-[#eef1f5] px-2 py-1.5 font-mono text-[11px]"
              data-simulate-phase={props.state.snapshot().phase}
            >
              {simulatePhaseLabel(props.state.snapshot().phase)} · run {props.state.snapshot().runStatus} ·{" "}
              {props.state.snapshot().elapsedMs}ms
            </p>
            <dl class="m-0 mt-2 grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[10px] text-[#5f6879]">
              <dt>Events</dt>
              <dd class="m-0 text-[#18202b]">{props.state.snapshot().events.length}</dd>
              <dt>Attempt</dt>
              <dd class="m-0 text-[#18202b]">
                {props.state.snapshot().currentAttemptOrdinal ?? "-"} / {props.state.scenario().maxAttempts}
              </dd>
              <dt>Termination</dt>
              <dd class="m-0 text-[#18202b]">{props.state.snapshot().lastTermination}</dd>
            </dl>
            <Show when={props.state.snapshot().lastFailure}>
              {(failure) => (
                <p
                  role="alert"
                  class="m-0 mt-2 rounded-md border border-[#e0a9a9] bg-[#fdf3f3] px-2 py-1.5 text-[11px] text-[#8b2f2f]"
                >
                  <span class="font-mono">{failure().code}</span>: {failure().message}
                </p>
              )}
            </Show>
          </div>

          <ol class="m-0 mt-3 flex list-none flex-col gap-2 p-0" aria-label="Attempts">
            <For each={props.state.snapshot().attempts}>
              {(attempt) => (
                <li
                  class="rounded-md border border-[#d8dce3] bg-white px-3 py-2"
                  data-simulate-attempt={attempt.ordinal}
                >
                  <div class="flex items-center gap-2 font-mono text-[10px] text-[#5f6879]">
                    <span class="text-[#18202b]">Attempt {attempt.ordinal}</span>
                    <span class="ml-auto tracking-[0.08em] uppercase">{attempt.status}</span>
                  </div>
                  <p class="m-0 mt-1 font-mono text-[10px] text-[#5f6879]">{attempt.events.length} events</p>
                  <Show when={attempt.retryAdmission}>
                    {(admission) => (
                      <p class="m-0 mt-1 font-mono text-[10px] text-[#8b6417]">
                        {admission().decision} · {admission().reason} · {admission().remainingAttempts} left
                      </p>
                    )}
                  </Show>
                  <Show when={attempt.failure}>
                    {(failure) => <p class="m-0 mt-1 text-[10px] text-[#8b2f2f]">{failure().message}</p>}
                  </Show>
                </li>
              )}
            </For>
          </ol>
        </aside>
      </div>
    </main>
  )
}
