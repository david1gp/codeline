import { mdiPlus } from "@mdi/js"
import { For, Show } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { CorvuDialog } from "#ui/interactive/dialog/CorvuDialog.jsx"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { newProjectDialogStateCreate } from "./newProjectDialogStateCreate.js"
import { NewProjectForm } from "./NewProjectForm.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"
import { newSessionDialogStateCreate } from "./newSessionDialogStateCreate.js"

export function NewSessionDialog(props: {
  activeProject: ActiveProjectState
  idPrefix: string
  projects: Parameters<typeof newSessionDialogStateCreate>[0]["projects"]
  sessionTarget: SessionTargetSelectorState
}) {
  const state = newSessionDialogStateCreate({
    activeProject: props.activeProject,
    projects: props.projects,
    sessionTarget: props.sessionTarget,
  })
  const projectState = newProjectDialogStateCreate({
    activeProject: props.activeProject,
    idPrefix: `${props.idPrefix}-new-project`,
    onProjectConfirmed: state.projectConfirmed,
    open: state.newProjectOpen,
  })

  return (
    <CorvuDialog
      title={state.dialogTitle()}
      description={state.dialogDescription()}
      buttonChildren="New Session"
      class="h-9 w-full justify-center"
      disabled={!state.canCreateSession()}
      icon={mdiPlus}
      iconClass="size-4"
      innerClass="w-[min(92vw,28rem)]"
      open={state.open()}
      onOpenChange={state.openChange}
      variant={buttonVariant.contrast}
    >
      <Show
        when={state.newProjectOpen()}
        fallback={
          <form class="grid gap-3" onSubmit={state.formSubmit}>
            <label class="text-sm font-medium" for={`${props.idPrefix}-project`}>
              Project
            </label>
            <select
              id={`${props.idPrefix}-project`}
              class="h-9 rounded-[7px] border border-line bg-surface-raised px-2 text-sm text-strong outline-none focus:border-accent-border"
              value={state.selectedProjectPath()}
              onChange={(event) => state.projectChange(event.currentTarget.value)}
            >
              <For each={state.projects()}>
                {(project) => <option value={project.projectPath}>{project.projectLabel}</option>}
              </For>
              <option value={state.newProjectOptionValue}>New project</option>
            </select>

            <Show when={state.sessionCreateErrorMessage()}>
              {(message) => (
                <p class="m-0 text-xs text-danger" role="alert">
                  {message()}
                </p>
              )}
            </Show>

            <div class="flex justify-end">
              <Button type="submit" disabled={!state.canCreateSession()} variant={buttonVariant.contrast}>
                {state.primaryActionLabel()}
              </Button>
            </div>
          </form>
        }
      >
        <NewProjectForm state={projectState} />
      </Show>
    </CorvuDialog>
  )
}
