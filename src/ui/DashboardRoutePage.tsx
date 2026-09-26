import { A } from "@solidjs/router"
import { For } from "solid-js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { primaryNavigationStateCreate } from "./primaryNavigationStateCreate.js"

export function DashboardRoutePage() {
  const state = primaryNavigationStateCreate()

  return (
    <main class="min-h-0 overflow-y-auto px-6 py-8 max-[760px]:px-4" aria-labelledby="dashboard-title">
      <div class="mx-auto grid w-full max-w-5xl gap-6">
        <header>
          <h1 id="dashboard-title" class="font-semibold text-2xl text-foreground">
            Dashboard
          </h1>
          <p class="mt-1 text-faint text-sm">Choose where you want to continue in Codeline.</p>
        </header>

        <nav class="grid gap-4 sm:grid-cols-2" aria-label="Dashboard destinations">
          <For each={state.items}>
            {(item) => (
              <A
                class="group grid min-h-40 content-between gap-6 rounded-lg border border-line bg-surface-raised p-5 no-underline transition-colors hover:border-accent-border hover:bg-surface-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                href={item.href()}
              >
                <span class="grid size-10 place-items-center rounded-lg border border-accent-border bg-accent-soft text-accent">
                  <Icon path={item.icon} class="size-5 fill-current" />
                </span>
                <span>
                  <span class="block font-medium text-foreground text-lg">{item.label}</span>
                  <span class="mt-1 block text-faint text-sm">{item.description}</span>
                </span>
              </A>
            )}
          </For>
        </nav>
      </div>
    </main>
  )
}
