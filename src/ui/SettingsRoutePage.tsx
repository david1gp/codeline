import { Show } from "solid-js"
import { ConfigurationEditor } from "./configuration/ConfigurationEditor.js"
import { SettingsGeneralPanel } from "./SettingsGeneralPanel.js"
import { settingsRoutePageStateCreate } from "./settingsRoutePageStateCreate.js"
import { SettingsSidebar } from "./SettingsSidebar.js"

export function SettingsRoutePage() {
  const state = settingsRoutePageStateCreate()

  return (
    <main
      class="grid min-h-0 grid-cols-[240px_minmax(0,1fr)] overflow-hidden max-[760px]:grid-cols-1 max-[760px]:grid-rows-[auto_minmax(0,1fr)]"
      aria-label="Settings"
    >
      <SettingsSidebar activeSection={state.activeSection()} />
      <div class="min-h-0 overflow-y-auto px-6 py-8 max-[760px]:px-4 max-[760px]:py-6">
        <div class="mx-auto w-full max-w-4xl">
          <Show when={state.configuration()} fallback={<SettingsGeneralPanel state={state} />}>
            {(configuration) => <ConfigurationEditor state={configuration()} />}
          </Show>
        </div>
      </div>
    </main>
  )
}
