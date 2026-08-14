import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import type { WorkspaceScreenView } from "../workspaceScreenView.js"
import { workspacePageStateCreate } from "../workspacePageStateCreate.js"
import { demoProviderModelSelectorStateCreate } from "./demoProviderModelSelectorStateCreate.js"
import { demoSelectedSessionStateCreate } from "./demoSelectedSessionStateCreate.js"
import { demoSessionListStateCreate } from "./demoSessionListStateCreate.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"
import { demoSessionTargetSelectorStateCreate } from "./demoSessionTargetSelectorStateCreate.js"

export function demoWorkspaceScreenStateCreate(variant: () => DemoSessionScreenVariant): WorkspaceScreenView {
  const selectedSessionId = createSignalObject<string | null>("demo-session-branch")

  return {
    drawer: workspacePageStateCreate(),
    providerModelSelector: demoProviderModelSelectorStateCreate(variant),
    selectedSession: demoSelectedSessionStateCreate({ selectedSessionId, variant }),
    sessionList: demoSessionListStateCreate({ selectedSessionId, variant }),
    sessionTargetSelector: demoSessionTargetSelectorStateCreate(variant),
  }
}
