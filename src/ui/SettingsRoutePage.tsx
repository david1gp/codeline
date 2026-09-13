import { Show } from "solid-js"
import { ConfigurationEditor } from "./configuration/ConfigurationEditor.js"
import { SettingsGeneralPanel } from "./SettingsGeneralPanel.js"
import { settingsRoutePageStateCreate } from "./settingsRoutePageStateCreate.js"
import { SettingsSidebar } from "./SettingsSidebar.js"

export function SettingsRoutePage() {
  const state = settingsRoutePageStateCreate()

  return (
    <main
      class="settings-layout grid min-h-0 overflow-hidden max-[760px]:grid-cols-1 max-[760px]:grid-rows-[auto_minmax(0,1fr)]"
      style={{ "--settings-sidebar-width": `${state.sidebar.width()}px` }}
      aria-label="Settings"
    >
      <SettingsSidebar activeSection={state.activeSection()} />
      <hr
        class="application-shell-resize-handle settings-sidebar-resize-handle"
        classList={{ "is-resizing": state.sidebar.isResizing() }}
        tabIndex={0}
        aria-label="Resize settings sidebar"
        aria-orientation="vertical"
        aria-valuemin={state.sidebar.minimumWidth()}
        aria-valuemax={state.sidebar.maximumWidth()}
        aria-valuenow={state.sidebar.width()}
        onKeyDown={state.sidebar.resizeKeyDown}
        onPointerCancel={state.sidebar.resizeCancel}
        onPointerDown={state.sidebar.resizeStart}
        onLostPointerCapture={state.sidebar.resizeEnd}
        onPointerMove={state.sidebar.resizeMove}
        onPointerUp={state.sidebar.resizeEnd}
      />
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
