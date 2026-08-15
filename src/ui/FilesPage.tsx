import { Show } from "solid-js"
import { ProjectBrowser } from "../project/ProjectBrowser.js"
import { FilesProjectSelector } from "./FilesProjectSelector.js"
import type { FilesScreenView } from "./filesScreenView.js"

export function FilesPage(props: { state: FilesScreenView }) {
  const state = props.state

  return (
    <main class="min-h-0 min-w-0 overflow-auto p-6 max-[760px]:p-4" aria-label="Project files workspace">
      <FilesProjectSelector state={state} />

      <Show when={state.browser()} keyed>
        {(browser) => <ProjectBrowser state={browser} />}
      </Show>
    </main>
  )
}
