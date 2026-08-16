import { WorkspacePage } from "./WorkspacePage.js"
import { workspaceRoutePageStateCreate } from "./workspaceRoutePageStateCreate.js"

export function WorkspaceRoutePage() {
  const state = workspaceRoutePageStateCreate()
  return <WorkspacePage state={state} />
}
