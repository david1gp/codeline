import { A } from "@solidjs/router"
import { For, Match, Switch } from "solid-js"
import { ConfigurationEditor } from "../configuration/ConfigurationEditor.js"
import { urlDemo, urlDemoSection } from "../demo_url/urlDemo.js"
import { DemoCatalogIndex } from "./DemoCatalogIndex.js"
import { DemoSessionWorkspace } from "./DemoSessionWorkspace.js"
import { DemoShell } from "./DemoShell.js"
import { DemoSpecimenPanel } from "./DemoSpecimenPanel.js"
import type { demoAppStateCreate } from "./demoAppStateCreate.js"

export function DemoCatalogShell(props: { state: ReturnType<typeof demoAppStateCreate> }) {
  return (
    <main class="h-dvh overflow-hidden bg-surface-sunken text-foreground [font-family:Inter,ui-sans-serif,system-ui,sans-serif]">
      <header class="flex h-12 items-center gap-3 border-line border-b bg-surface px-4 min-[761px]:hidden">
        <A class="flex items-center gap-2 text-sm font-semibold no-underline" href={urlDemo()}>
          <span class="grid size-6 place-items-center rounded-md bg-accent font-mono text-[11px] text-accent-contrast">
            C/
          </span>
          Demo catalog
        </A>
        <nav class="ml-auto flex gap-1 text-xs" aria-label="Catalog sections">
          <A class="rounded-md px-2 py-1.5 no-underline hover:bg-surface-hover" href={urlDemoSection("screens")}>
            Screens
          </A>
          <A class="rounded-md px-2 py-1.5 no-underline hover:bg-surface-hover" href={urlDemoSection("components")}>
            Components
          </A>
          <A class="rounded-md px-2 py-1.5 no-underline hover:bg-surface-hover" href={urlDemoSection("config")}>
            Config
          </A>
        </nav>
      </header>

      <div
        class="demo-catalog-layout grid h-full min-h-0 max-[760px]:h-[calc(100dvh-48px)] max-[760px]:grid-cols-1"
        style={{ "--demo-catalog-sidebar-width": `${props.state.sidebar.width()}px` }}
      >
        <aside
          class="flex min-h-0 flex-col border-line border-r bg-surface max-[760px]:hidden"
          aria-label="Demo catalog directory"
        >
          <A
            class="flex h-14 items-center gap-2 border-line border-b px-4 text-sm font-semibold no-underline"
            href={urlDemo()}
          >
            <span class="grid size-7 place-items-center rounded-md bg-accent font-mono text-[11px] text-accent-contrast">
              C/
            </span>
            Demo catalog
          </A>
          <nav class="min-h-0 flex-1 overflow-auto p-3" aria-label="Catalog specimens">
            <For each={props.state.sections}>
              {(section) => (
                <section class="mb-5">
                  <A
                    class="mb-1 block px-2 font-mono text-[10px] tracking-[0.1em] text-faint uppercase no-underline"
                    href={urlDemoSection(section.slug)}
                  >
                    {section.label} · {section.items.length}
                  </A>
                  <For each={section.items}>
                    {(item) => (
                      <A
                        class="block rounded-md border border-transparent px-2.5 py-2 text-sm no-underline transition-colors hover:border-line hover:bg-surface-hover hover:text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
                        classList={{
                          "border-accent-border bg-accent-soft font-medium text-foreground":
                            props.state.activeSlug() === item.slug,
                          "text-subtle": props.state.activeSlug() !== item.slug,
                        }}
                        href={item.href}
                        aria-current={props.state.activeSlug() === item.slug ? "page" : undefined}
                      >
                        {item.label}
                      </A>
                    )}
                  </For>
                </section>
              )}
            </For>
          </nav>
          <p class="m-0 border-line border-t px-4 py-3 font-mono text-[9px] tracking-[0.08em] text-faint uppercase">
            Fixtures only · no providers
          </p>
        </aside>
        <hr
          class="application-shell-resize-handle demo-catalog-sidebar-resize-handle"
          classList={{ "is-resizing": props.state.sidebar.isResizing() }}
          tabIndex={0}
          aria-label="Resize demo catalog sidebar"
          aria-orientation="vertical"
          aria-valuemin={props.state.sidebar.minimumWidth()}
          aria-valuemax={props.state.sidebar.maximumWidth()}
          aria-valuenow={props.state.sidebar.width()}
          onKeyDown={props.state.sidebar.resizeKeyDown}
          onPointerCancel={props.state.sidebar.resizeCancel}
          onPointerDown={props.state.sidebar.resizeStart}
          onLostPointerCapture={props.state.sidebar.resizeEnd}
          onPointerMove={props.state.sidebar.resizeMove}
          onPointerUp={props.state.sidebar.resizeEnd}
        />

        <section class="min-h-0 min-w-0 overflow-hidden">
          <Switch
            fallback={
              <div class="h-full min-h-0 overflow-auto">
                <DemoCatalogIndex sections={props.state.indexSections()} />
              </div>
            }
          >
            <Match when={props.state.configuration()}>
              {(configuration) => (
                <div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                  <div class="flex min-h-12 items-center gap-3 border-line border-b bg-surface px-4 max-[760px]:min-h-11">
                    <A class="text-xs text-faint no-underline hover:text-foreground" href={urlDemo()}>
                      Catalog
                    </A>
                    <span class="text-placeholder">/</span>
                    <strong class="text-xs">{configuration().label}</strong>
                    <span class="ml-auto font-mono text-[9px] tracking-[0.08em] text-faint uppercase">
                      Local fixture editor
                    </span>
                  </div>
                  <div class="min-h-0 overflow-auto bg-background p-6 text-foreground max-[640px]:p-4">
                    <ConfigurationEditor state={props.state.configurationState()!} />
                  </div>
                </div>
              )}
            </Match>
            <Match when={props.state.specimen()}>
              {(specimen) => (
                <div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                  <div class="flex min-h-12 flex-wrap items-center gap-3 border-line border-b bg-surface px-4 max-[760px]:min-h-11">
                    <A class="text-xs text-faint no-underline hover:text-foreground" href={urlDemo()}>
                      Catalog
                    </A>
                    <span class="text-placeholder">/</span>
                    <strong class="text-xs">{specimen().label}</strong>
                    <nav class="ml-auto flex gap-1" aria-label="Specimen variants">
                      <For each={specimen().variants}>
                        {(variant) => (
                          <button
                            type="button"
                            class="rounded-md border border-line px-2 py-1 font-mono text-[10px] text-faint uppercase"
                            classList={{
                              "border-accent bg-accent-soft text-accent": props.state.variant() === variant,
                            }}
                            aria-pressed={props.state.variant() === variant}
                            onClick={() => props.state.variantSelect(variant)}
                          >
                            {variant}
                          </button>
                        )}
                      </For>
                    </nav>
                  </div>
                  <div class="min-h-0 overflow-auto bg-background text-foreground">
                    <DemoSpecimenPanel specimen={specimen()} state={props.state.specimenState} />
                  </div>
                </div>
              )}
            </Match>
            <Match when={props.state.scenario()}>
              {(scenario) => (
                <div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
                  <div class="flex min-h-12 items-center gap-3 border-line border-b bg-surface px-4 max-[760px]:min-h-11">
                    <A class="text-xs text-faint no-underline hover:text-foreground" href={urlDemo()}>
                      Catalog
                    </A>
                    <span class="text-placeholder">/</span>
                    <strong class="text-xs">{scenario().label}</strong>
                    <span class="ml-auto font-mono text-[9px] tracking-[0.08em] text-faint uppercase">
                      Screen scenario
                    </span>
                  </div>
                  {props.state.fixture()!.sessionWorkspace ? (
                    <DemoSessionWorkspace state={props.state.sessionWorkspaceState} />
                  ) : (
                    <DemoShell fixture={props.state.fixture()!} workspacePanelState={props.state.workspacePanelState} />
                  )}
                </div>
              )}
            </Match>
          </Switch>
        </section>
      </div>
    </main>
  )
}
