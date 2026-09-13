import { NewSessionDialog } from "./NewSessionDialog.js"
import { WorkspacePage } from "./WorkspacePage.js"
import { workspaceRoutePageStateCreate } from "./workspaceRoutePageStateCreate.js"

export function WorkspaceRoutePage() {
  const state = workspaceRoutePageStateCreate()
  return (
    <>
      <WorkspacePage state={state} />
      {state.newSessionDialogOpen !== undefined && state.newSessionDialogOpenChange !== undefined ? (
        <NewSessionDialog
          activeProject={state.activeProject}
          buttonClass="hidden"
          idPrefix="workspace-new-session"
          onOpenChange={state.newSessionDialogOpenChange}
          open={state.newSessionDialogOpen}
          projectIdOverride={state.projectIdOverride}
          projectPathOverride={state.projectPathOverride}
          projectRegistry={state.projectRegistry}
          sessionTarget={state.sessionTargetSelector}
        />
      ) : null}
    </>
  )
}
