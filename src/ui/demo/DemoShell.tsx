import { For, Show } from "solid-js"
import { DemoMessage } from "./DemoMessage.js"
import { DemoSurfacePanel } from "./DemoSurfacePanel.js"
import { DemoWorkspacePanel } from "./DemoWorkspacePanel.js"
import type { DemoScenarioFixture } from "./demoScenarioFixture.js"
import type { DemoSurfaceFixture } from "./demoSurfaceFixture.js"
import type { DemoWorkspaceFixture } from "./demoWorkspaceFixture.js"
import type { demoWorkspacePanelStateCreate } from "./demoWorkspacePanelStateCreate.js"

export function DemoShell(props: {
  fixture: DemoScenarioFixture
  workspacePanelState: ReturnType<typeof demoWorkspacePanelStateCreate>
}) {
  return (
    <div class="overflow-x-hidden bg-muted text-strong">
      <div
        class="grid h-[calc(100dvh-48px)] min-h-[620px] max-[760px]:h-auto max-[760px]:min-h-0 max-[760px]:grid-cols-1"
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
          class="flex min-h-0 flex-col border-line border-r bg-surface-sunken max-[720px]:border-r-0 max-[720px]:border-b"
          aria-label="Sessions"
        >
          <div class="border-line border-b p-3">
            <div class="flex items-center justify-between gap-3">
              <strong class="font-mono text-sm tracking-[-0.02em]">Sessions</strong>
              <span class="rounded-md border border-line bg-surface px-2 py-1 text-[10px] text-faint">+ New</span>
            </div>
            <div class="mt-3 truncate rounded-md border border-line bg-surface px-2.5 py-2 font-mono text-[10px] text-faint">
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
                  classList={{ "bg-accent-soft": session.active, "ml-3 border-line-strong border-l": session.branch }}
                >
                  <span
                    class="size-1.5 shrink-0 rounded-full bg-placeholder"
                    classList={{ "bg-accent": session.active, "bg-warning": session.running }}
                  />
                  <span class="min-w-0 flex-1 truncate text-xs font-medium">{session.label}</span>
                  <span class="font-mono text-[9px] text-faint">{session.meta}</span>
                </div>
              )}
            </For>
          </section>
          <div class="flex justify-between border-line border-t px-3 py-2 font-mono text-[10px] text-faint max-[720px]:hidden">
            <span>Models</span>
            <span>Skills</span>
            <span>Config</span>
          </div>
        </aside>

        <section
          class="grid min-h-0 min-w-0 grid-rows-[42px_minmax(0,1fr)_auto] overflow-hidden bg-surface max-[720px]:w-full"
          aria-label="Conversation"
        >
          <div class="flex items-center gap-3 overflow-hidden border-line border-b px-3 text-xs">
            <span class="font-mono text-faint">::</span>
            <h1 class="m-0 min-w-0 truncate text-xs font-bold">{props.fixture.heading}</h1>
            <span class="ml-auto shrink-0 rounded-full bg-surface-hover px-2 py-1 font-mono text-[9px] text-faint">
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
                    <span class="mb-3 font-mono text-4xl font-bold text-accent">C/</span>
                    <p class="mb-2 font-mono text-[10px] tracking-[0.14em] text-accent uppercase">
                      {props.fixture.eyebrow}
                    </p>
                    <h2 class="m-0 max-w-lg text-2xl font-semibold tracking-[-0.035em]">{props.fixture.heading}</h2>
                    <p class="mt-3 max-w-md text-sm leading-6 text-faint">
                      Start a new session here, or choose a scenario to inspect detailed deterministic chat states.
                    </p>
                  </div>
                }
              >
                <p class="mb-7 font-mono text-[10px] tracking-[0.1em] text-faint uppercase">{props.fixture.eyebrow}</p>
                <Show when={props.fixture.history}>
                  {(history) => (
                    <div class="mb-6 flex items-center gap-3 text-[11px] text-faint">
                      <span class="h-px flex-1 bg-line" />
                      <button
                        type="button"
                        class="rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] text-faint"
                      >
                        ↑ {history().label}
                      </button>
                      <span class="font-mono text-[9px]">{history().hiddenCount} hidden</span>
                      <span class="h-px flex-1 bg-line" />
                    </div>
                  )}
                </Show>
                <For each={props.fixture.messages}>{(message) => <DemoMessage message={message} />}</For>
              </Show>
            </div>
            <Show when={props.fixture.minimap}>
              {(minimap) => (
                <aside
                  class="absolute top-4 right-2 bottom-4 w-8 border-line border-l bg-surface-sunken max-[720px]:hidden"
                  aria-label="Chat minimap"
                >
                  <div class="absolute top-3 bottom-3 left-1/2 w-px bg-line" />
                  <For each={minimap()}>
                    {(item, index) => (
                      <span
                        class="absolute left-1/2 size-2 -translate-x-1/2 rounded-sm border border-placeholder bg-surface"
                        classList={{ "scale-125 border-accent bg-accent": item.active }}
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
                class="mx-auto mb-2 max-w-[760px] rounded-md border border-warning-border bg-warning-soft px-3 py-2 font-mono text-[10px] text-warning"
              >
                {props.fixture.composer.retry}
              </div>
            </Show>
            <Show when={props.fixture.composer.queued}>
              {(queued) => (
                <div class="mx-auto mb-2 max-w-[760px] overflow-hidden rounded-md border border-line bg-surface-sunken">
                  <For each={queued()}>
                    {(item) => (
                      <div class="flex min-w-0 items-center gap-2 border-line-subtle border-b px-3 py-1.5 text-[11px] last:border-b-0">
                        <span class="shrink-0 rounded-full border border-accent-border px-2 py-0.5 font-mono text-[9px] text-accent">
                          {item.kind}
                        </span>
                        <span class="truncate text-faint">{item.text}</span>
                        <span class="ml-auto text-faint">queued</span>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </Show>
            <div class="mx-auto max-w-[760px] rounded-xl border border-line-strong bg-surface p-3 shadow-[0_8px_30px_var(--shadow-color)]">
              <span class="text-sm text-faint">{props.fixture.composer.placeholder}</span>
              <div class="mt-5 flex items-center gap-2 font-mono text-[10px] text-faint">
                <span class="rounded-md bg-surface-hover px-2 py-1">deterministic</span>
                <span class="min-w-0 truncate max-[720px]:hidden">{props.fixture.composer.status}</span>
                <span
                  class="ml-auto shrink-0 rounded-md px-2 py-1 text-surface"
                  classList={{
                    "bg-danger": props.fixture.composer.action === "Abort",
                    "bg-strong": props.fixture.composer.action === "Send",
                  }}
                >
                  {props.fixture.composer.action}
                </span>
              </div>
            </div>
          </div>
        </section>

        <aside
          class="flex min-h-0 flex-col border-line border-l bg-surface-sunken max-[720px]:min-h-[330px] max-[720px]:border-t max-[720px]:border-l-0"
          aria-label="Files"
        >
          <Show
            when={props.fixture.workspace ?? props.fixture.surface}
            fallback={
              <>
                <div class="flex h-[42px] items-center justify-between border-line border-b px-3 text-xs">
                  <strong>Files</strong>
                  <span class="font-mono text-[10px] text-faint">main</span>
                </div>
                <div class="border-line border-b p-2">
                  <For each={props.fixture.files}>
                    {(file) => (
                      <div
                        class="flex h-7 items-center gap-2 rounded px-2 text-xs"
                        classList={{ "bg-accent-soft": file.label === props.fixture.activeFile }}
                        style={{ "padding-left": `${8 + file.depth * 14}px` }}
                      >
                        <span class="font-mono text-[10px] text-faint">{file.kind === "directory" ? "v" : "."}</span>
                        <span class="min-w-0 flex-1 truncate">{file.label}</span>
                        <Show when={file.status}>
                          <span
                            class="font-mono text-[10px]"
                            classList={{
                              "text-success": file.status === "added",
                              "text-warning": file.status === "modified",
                            }}
                          >
                            {file.status === "added" ? "A" : "M"}
                          </span>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
                <div class="min-h-0 flex-1 overflow-auto bg-code-preview p-4 font-mono text-[11px] leading-6 text-code-preview-foreground">
                  <Show
                    when={props.fixture.activeFile}
                    fallback={<p class="m-0 text-code-preview-muted">Select a populated scenario to preview a file.</p>}
                  >
                    <div class="mb-3 flex items-center justify-between text-[10px] text-code-preview-muted">
                      <span>{props.fixture.activeFile}</span>
                      <span>TSX</span>
                    </div>
                    <pre class="m-0 whitespace-pre-wrap">
                      <code>
                        <span class="text-code-preview-keyword">export function</span> DemoShell() {"{"}
                        <br />
                        {"  "}
                        <span class="text-code-preview-control">return</span> (
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
                <DemoWorkspacePanel fixture={panel() as DemoWorkspaceFixture} state={props.workspacePanelState} />
              ) : (
                <DemoSurfacePanel fixture={panel() as DemoSurfaceFixture} />
              )
            }
          </Show>
        </aside>
      </div>
    </div>
  )
}
