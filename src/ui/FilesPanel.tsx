import { mdiDockRight } from "@adaptive-ds/mdi/mdiDockRight.js"
import { mdiFolderOutline } from "@adaptive-ds/mdi/mdiFolderOutline.js"
import { Show } from "solid-js"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { ProjectBrowser } from "../project/ProjectBrowser.js"
import { FilesProjectSelector } from "./FilesProjectSelector.js"
import type { FilesScreenView } from "./filesScreenView.js"

export function FilesPanel(props: { close: () => void; state: FilesScreenView }) {
  return (
    <div class="flex h-full min-h-0 flex-col bg-surface-sunken">
      <header class="flex h-14 shrink-0 items-center gap-2.5 border-line border-b bg-surface-raised px-3">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-accent-border bg-accent-soft text-accent">
          <Icon class="size-4" path={mdiFolderOutline} />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="m-0 truncate text-sm font-semibold tracking-[-0.01em]">Project files</h2>
          <p class="m-0 mt-0.5 text-[10px] text-faint">Browse and preview workspace files</p>
        </div>
        <ButtonIconOnly
          class="size-8 shrink-0 text-faint hover:bg-surface-hover hover:text-accent"
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
      <div class="min-h-0 flex-1 overflow-hidden p-2 pt-0">
        <Show when={props.state.browser()} keyed>
          {(browser) => <ProjectBrowser compact state={browser} />}
        </Show>
      </div>
    </div>
  )
}
