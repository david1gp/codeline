import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { applicationShellStateCreate } from "../applicationShellStateCreate.js"
import { workspacePageStateCreate } from "../workspacePageStateCreate.js"
import type { WorkspaceScreenView } from "../workspaceScreenView.js"
import { demoProviderModelSelectorStateCreate } from "./demoProviderModelSelectorStateCreate.js"
import { demoFilesScreenStateCreate } from "./demoFilesScreenStateCreate.js"
import { demoSelectedSessionStateCreate } from "./demoSelectedSessionStateCreate.js"
import { demoSessionListStateCreate } from "./demoSessionListStateCreate.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"
import { demoSessionTargetSelectorStateCreate } from "./demoSessionTargetSelectorStateCreate.js"
import { activeProjectStateCreate } from "../activeProjectStateCreate.js"

export function demoWorkspaceScreenStateCreate(variant: () => DemoSessionScreenVariant): WorkspaceScreenView {
  const selectedSessionId = createSignalObject<string | null>(null)

  return {
    activeProject: activeProjectStateCreate(),
    drawer: workspacePageStateCreate(),
    files: demoFilesScreenStateCreate(variant),
    providerModelSelector: demoProviderModelSelectorStateCreate(variant),
    shell: applicationShellStateCreate(),
    selectedSession: demoSelectedSessionStateCreate({ selectedSessionId, variant }),
    sessionList: demoSessionListStateCreate({ selectedSessionId, variant }),
    sessionTargetSelector: demoSessionTargetSelectorStateCreate(variant),
  }
}
