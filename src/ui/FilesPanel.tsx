import { mdiDockRight } from "@mdi/js"
import { Show } from "solid-js"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { ProjectBrowser } from "../project/ProjectBrowser.js"
import { FilesProjectSelector } from "./FilesProjectSelector.js"
import type { FilesScreenView } from "./filesScreenView.js"

export function FilesPanel(props: { close: () => void; state: FilesScreenView }) {
  return (
    <div class="flex h-full min-h-0 flex-col bg-[var(--background)]">
      <header class="flex h-9 shrink-0 items-center border-[var(--border)] border-b bg-[var(--muted)]">
        <span class="min-w-0 flex-1 truncate px-3 text-xs font-medium text-[var(--foreground)]">Explorer</span>
        <ButtonIconOnly
          class="h-full w-9 shrink-0 rounded-none border-[var(--border)] border-y-0 border-r-0 border-l bg-[var(--surface-hover)] p-0 text-[var(--foreground)] hover:text-[var(--accent)]"
          icon={mdiDockRight}
          iconClass="size-4 fill-current dark:fill-current"
          variant="none"
          aria-label="Close file panel"
          aria-controls="workspace-right-panel"
          aria-expanded="true"
          onClick={props.close}
          title="Close file panel"
        />
      </header>
      <FilesProjectSelector compact state={props.state} />
      <div class="min-h-0 flex-1 overflow-hidden">
        <Show when={props.state.browser()} keyed>
          {(browser) => <ProjectBrowser compact state={browser} />}
        </Show>
      </div>
    </div>
  )
}
