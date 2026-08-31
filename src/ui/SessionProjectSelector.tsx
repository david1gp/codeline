import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { NewProjectDialog } from "./NewProjectDialog.js"
import { SessionProjectPopover } from "./SessionProjectPopover.js"
import { sessionProjectSelectorStateCreate } from "./sessionProjectSelectorStateCreate.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

export function SessionProjectSelector(props: {
  activeProject?: ActiveProjectState
  idPrefix: string
  state: SessionResourceSelectorView
}) {
  const state = sessionProjectSelectorStateCreate({
    activeProject: () => props.activeProject,
    resources: () => props.state,
  })

  return (
    <div class="grid w-full min-w-0 gap-1.5" id={props.idPrefix}>
      <SessionProjectPopover idPrefix={props.idPrefix} onNewProject={state.newProjectStart} state={props.state} />
      <NewProjectDialog
        activeProject={state.activeProject()}
        buttonClass="hidden"
        idPrefix={`${props.idPrefix}-new-project`}
        onProjectConfirmed={state.newProjectConfirmed}
        onOpenChange={state.newProjectOpenChange}
        open={state.newProjectOpen}
      />
    </div>
  )
}
