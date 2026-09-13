import { Show } from "solid-js"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { FilesPanel } from "../FilesPanel.js"
import { SelectedSession } from "../SelectedSession.js"
import { applicationIcon } from "../applicationIcon.js"
import type { demoSessionWorkspaceStateCreate } from "./demoSessionWorkspaceStateCreate.js"

export function DemoSessionWorkspace(props: { state: ReturnType<typeof demoSessionWorkspaceStateCreate> }) {
  return (
    <div
      class="grid h-[calc(100dvh-48px)] min-h-[620px] overflow-hidden bg-surface max-[900px]:h-auto max-[900px]:min-h-0 max-[900px]:grid-cols-1"
      classList={{
        "grid-cols-1": !props.state.rightPanelOpen(),
        "grid-cols-[minmax(0,1fr)_minmax(300px,360px)]": props.state.rightPanelOpen(),
      }}
    >
      <section
        class="flex min-h-0 min-w-0 flex-col overflow-hidden max-[900px]:h-[max(620px,70dvh)]"
        aria-label="Selected session demo"
      >
        <Show when={!props.state.rightPanelOpen()}>
          <div class="flex h-12 shrink-0 items-center justify-end border-line border-b px-3">
            <ButtonIconOnly
              class="size-8 text-faint hover:bg-surface-hover hover:text-accent"
              icon={applicationIcon.rightPanel}
              iconClass="size-4"
              variant={buttonVariant.ghost}
              title="Open file panel"
              aria-label="Open file panel"
              aria-expanded={props.state.rightPanelOpen()}
              onClick={props.state.rightPanelShow}
            />
          </div>
        </Show>
        <SelectedSession state={props.state.selectedSession} />
      </section>
      <Show when={props.state.rightPanelOpen()}>
        <aside
          id="workspace-right-panel"
          class="min-h-0 overflow-hidden border-line border-l max-[900px]:h-[620px] max-[900px]:border-t max-[900px]:border-l-0"
          aria-label="Project files demo"
        >
          <FilesPanel close={props.state.rightPanelClose} state={props.state.files} />
        </aside>
      </Show>
    </div>
  )
}
