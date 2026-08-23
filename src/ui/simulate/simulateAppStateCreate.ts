import { useLocation, useNavigate } from "@solidjs/router"
import { createMemo } from "solid-js"
import { sessionStreamSnapshotFetch } from "../../run/ui/sessionStreamSnapshotFetch.js"
import { simulationScenarioSessionMetadata } from "../../simulation/simulationScenarioSessionMetadata.js"
import { simulationScenarioSessionResolve } from "../../simulation/simulationScenarioSessionResolve.js"
import type { SessionNavigationState } from "../sessionNavigationStateCreate.js"
import { workspaceScreenStateCreate } from "../workspaceScreenStateCreate.js"
import { simulateInspectorStateCreate } from "./simulateInspectorStateCreate.js"

const simulationScenarios = Object.values(simulationScenarioSessionMetadata)
export function simulateAppStateCreate() {
  const location = useLocation()
  const navigate = useNavigate()
  const scenario = createMemo(() => {
    return simulationScenarioSessionResolve(location.pathname)
  })
  const navigation = {
    clearSession: () => undefined,
    isNewSessionRoute: () => false,
    selectedSessionId: () => scenario().sessionId,
    startNewSession: () => navigate("/sessions/new?tab=recent"),
    selectSession: (sessionId: string) => {
      const selectedScenario = simulationScenarios.find((candidate) => candidate.sessionId === sessionId)
      navigate(selectedScenario?.href ?? `/?session=${encodeURIComponent(sessionId)}`)
    },
  } satisfies SessionNavigationState

  const workspace = workspaceScreenStateCreate(navigation)

  return {
    inspector: simulateInspectorStateCreate({
      chat: () => workspace.selectedSession.chatCreate(scenario().sessionId),
      load: (sessionId, signal) => sessionStreamSnapshotFetch(sessionId, { signal }),
      sessionId: () => scenario().sessionId,
    }),
    scenario,
    scenarios: simulationScenarios,
    workspace,
  }
}
