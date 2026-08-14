import { A } from "@solidjs/router"
import { For, Show } from "solid-js"
import type { DemoCatalogSection } from "./demoCatalogSection.js"

export function DemoCatalogIndex(props: { sections: readonly DemoCatalogSection[] }) {
  return (
    <div class="mx-auto w-full max-w-6xl px-6 py-10 max-[640px]:px-4 max-[640px]:py-6">
      <p class="m-0 font-mono text-[11px] tracking-[0.12em] text-[#2e68c7] uppercase">Component catalog</p>
      <h1 class="mt-2 mb-3 text-3xl font-semibold tracking-[-0.04em]">Codeline interface inventory</h1>
      <p class="m-0 max-w-2xl text-sm leading-6 text-[#5f6879]">
        Deterministic screen scenarios and real reusable components, rendered without application providers or backend
        services.
      </p>

      <div class="mt-10 grid grid-cols-2 gap-5 max-[760px]:grid-cols-1">
        <For each={props.sections}>
          {(section) => (
            <section
              id={section.slug}
              class="rounded-xl border border-[#d8dce3] bg-white p-5 shadow-[0_8px_30px_rgb(28_39_57_/_5%)]"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <h2 class="m-0 text-lg font-semibold">{section.label}</h2>
                  <p class="mt-1 mb-0 text-xs leading-5 text-[#5f6879]">{section.description}</p>
                </div>
                <span class="rounded-full bg-[#edf1f5] px-2 py-1 font-mono text-[10px] text-[#5f6879]">
                  {section.items.length}
                </span>
              </div>
              <Show
                when={section.items.length > 0}
                fallback={
                  <p class="mt-7 mb-2 border-[#d8dce3] border-t pt-5 text-sm text-[#5f6879]">
                    No specimens cataloged yet.
                  </p>
                }
              >
                <div class="mt-5 grid gap-2">
                  <For each={section.items}>
                    {(item) => (
                      <A
                        class="group rounded-lg border border-[#e2e5ea] px-3 py-3 no-underline transition-colors hover:border-[#b9c8e2] hover:bg-[#f7f9fc]"
                        href={item.href}
                      >
                        <span class="flex items-center justify-between gap-3 text-sm font-medium">
                          {item.label}
                          <span class="text-[#8b94a3] group-hover:text-[#2e68c7]">→</span>
                        </span>
                        <span class="mt-1 block text-xs leading-5 text-[#5f6879]">{item.description}</span>
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
