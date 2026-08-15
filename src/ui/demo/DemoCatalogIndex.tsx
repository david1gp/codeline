import { A } from "@solidjs/router"
import { For, Show } from "solid-js"
import type { DemoCatalogSection } from "./demoCatalogSection.js"

export function DemoCatalogIndex(props: { sections: readonly DemoCatalogSection[] }) {
  return (
    <div class="mx-auto w-full max-w-6xl px-6 py-10 max-[640px]:px-4 max-[640px]:py-6">
      <p class="m-0 font-mono text-[11px] tracking-[0.12em] text-accent uppercase">Component catalog</p>
      <h1 class="mt-2 mb-3 text-3xl font-semibold tracking-[-0.04em]">Codeline interface inventory</h1>
      <p class="m-0 max-w-2xl text-sm leading-6 text-faint">
        Deterministic screen scenarios and real reusable components, rendered without application providers or backend
        services.
      </p>

      <div class="mt-10 grid grid-cols-2 gap-5 max-[760px]:grid-cols-1">
        <For each={props.sections}>
          {(section) => (
            <section
              id={section.slug}
              class="rounded-xl border border-line bg-surface-raised p-5 shadow-[0_8px_30px_var(--shadow-color)]"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <h2 class="m-0 text-lg font-semibold">{section.label}</h2>
                  <p class="mt-1 mb-0 text-xs leading-5 text-faint">{section.description}</p>
                </div>
                <span class="rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-faint">
                  {section.items.length}
                </span>
              </div>
              <Show
                when={section.items.length > 0}
                fallback={
                  <p class="mt-7 mb-2 border-line border-t pt-5 text-sm text-faint">No specimens cataloged yet.</p>
                }
              >
                <div class="mt-5 grid gap-2">
                  <For each={section.items}>
                    {(item) => (
                      <A
                        class="group rounded-lg border border-line-subtle px-3 py-3 no-underline transition-colors hover:border-accent-border hover:bg-surface-hover"
                        href={item.href}
                      >
                        <span class="flex items-center justify-between gap-3 text-sm font-medium">
                          {item.label}
                          <span class="text-subtle group-hover:text-accent">→</span>
                        </span>
                        <span class="mt-1 block text-xs leading-5 text-faint">{item.description}</span>
                      </A>
                    )}
                  </For>
                </div>
              </Show>
            </section>
          )}
        </For>
      </div>
    </div>
  )
}
