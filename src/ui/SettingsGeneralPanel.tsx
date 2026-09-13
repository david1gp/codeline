import { For, Show } from "solid-js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { ProjectRegistryImportActions } from "../project/ui/ProjectRegistryImportActions.js"
import { ConnectionStatusDetails } from "./ConnectionStatusDetails.js"
import { PwaStatusActions } from "./pwa/PwaStatusActions.js"
import type { settingsRoutePageStateCreate } from "./settingsRoutePageStateCreate.js"

export function SettingsGeneralPanel(props: { state: ReturnType<typeof settingsRoutePageStateCreate> }) {
  return (
    <div class="grid gap-6">
      <header>
        <p class="m-0 font-mono text-[10px] tracking-[0.1em] text-accent uppercase">Workspace</p>
        <h1 id="settings-title" class="mt-1 mb-0 font-semibold text-2xl text-foreground">
          General
        </h1>
        <p class="mt-1 text-faint text-sm">Manage this Codeline installation.</p>
      </header>
      <Show when={props.state.theme}>
        {(theme) => (
          <section
            class="grid gap-4 rounded-xl border border-line bg-surface-raised p-5"
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
                {(option) => (
                  <button
                    class="flex min-h-28 flex-col items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    classList={{
                      "border-accent bg-accent-soft text-foreground": theme().currentTheme() === option.value,
                      "border-line bg-surface hover:border-accent-border hover:bg-surface-hover":
                        theme().currentTheme() !== option.value,
                    }}
                    type="button"
                    aria-pressed={theme().currentTheme() === option.value}
                    onClick={() => theme().themeSelect(option.value)}
                  >
                    <Icon path={option.icon} class="size-5 fill-current text-accent" />
                    <span class="font-medium text-sm">{option.label}</span>
                    <span class="text-faint text-xs">{option.description}</span>
                  </button>
                )}
              </For>
            </fieldset>
          </section>
        )}
      </Show>
      <section
        class="grid gap-3 rounded-xl border border-line bg-surface-raised p-5"
        aria-labelledby="projects-settings-title"
      >
        <div>
          <h2 id="projects-settings-title" class="font-medium text-foreground text-lg">
            Projects
          </h2>
          <p class="mt-1 text-faint text-sm">Import existing OpenCode projects into your registry.</p>
        </div>
        <ProjectRegistryImportActions projectRegistry={props.state.projectRegistry} />
      </section>
      <section
        class="grid gap-3 rounded-xl border border-line bg-surface-raised p-5"
        aria-labelledby="connection-settings-title"
      >
        <div>
          <h2 id="connection-settings-title" class="font-medium text-foreground text-lg">
            Connection
          </h2>
          <p class="mt-1 text-faint text-sm">Status of the app, sync, and API connections.</p>
        </div>
        <Show
          when={props.state.connection}
          fallback={<p class="text-faint text-sm">Connection status is unavailable in this context.</p>}
        >
          {(connection) => <ConnectionStatusDetails state={connection()} />}
        </Show>
      </section>
      <section
        class="grid gap-3 rounded-xl border border-line bg-surface-raised p-5"
        aria-labelledby="app-settings-title"
      >
        <div>
          <h2 id="app-settings-title" class="font-medium text-foreground text-lg">
            App
          </h2>
          <p class="mt-1 text-faint text-sm">Install Codeline when it is available in this browser.</p>
        </div>
        <Show
          when={props.state.pwa}
          fallback={<p class="text-faint text-sm">PWA installation is unavailable in this context.</p>}
        >
          {(pwa) => <PwaStatusActions placement="settings" state={pwa()} />}
        </Show>
      </section>
    </div>
  )
}
