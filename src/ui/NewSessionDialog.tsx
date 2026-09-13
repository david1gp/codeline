import { Show, type Accessor } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { CorvuDialog } from "#ui/interactive/dialog/CorvuDialog.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { ProjectAvatar } from "../project/ui/ProjectAvatar.js"
import type { ProjectRegistryState } from "../project/ui/projectRegistryState.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { applicationIcon } from "./applicationIcon.js"
import { NewProjectForm } from "./NewProjectForm.js"
import { newProjectDialogStateCreate } from "./newProjectDialogStateCreate.js"
import { newSessionDialogStateCreate } from "./newSessionDialogStateCreate.js"
import { SearchablePicker } from "./SearchablePicker.js"
import type { SessionProjectIdOverride } from "./sessionProjectIdOverride.js"
import type { SessionProjectPathOverride } from "./sessionProjectPathOverride.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

export function NewSessionDialog(props: {
  activeProject: ActiveProjectState
  buttonClass?: string
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  idPrefix: string
  newProjectRegistry?: ProjectRegistryState
  onOpenChange?: (open: boolean) => void
  open?: Accessor<boolean>
  projectIdOverride?: SessionProjectIdOverride
  projectPathOverride: SessionProjectPathOverride
  projectRegistry?: ProjectRegistryState
  projects?: Parameters<typeof newSessionDialogStateCreate>[0]["projects"]
  sessionTarget: SessionTargetSelectorState
}) {
  const state = newSessionDialogStateCreate({
    activeProject: props.activeProject,
    onOpenChange: props.onOpenChange,
    open: props.open,
    projectIdOverride: props.projectIdOverride,
    projectPathOverride: props.projectPathOverride,
    projectRegistry: props.projectRegistry,
    projects: props.projects,
    sessionTarget: props.sessionTarget,
  })
  const projectState = newProjectDialogStateCreate({
    activeProject: props.activeProject,
    idPrefix: `${props.idPrefix}-new-project`,
    fetch: props.fetch,
    onProjectConfirmed: state.projectConfirmed,
    open: state.newProjectOpen,
    projectRegistry: props.newProjectRegistry ?? props.projectRegistry,
  })

  return (
    <CorvuDialog
      title={state.dialogTitle()}
      description={state.dialogDescription()}
      buttonChildren="New Session"
      class={props.buttonClass ?? "h-9 w-full justify-center"}
      disabled={!state.canCreateSession()}
      icon={applicationIcon.sessionCreate}
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
            <SearchablePicker
              active={state.open() && !state.newProjectOpen()}
              ariaLabel="Projects"
              emptyText="No projects match your search."
              idPrefix={`${props.idPrefix}-project`}
              items={state.pickerItems()}
              onSelect={(project) => state.projectChange(project.id)}
              placeholder="Search projects…"
              selectedId={state.selectedProjectId()}
              renderLeading={(project) =>
                project.id === state.newProjectOptionValue ? (
                  <Icon class="size-5 text-faint" path={applicationIcon.projectCreate} />
                ) : (
                  <ProjectAvatar class="size-5" name={project.label} faviconUrl={project.faviconUrl} />
                )
              }
            />

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
