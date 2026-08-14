import { providerModelSelectorStateCreate } from "../providers/ui/providerModelSelectorStateCreate.js"
import { selectedSessionStateCreate } from "./selectedSessionStateCreate.js"
import { sessionListStateCreate } from "./sessionListStateCreate.js"
import { type SessionNavigationState, sessionNavigationStateCreate } from "./sessionNavigationStateCreate.js"
import { sessionTargetSelectorStateCreate } from "./sessionTargetSelectorStateCreate.js"
import { workspacePageStateCreate } from "./workspacePageStateCreate.js"
import type { WorkspaceScreenView } from "./workspaceScreenView.js"

export function workspaceScreenStateCreate(
  navigation: SessionNavigationState = sessionNavigationStateCreate(),
): WorkspaceScreenView {
  const providerModelSelector = providerModelSelectorStateCreate({ sessionId: navigation.selectedSessionId })

  return {
    drawer: workspacePageStateCreate(),
    providerModelSelector,
    selectedSession: selectedSessionStateCreate({
      codelineExecution: providerModelSelector.codelineExecution,
      navigation: () => navigation,
    }),
    sessionList: sessionListStateCreate(() => navigation),
    sessionTargetSelector: sessionTargetSelectorStateCreate({
      selectedSessionId: navigation.selectedSessionId,
      sessionSelect: navigation.selectSession,
    }),
  }
}
