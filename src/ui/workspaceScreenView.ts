import type { ProjectRegistryState } from "../project/ui/projectRegistryState.js"
import type { providerModelSelectorStateCreate } from "../providers/ui/providerModelSelectorStateCreate.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import type { applicationShellStateCreate } from "./applicationShellStateCreate.js"
import type { FilesScreenView } from "./filesScreenView.js"
import type { SelectedSessionView } from "./selectedSessionView.js"
import type { sessionListStateCreate } from "./sessionListStateCreate.js"
import type { SessionProjectIdOverride } from "./sessionProjectIdOverride.js"
import type { SessionProjectPathOverride } from "./sessionProjectPathOverride.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"
import type { workspacePageStateCreate } from "./workspacePageStateCreate.js"

/**
 * Rendering contract of the workspace screen, so production composition and
 * demo fixtures can supply the same panels without the view knowing the source.
 */
export type WorkspaceScreenView = {
  activeProject: ActiveProjectState
  drawer: ReturnType<typeof workspacePageStateCreate>
  files: FilesScreenView
  projectIdOverride?: SessionProjectIdOverride
  projectPathOverride: SessionProjectPathOverride
  projectRegistry?: ProjectRegistryState
  providerModelSelector: ReturnType<typeof providerModelSelectorStateCreate>
  selectedSession: SelectedSessionView
  sessionList: ReturnType<typeof sessionListStateCreate>
  sessionResourceSelector: SessionResourceSelectorView
  sessionTargetSelector: SessionTargetSelectorState
  shell: ReturnType<typeof applicationShellStateCreate>
}
