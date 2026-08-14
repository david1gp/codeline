import { A } from "@solidjs/router"
import { For, Match, Switch } from "solid-js"
import { DemoCatalogIndex } from "./DemoCatalogIndex.js"
import { DemoShell } from "./DemoShell.js"
import { DemoSpecimenPanel } from "./DemoSpecimenPanel.js"
import type { demoAppStateCreate } from "./demoAppStateCreate.js"

export function DemoCatalogShell(props: { state: ReturnType<typeof demoAppStateCreate> }) {
  return (
    <main class="min-h-dvh bg-[#f5f6f8] text-[#18202b] [font-family:Inter,ui-sans-serif,system-ui,sans-serif]">
      <header class="flex h-12 items-center gap-3 border-[#d8dce3] border-b bg-white px-4 min-[761px]:hidden">
        <A class="flex items-center gap-2 text-sm font-semibold no-underline" href="/demo">
          <span class="grid size-6 place-items-center rounded-md bg-[#202938] font-mono text-[11px] text-white">
            C/
          </span>
          Demo catalog
        </A>
        <nav class="ml-auto flex gap-1 text-xs" aria-label="Catalog sections">
          <A class="rounded-md px-2 py-1.5 no-underline hover:bg-[#eef1f5]" href="/demo/screens">
            Screens
          </A>
          <A class="rounded-md px-2 py-1.5 no-underline hover:bg-[#eef1f5]" href="/demo/components">
            Components
          </A>
        </nav>
      </header>

      <div class="grid min-h-dvh grid-cols-[260px_minmax(0,1fr)] max-[760px]:min-h-[calc(100dvh-48px)] max-[760px]:grid-cols-1">
        <aside
          class="flex min-h-0 flex-col border-[#d8dce3] border-r bg-white max-[760px]:hidden"
          aria-label="Demo catalog directory"
        >
          <A
            class="flex h-14 items-center gap-2 border-[#d8dce3] border-b px-4 text-sm font-semibold no-underline"
            href="/demo"
          >
            <span class="grid size-7 place-items-center rounded-md bg-[#202938] font-mono text-[11px] text-white">
              C/
            </span>
            Demo catalog
          </A>
          <nav class="min-h-0 flex-1 overflow-auto p-3" aria-label="Catalog specimens">
            <For each={props.state.sections}>
              {(section) => (
                <section class="mb-5">
                  <A
                    class="mb-1 block px-2 font-mono text-[10px] tracking-[0.1em] text-[#5f6879] uppercase no-underline"
                    href={`/demo/${section.slug}`}
                  >
                    {section.label} · {section.items.length}
                  </A>
                  <For each={section.items}>
                    {(item) => (
                      <A
                        class="block rounded-md px-2 py-2 text-xs text-[#5f6879] no-underline hover:bg-[#eef1f5] hover:text-[#18202b]"
                        classList={{ "bg-[#e8eefb] text-[#2459ad]": props.state.activeSlug() === item.slug }}
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
          <p class="m-0 border-[#d8dce3] border-t px-4 py-3 font-mono text-[9px] tracking-[0.08em] text-[#5f6879] uppercase">
            Fixtures only · no providers
          </p>
        </aside>

        <section class="min-w-0 overflow-hidden">
          <Switch fallback={<DemoCatalogIndex sections={props.state.indexSections()} />}>
            <Match when={props.state.specimen()}>
              {(specimen) => (
                <div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                  <div class="flex min-h-12 flex-wrap items-center gap-3 border-[#d8dce3] border-b bg-white px-4 max-[760px]:min-h-11">
                    <A class="text-xs text-[#5f6879] no-underline hover:text-[#18202b]" href="/demo">
                      Catalog
                    </A>
                    <span class="text-[#a5acb7]">/</span>
                    <strong class="text-xs">{specimen().label}</strong>
                    <nav class="ml-auto flex gap-1" aria-label="Specimen variants">
                      <For each={specimen().variants}>
                        {(variant) => (
                          <button
                            type="button"
                            class="rounded-md border border-[#d8dce3] px-2 py-1 font-mono text-[10px] text-[#5f6879] uppercase"
                            classList={{
                              "border-[#2e68c7] bg-[#e8eefb] text-[#2459ad]": props.state.variant() === variant,
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
                <div class="h-full">
                  <div class="flex min-h-12 items-center gap-3 border-[#d8dce3] border-b bg-white px-4 max-[760px]:min-h-11">
                    <A class="text-xs text-[#5f6879] no-underline hover:text-[#18202b]" href="/demo">
                      Catalog
                    </A>
                    <span class="text-[#a5acb7]">/</span>
                    <strong class="text-xs">{scenario().label}</strong>
                    <span class="ml-auto font-mono text-[9px] tracking-[0.08em] text-[#5f6879] uppercase">
                      Screen scenario
                    </span>
                  </div>
                  <DemoShell fixture={props.state.fixture()!} workspacePanelState={props.state.workspacePanelState} />
                </div>
              )}
            </Match>
          </Switch>
        </section>
      </div>
    </main>
  )
}
