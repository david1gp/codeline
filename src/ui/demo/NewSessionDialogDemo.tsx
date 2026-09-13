import { NewSessionDialog } from "../../session/ui/NewSessionDialog.js"
import type { demoNewSessionDialogStateCreate } from "./demoNewSessionDialogStateCreate.js"

export function NewSessionDialogDemo(props: { state: ReturnType<typeof demoNewSessionDialogStateCreate> }) {
  return (
    <div class="grid min-h-full place-items-center p-6">
      <section class="grid w-[min(100%,30rem)] gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm">
        <div class="grid gap-1">
          <h2 class="m-0 text-base font-semibold text-strong">Searchable new session dialog</h2>
          <p class="m-0 text-sm text-faint">
            Open the dialog, search by project name or path, and use the arrow keys and Enter to select.
          </p>
        </div>

        <NewSessionDialog
          activeProject={props.state.activeProject}
          fetch={props.state.projectFetch}
          idPrefix="demo-new-session"
          newProjectRegistry={props.state.projectRegistry}
          projectIdOverride={props.state.projectIdOverride}
          projectPathOverride={props.state.projectPathOverride}
          projects={props.state.projects}
          sessionTarget={props.state.sessionTarget}
        />

        <div class="rounded-md border border-line-subtle bg-surface-sunken px-3 py-2" aria-live="polite">
          <span class="block font-mono text-[10px] tracking-[0.08em] text-faint uppercase">Selected outcome</span>
          <strong class="mt-1 block text-sm text-strong">{props.state.selectedOutcome()}</strong>
        </div>
      </section>
    </div>
  )
}
