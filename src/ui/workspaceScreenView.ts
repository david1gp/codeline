import type { providerModelSelectorStateCreate } from "../providers/ui/providerModelSelectorStateCreate.js"
import type { applicationShellStateCreate } from "./applicationShellStateCreate.js"
import type { FilesScreenView } from "./filesScreenView.js"
import type { SelectedSessionView } from "./selectedSessionView.js"
import type { sessionListStateCreate } from "./sessionListStateCreate.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"
import type { workspacePageStateCreate } from "./workspacePageStateCreate.js"

/**
 * Rendering contract of the workspace screen, so production composition and
 * demo fixtures can supply the same panels without the view knowing the source.
 */
export type WorkspaceScreenView = {
  drawer: ReturnType<typeof workspacePageStateCreate>
  files: FilesScreenView
  providerModelSelector: ReturnType<typeof providerModelSelectorStateCreate>
  shell: ReturnType<typeof applicationShellStateCreate>
  selectedSession: SelectedSessionView
  sessionList: ReturnType<typeof sessionListStateCreate>
  sessionTargetSelector: SessionTargetSelectorState
}
