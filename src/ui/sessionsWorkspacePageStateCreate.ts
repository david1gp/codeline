import type { WorkspaceScreenView } from "./workspaceScreenView.js"
import { sessionSidebarNewStateCreate } from "../session/ui/sessionSidebarNewStateCreate.js"

export function sessionsWorkspacePageStateCreate(workspace: () => WorkspaceScreenView) {
  return { sidebar: sessionSidebarNewStateCreate(() => workspace().sessionList) }
}
