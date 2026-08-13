import { For, Show } from "solid-js"
import { A } from "@solidjs/router"
import { DemoMessage } from "./DemoMessage.js"
import { DemoSurfacePanel } from "./DemoSurfacePanel.js"
import { DemoWorkspacePanel } from "./DemoWorkspacePanel.js"
import type { DemoScenario } from "./demoScenario.js"
import type { DemoScenarioFixture } from "./demoScenarioFixture.js"
import { demoScenarioRegistry } from "./demoScenarioRegistry.js"
import type { DemoSurfaceFixture } from "./demoSurfaceFixture.js"
import type { DemoWorkspaceFixture } from "./demoWorkspaceFixture.js"

export function DemoShell(props: { fixture: DemoScenarioFixture; scenario: DemoScenario }) {
  return (
    <main class="min-h-dvh overflow-x-hidden bg-[#f5f6f8] text-[#18202b] [font-family:Inter,ui-sans-serif,system-ui,sans-serif]">
      <header class="flex min-h-11 items-center gap-3 border-[#d8dce3] border-b bg-white px-3 text-xs max-[720px]:flex-wrap max-[720px]:py-2">
        <A class="flex items-center gap-2 font-semibold no-underline" href="/demo" aria-label="Codeline demo home">
          <span class="grid size-6 place-items-center rounded-md bg-[#202938] font-mono text-[11px] text-white">
            C/
          </span>
          <span>Codeline demo</span>
        </A>
        <span class="h-4 w-px bg-[#d8dce3] max-[720px]:hidden" aria-hidden="true" />
        <span class="rounded-md border border-[#d8dce3] px-2 py-1 font-mono text-[10px] min-[721px]:hidden">
          ☰ Menu
        </span>
        <nav class="flex min-w-0 gap-1 overflow-x-auto" aria-label="Demo scenarios">
          <For each={demoScenarioRegistry}>
            {(scenario) => (
              <A
                class="rounded-md px-2.5 py-1.5 text-[#5f6879] no-underline transition-colors hover:bg-[#eef1f5] hover:text-[#18202b]"
                classList={{ "bg-[#e8eefb] text-[#2459ad]": scenario.slug === props.scenario.slug }}
                href={scenario.href}
                aria-current={scenario.slug === props.scenario.slug ? "page" : undefined}
              >
                {scenario.label}
              </A>
            )}
          </For>
        </nav>
        <div class="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px] text-[#5f6879] max-[720px]:hidden">
          <span class="rounded px-2 py-1 hover:bg-[#eef1f5]">Theme: System</span>
          <span class="rounded px-2 py-1 hover:bg-[#eef1f5]">Language: EN</span>
          <span class="tracking-[0.08em] text-[#5f6879] uppercase">fixtures only</span>
        </div>
      </header>

      <div
        class="grid h-[calc(100dvh-45px)] min-h-[620px] max-[720px]:h-auto max-[720px]:min-h-0 max-[720px]:grid-cols-1"
        classList={{
          "grid-cols-[250px_minmax(360px,1fr)_330px] max-[1000px]:grid-cols-[220px_minmax(360px,1fr)_280px]":
            !props.fixture.workspace && !props.fixture.surface,
          "grid-cols-[230px_minmax(340px,1fr)_minmax(480px,0.9fr)] max-[1000px]:grid-cols-[190px_minmax(330px,1fr)_minmax(400px,0.9fr)]":
            Boolean(props.fixture.workspace),
          "grid-cols-[230px_minmax(340px,0.8fr)_minmax(460px,1fr)] max-[1000px]:grid-cols-[190px_minmax(320px,0.7fr)_minmax(400px,1fr)]":
            Boolean(props.fixture.surface),
        }}
      >
        <aside
          class="flex min-h-0 flex-col border-[#d8dce3] border-r bg-[#fafbfc] max-[720px]:border-r-0 max-[720px]:border-b"
          aria-label="Sessions"
        >
          <div class="border-[#d8dce3] border-b p-3">
            <div class="flex items-center justify-between gap-3">
              <strong class="font-mono text-sm tracking-[-0.02em]">Sessions</strong>
              <span class="rounded-md border border-[#d8dce3] bg-white px-2 py-1 text-[10px] text-[#5f6879]">
                + New
              </span>
            </div>
            <div class="mt-3 truncate rounded-md border border-[#d8dce3] bg-white px-2.5 py-2 font-mono text-[10px] text-[#5f6879]">
              ~/adaptive/codeline
            </div>
          </div>
          <section
            class="min-h-0 flex-1 overflow-auto p-2 max-[720px]:flex max-[720px]:gap-2 max-[720px]:overflow-x-auto"
            aria-label="Session history"
            tabindex="0"
          >
            <For each={props.fixture.sessions}>
              {(session) => (
                <div
                  class="mb-1 flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 max-[720px]:mb-0 max-[720px]:min-w-[210px]"
                  classList={{ "bg-[#e8eefb]": session.active, "ml-3 border-[#ccd2dc] border-l": session.branch }}
                >
                  <span
                    class="size-1.5 shrink-0 rounded-full bg-[#c3c9d2]"
                    classList={{ "bg-[#2e68c7]": session.active, "bg-[#e2a23a]": session.running }}
                  />
                  <span class="min-w-0 flex-1 truncate text-xs font-medium">{session.label}</span>
                  <span class="font-mono text-[9px] text-[#5f6879]">{session.meta}</span>
                </div>
              )}
            </For>
          </section>
          <div class="flex justify-between border-[#d8dce3] border-t px-3 py-2 font-mono text-[10px] text-[#5f6879] max-[720px]:hidden">
            <span>Models</span>
            <span>Skills</span>
            <span>Config</span>
          </div>
        </aside>

        <section
          class="grid min-h-0 min-w-0 grid-rows-[42px_minmax(0,1fr)_auto] overflow-hidden bg-white max-[720px]:w-full"
          aria-label="Conversation"
        >
          <div class="flex items-center gap-3 overflow-hidden border-[#d8dce3] border-b px-3 text-xs">
            <span class="font-mono text-[#5f6879]">::</span>
            <h1 class="m-0 min-w-0 truncate text-xs font-bold">{props.fixture.heading}</h1>
            <span class="ml-auto shrink-0 rounded-full bg-[#edf1f5] px-2 py-1 font-mono text-[9px] text-[#5f6879]">
              32k context
            </span>
          </div>
          <section
            class="relative min-h-[340px] overflow-auto px-5 py-6 max-[720px]:min-h-[390px] max-[720px]:px-4"
            aria-label="Conversation messages"
            tabindex="0"
          >
            <div class="mx-auto max-w-[760px]" classList={{ "pr-9 max-[720px]:pr-0": Boolean(props.fixture.minimap) }}>
              <Show
                when={props.fixture.messages.length > 0}
                fallback={
                  <div class="flex min-h-[300px] flex-col items-center justify-center text-center">
                    <span class="mb-3 font-mono text-4xl font-bold text-[#2e68c7]">C/</span>
                    <p class="mb-2 font-mono text-[10px] tracking-[0.14em] text-[#2e68c7] uppercase">
                      {props.fixture.eyebrow}
                    </p>
                    <h2 class="m-0 max-w-lg text-2xl font-semibold tracking-[-0.035em]">{props.fixture.heading}</h2>
                    <p class="mt-3 max-w-md text-sm leading-6 text-[#5f6879]">
                      Start a new session here, or choose a scenario to inspect detailed deterministic chat states.
                    </p>
                  </div>
                }
              >
                <p class="mb-7 font-mono text-[10px] tracking-[0.1em] text-[#5f6879] uppercase">
                  {props.fixture.eyebrow}
                </p>
                <Show when={props.fixture.history}>
                  {(history) => (
                    <div class="mb-6 flex items-center gap-3 text-[11px] text-[#5f6879]">
                      <span class="h-px flex-1 bg-[#d8dce3]" />
                      <button
                        type="button"
                        class="rounded-full border border-[#d8dce3] bg-white px-3 py-1.5 text-[11px] text-[#5f6879]"
                      >
                        ↑ {history().label}
                      </button>
                      <span class="font-mono text-[9px]">{history().hiddenCount} hidden</span>
                      <span class="h-px flex-1 bg-[#d8dce3]" />
                    </div>
                  )}
                </Show>
                <For each={props.fixture.messages}>{(message) => <DemoMessage message={message} />}</For>
              </Show>
            </div>
            <Show when={props.fixture.minimap}>
              {(minimap) => (
                <aside
                  class="absolute top-4 right-2 bottom-4 w-8 border-[#d8dce3] border-l bg-[#fafbfc] max-[720px]:hidden"
                  aria-label="Chat minimap"
                >
                  <div class="absolute top-3 bottom-3 left-1/2 w-px bg-[#d8dce3]" />
                  <For each={minimap()}>
                    {(item, index) => (
                      <span
                        class="absolute left-1/2 size-2 -translate-x-1/2 rounded-sm border border-[#8b94a3] bg-white"
                        classList={{ "scale-125 border-[#2e68c7] bg-[#2e68c7]": item.active }}
                        style={{ top: `${7 + index() * 13}%` }}
                        title={item.label}
                      />
                    )}
                  </For>
                </aside>
              )}
            </Show>
          </section>
          <div class="px-4 pb-4">
            <Show when={props.fixture.composer.retry}>
              <div
                role="status"
                class="mx-auto mb-2 max-w-[760px] rounded-md border border-[#ead39c] bg-[#fff9e9] px-3 py-2 font-mono text-[10px] text-[#8b6417]"
              >
                {props.fixture.composer.retry}
              </div>
            </Show>
            <Show when={props.fixture.composer.queued}>
              {(queued) => (
                <div class="mx-auto mb-2 max-w-[760px] overflow-hidden rounded-md border border-[#d8dce3] bg-[#fafbfc]">
                  <For each={queued()}>
                    {(item) => (
                      <div class="flex min-w-0 items-center gap-2 border-[#e5e8ed] border-b px-3 py-1.5 text-[11px] last:border-b-0">
                        <span class="shrink-0 rounded-full border border-[#b9c8e2] px-2 py-0.5 font-mono text-[9px] text-[#2e68c7]">
                          {item.kind}
                        </span>
                        <span class="truncate text-[#5f6879]">{item.text}</span>
                        <span class="ml-auto text-[#5f6879]">queued</span>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </Show>
            <div class="mx-auto max-w-[760px] rounded-xl border border-[#ccd2dc] bg-white p-3 shadow-[0_8px_30px_rgb(28_39_57_/_8%)]">
              <span class="text-sm text-[#5f6879]">{props.fixture.composer.placeholder}</span>
              <div class="mt-5 flex items-center gap-2 font-mono text-[10px] text-[#5f6879]">
                <span class="rounded-md bg-[#eef1f5] px-2 py-1">deterministic</span>
                <span class="min-w-0 truncate max-[720px]:hidden">{props.fixture.composer.status}</span>
                <span
                  class="ml-auto shrink-0 rounded-md px-2 py-1 text-white"
                  classList={{
                    "bg-[#a33d3d]": props.fixture.composer.action === "Abort",
                    "bg-[#202938]": props.fixture.composer.action === "Send",
                  }}
                >
                  {props.fixture.composer.action}
                </span>
              </div>
            </div>
          </div>
        </section>

        <aside
          class="flex min-h-0 flex-col border-[#d8dce3] border-l bg-[#fafbfc] max-[720px]:min-h-[330px] max-[720px]:border-t max-[720px]:border-l-0"
          aria-label="Files"
        >
          <Show
            when={props.fixture.workspace ?? props.fixture.surface}
            fallback={
              <>
                <div class="flex h-[42px] items-center justify-between border-[#d8dce3] border-b px-3 text-xs">
                  <strong>Files</strong>
                  <span class="font-mono text-[10px] text-[#5f6879]">main</span>
                </div>
                <div class="border-[#d8dce3] border-b p-2">
                  <For each={props.fixture.files}>
                    {(file) => (
                      <div
                        class="flex h-7 items-center gap-2 rounded px-2 text-xs"
                        classList={{ "bg-[#e8eefb]": file.label === props.fixture.activeFile }}
                        style={{ "padding-left": `${8 + file.depth * 14}px` }}
                      >
                        <span class="font-mono text-[10px] text-[#5f6879]">
                          {file.kind === "directory" ? "v" : "."}
                        </span>
                        <span class="min-w-0 flex-1 truncate">{file.label}</span>
                        <Show when={file.status}>
                          <span
                            class="font-mono text-[10px]"
                            classList={{
                              "text-[#1f7047]": file.status === "added",
                              "text-[#8b6417]": file.status === "modified",
                            }}
                          >
                            {file.status === "added" ? "A" : "M"}
                          </span>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
                <div class="min-h-0 flex-1 overflow-auto bg-[#202734] p-4 font-mono text-[11px] leading-6 text-[#d8dee9]">
                  <Show
                    when={props.fixture.activeFile}
                    fallback={<p class="m-0 text-[#8993a3]">Select a populated scenario to preview a file.</p>}
                  >
                    <div class="mb-3 flex items-center justify-between text-[10px] text-[#8993a3]">
                      <span>{props.fixture.activeFile}</span>
                      <span>TSX</span>
                    </div>
                    <pre class="m-0 whitespace-pre-wrap">
                      <code>
                        <span class="text-[#7fbbb3]">export function</span> DemoShell() {"{"}
                        <br />
                        {"  "}
                        <span class="text-[#d699b6]">return</span> (
                        <br />
                        {"    "}&lt;main&gt;
                        <br />
                        {"      "}three focused regions
                        <br />
                        {"    "}&lt;/main&gt;
                        <br />
                        {"  "})
                        <br />
                        {"}"}
                      </code>
                    </pre>
                  </Show>
                </div>
              </>
            }
          >
            {(panel) =>
              props.fixture.workspace ? (
                <DemoWorkspacePanel fixture={panel() as DemoWorkspaceFixture} />
              ) : (
                <DemoSurfacePanel fixture={panel() as DemoSurfaceFixture} />
              )
            }
          </Show>
        </aside>
      </div>
    </main>
  )
}
