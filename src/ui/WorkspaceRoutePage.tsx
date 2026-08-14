import { WorkspacePage } from "./WorkspacePage.js"
import { workspaceScreenStateCreate } from "./workspaceScreenStateCreate.js"

export function WorkspaceRoutePage() {
  const state = workspaceScreenStateCreate()
  return <WorkspacePage state={state} />
}
