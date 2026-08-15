import { Show } from "solid-js"
import { ProjectBrowser } from "../project/ProjectBrowser.js"
import { FilesProjectSelector } from "./FilesProjectSelector.js"
import type { FilesScreenView } from "./filesScreenView.js"

export function FilesPanel(props: { close: () => void; state: FilesScreenView }) {
  return (
    <div class="flex h-full min-h-0 flex-col bg-[var(--background)]">
      <header class="flex h-9 shrink-0 items-center border-[var(--border)] border-b bg-[var(--muted)]">
        <span class="min-w-0 flex-1 truncate px-3 text-xs font-medium text-[var(--foreground)]">Explorer</span>
        <button
          class="grid h-full w-9 shrink-0 place-items-center border-[var(--border)] border-y-0 border-r-0 border-l bg-[var(--surface-hover)] text-[var(--foreground)] hover:text-[var(--accent)]"
          type="button"
          aria-label="Close file panel"
          aria-controls="workspace-right-panel"
          aria-expanded="true"
          onClick={props.close}
        >
          <svg
            aria-hidden="true"
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M15 3v18" />
          </svg>
        </button>
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
