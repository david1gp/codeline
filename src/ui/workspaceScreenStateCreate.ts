import { providerModelSelectorStateCreate } from "../providers/ui/providerModelSelectorStateCreate.js"
import { onCleanup, useContext } from "solid-js"
import { applicationShellContext } from "./applicationShellContext.js"
import { applicationShellStateCreate } from "./applicationShellStateCreate.js"
import { filesScreenViewCreate } from "./filesScreenViewCreate.js"
import { selectedSessionStateCreate } from "./selectedSessionStateCreate.js"
import { sessionListStateCreate } from "./sessionListStateCreate.js"
import { type SessionNavigationState, sessionNavigationStateCreate } from "./sessionNavigationStateCreate.js"
import { sessionTargetSelectorStateCreate } from "./sessionTargetSelectorStateCreate.js"
import { workspacePageStateCreate } from "./workspacePageStateCreate.js"
import type { WorkspaceScreenView } from "./workspaceScreenView.js"

export function workspaceScreenStateCreate(
  navigation: SessionNavigationState = sessionNavigationStateCreate(),
): WorkspaceScreenView {
  const shell = useContext(applicationShellContext) ?? applicationShellStateCreate()
  const sessionTargetSelector = sessionTargetSelectorStateCreate({
    selectedSessionId: navigation.selectedSessionId,
    sessionSelect: navigation.selectSession,
  })
  const providerModelSelector = providerModelSelectorStateCreate({
    agentId: sessionTargetSelector.selectedAgentId,
    sessionId: navigation.selectedSessionId,
  })
  shell.rightPanelEnable()
  onCleanup(shell.rightPanelDisable)

  return {
    drawer: workspacePageStateCreate(),
    files: filesScreenViewCreate(),
    shell,
    providerModelSelector,
    selectedSession: selectedSessionStateCreate({
      codelineExecution: providerModelSelector.codelineExecution,
      navigation: () => navigation,
      sessionCreateErrorMessage: sessionTargetSelector.sessionCreateErrorMessage,
      sessionCreateStart: sessionTargetSelector.sessionCreateStart,
      sessionTargetAvailable: sessionTargetSelector.canCreateSession,
    }),
    sessionList: sessionListStateCreate(() => navigation),
    sessionTargetSelector,
  }
}
