import { For, Show } from "solid-js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { PwaStatusActions } from "./pwa/PwaStatusActions.js"
import { settingsRoutePageStateCreate } from "./settingsRoutePageStateCreate.js"

export function SettingsRoutePage() {
  const state = settingsRoutePageStateCreate()

  return (
    <main class="min-h-0 overflow-y-auto px-6 py-8 max-[760px]:px-4" aria-labelledby="settings-title">
      <div class="mx-auto grid w-full max-w-3xl gap-6">
        <header>
          <h1 id="settings-title" class="font-semibold text-2xl text-foreground">
            Settings
          </h1>
          <p class="mt-1 text-faint text-sm">Manage this Codeline installation.</p>
        </header>

        <Show when={state.theme}>
          {(theme) => (
            <section
              class="grid gap-4 rounded-lg border border-line bg-surface-raised p-5"
              aria-labelledby="appearance-settings-title"
            >
              <div>
                <h2 id="appearance-settings-title" class="font-medium text-foreground text-lg">
                  Appearance
                </h2>
                <p class="mt-1 text-faint text-sm">Choose how Codeline should look.</p>
              </div>
              <fieldset class="grid gap-3 border-0 p-0 sm:grid-cols-3">
                <legend class="sr-only">Theme</legend>
                <For each={theme().themeOptions}>
                  {(option) => {
                    const selected = () => theme().currentTheme() === option.value

                    return (
                      <button
                        class="flex min-h-28 flex-col items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        classList={{
                          "border-accent bg-accent-soft text-foreground": selected(),
                          "border-line bg-surface hover:border-accent-border hover:bg-surface-hover": !selected(),
                        }}
                        type="button"
                        aria-pressed={selected()}
                        onClick={() => theme().themeSelect(option.value)}
                      >
                        <Icon path={option.icon} class="size-5 fill-current text-accent" />
                        <span class="font-medium text-sm">{option.label}</span>
                        <span class="text-faint text-xs">{option.description}</span>
                      </button>
                    )
                  }}
                </For>
              </fieldset>
            </section>
          )}
        </Show>

        <section
          class="grid gap-3 rounded-lg border border-line bg-surface-raised p-5"
          aria-labelledby="app-settings-title"
        >
          <div>
            <h2 id="app-settings-title" class="font-medium text-foreground text-lg">
              App
            </h2>
            <p class="mt-1 text-faint text-sm">Install Codeline when it is available in this browser.</p>
          </div>
          <Show
            when={state.pwa}
            fallback={<p class="text-faint text-sm">PWA installation is unavailable in this context.</p>}
          >
            {(pwa) => <PwaStatusActions placement="settings" state={pwa()} />}
          </Show>
        </section>
      </div>
    </main>
  )
}
