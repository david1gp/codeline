import type { ProjectRegistryState } from "../project/ui/projectRegistryState.js"
import type { providerModelSelectorStateCreate } from "../providers/ui/providerModelSelectorStateCreate.js"
import type { ActiveProjectState } from "../project/ui/activeProjectStateCreate.js"
import type { applicationShellStateCreate } from "./applicationShellStateCreate.js"
import type { FilesScreenView } from "../project/ui/filesScreenView.js"
import type { SelectedSessionView } from "../session/ui/selectedSessionView.js"
import type { sessionListStateCreate } from "../session/ui/sessionListStateCreate.js"
import type { SessionProjectIdOverride } from "../session/ui/sessionProjectIdOverride.js"
import type { SessionProjectPathOverride } from "../session/ui/sessionProjectPathOverride.js"
import type { SessionResourceSelectorView } from "../session/ui/sessionResourceSelectorView.js"
import type { SessionTargetSelectorState } from "../session/ui/sessionTargetSelectorStateCreate.js"
import type { workspacePageStateCreate } from "./workspacePageStateCreate.js"

/**
 * Rendering contract of the workspace screen, so production composition and
 * demo fixtures can supply the same panels without the view knowing the source.
 */
export type WorkspaceScreenView = {
  activeProject: ActiveProjectState
  drawer: ReturnType<typeof workspacePageStateCreate>
  files: FilesScreenView
  newSessionDialogOpen?: () => boolean
  newSessionDialogOpenChange?: (open: boolean) => void
  projectIdOverride?: SessionProjectIdOverride
  projectCreateOpen: () => boolean
  projectCreateOpenChange: (open: boolean) => void
  projectPathOverride: SessionProjectPathOverride
  projectRegistry?: ProjectRegistryState
  providerModelSelector: ReturnType<typeof providerModelSelectorStateCreate>
  selectedSession: SelectedSessionView
  sessionList: ReturnType<typeof sessionListStateCreate>
  sessionResourceSelector: SessionResourceSelectorView
  sessionTargetSelector: SessionTargetSelectorState
  shell: ReturnType<typeof applicationShellStateCreate>
}
