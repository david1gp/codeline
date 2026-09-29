import { NewSessionDialog } from "../session/ui/NewSessionDialog.js"
import { WorkspacePage } from "./WorkspacePage.js"
import { SessionsWorkspacePage } from "./SessionsWorkspacePage.js"
import { workspaceRoutePageStateCreate } from "./workspaceRoutePageStateCreate.js"

export function WorkspaceRoutePage() {
  const state = workspaceRoutePageStateCreate()
  return (
    <>
      {state.legacy() ? <WorkspacePage state={state.screen} /> : <SessionsWorkspacePage state={state.screen} />}
      {state.screen.newSessionDialogOpen !== undefined && state.screen.newSessionDialogOpenChange !== undefined ? (
        <NewSessionDialog
          activeProject={state.screen.activeProject}
          buttonClass="hidden"
          idPrefix="workspace-new-session"
          onOpenChange={state.screen.newSessionDialogOpenChange}
          open={state.screen.newSessionDialogOpen}
          projectIdOverride={state.screen.projectIdOverride}
          projectPathOverride={state.screen.projectPathOverride}
          projectRegistry={state.screen.projectRegistry}
          sessionTarget={state.screen.sessionTargetSelector}
        />
      ) : null}
    </>
  )
}
