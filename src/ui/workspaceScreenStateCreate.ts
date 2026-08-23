import { onCleanup, useContext } from "solid-js"
import { providerModelSelectorStateCreate } from "../providers/ui/providerModelSelectorStateCreate.js"
import { activeProjectStateCreate } from "./activeProjectStateCreate.js"
import { applicationShellContext } from "./applicationShellContext.js"
import { applicationShellStateCreate } from "./applicationShellStateCreate.js"
import { appShellContext } from "./appShellContext.js"
import { filesScreenViewCreate } from "./filesScreenViewCreate.js"
import { selectedSessionStateCreate } from "./selectedSessionStateCreate.js"
import { sessionDrawerContext } from "./sessionDrawerContext.js"
import { sessionListStateCreate } from "./sessionListStateCreate.js"
import { type SessionNavigationState, sessionNavigationStateCreate } from "./sessionNavigationStateCreate.js"
import type { SessionSidebarRouteState } from "./sessionSidebarRouteStateCreate.js"
import { sessionTargetSelectorStateCreate } from "./sessionTargetSelectorStateCreate.js"
import { workspacePageStateCreate } from "./workspacePageStateCreate.js"
import type { WorkspaceScreenView } from "./workspaceScreenView.js"

type WorkspaceScreenStateOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function workspaceScreenStateCreate(
  navigation: SessionNavigationState = sessionNavigationStateCreate(),
  sidebarRoute?: SessionSidebarRouteState,
  options: WorkspaceScreenStateOptions = {},
): WorkspaceScreenView {
  const shell = useContext(applicationShellContext) ?? applicationShellStateCreate()
  const activeProject = useContext(appShellContext)?.activeProject ?? activeProjectStateCreate()
  const drawer = useContext(sessionDrawerContext) ?? workspacePageStateCreate()
  const sessionTargetSelector = sessionTargetSelectorStateCreate({
    activeProjectPath: () => activeProject.project().path,
    isNewSessionRoute: navigation.isNewSessionRoute,
    selectedSessionId: navigation.selectedSessionId,
    sessionNew: navigation.startNewSession,
    sessionSelect: navigation.selectSession,
  })
  const providerModelSelector = providerModelSelectorStateCreate({
    agentId: sessionTargetSelector.selectedAgentId,
    sessionId: navigation.selectedSessionId,
  })
  shell.rightPanelEnable()
  onCleanup(shell.rightPanelDisable)
  onCleanup(drawer.sessionDrawerClose)

  return {
    activeProject,
    drawer,
    files: filesScreenViewCreate(),
    shell,
    providerModelSelector,
    selectedSession: selectedSessionStateCreate({
      codelineExecution: providerModelSelector.codelineExecution,
      navigation: () => navigation,
      rightPanelClose: shell.rightPanelClose,
      rightPanelShow: shell.rightPanelShow,
      sessionCreateErrorMessage: sessionTargetSelector.sessionCreateErrorMessage,
      sessionCreateStart: sessionTargetSelector.sessionCreateStart,
      sessionTargetAvailable: sessionTargetSelector.canCreateSession,
    }),
    sessionList: sessionListStateCreate(() => navigation, sidebarRoute, { fetcher: options.fetcher }),
    sessionTargetSelector,
  }
}
