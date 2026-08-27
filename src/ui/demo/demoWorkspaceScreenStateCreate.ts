import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { activeProjectStateCreate } from "../activeProjectStateCreate.js"
import { applicationShellStateCreate } from "../applicationShellStateCreate.js"
import { workspacePageStateCreate } from "../workspacePageStateCreate.js"
import type { WorkspaceScreenView } from "../workspaceScreenView.js"
import { demoFilesScreenStateCreate } from "./demoFilesScreenStateCreate.js"
import { demoProviderModelSelectorStateCreate } from "./demoProviderModelSelectorStateCreate.js"
import { demoSelectedSessionStateCreate } from "./demoSelectedSessionStateCreate.js"
import { demoSessionListStateCreate } from "./demoSessionListStateCreate.js"
import { demoSessionResourceSelectorStateCreate } from "./demoSessionResourceSelectorStateCreate.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"
import { demoSessionTargetSelectorStateCreate } from "./demoSessionTargetSelectorStateCreate.js"

export function demoWorkspaceScreenStateCreate(variant: () => DemoSessionScreenVariant): WorkspaceScreenView {
  const selectedSessionId = createSignalObject<string | null>(null)
  const shell = applicationShellStateCreate()

  return {
    activeProject: activeProjectStateCreate(),
    drawer: workspacePageStateCreate(),
    files: demoFilesScreenStateCreate(variant),
    providerModelSelector: demoProviderModelSelectorStateCreate(variant),
    shell,
    selectedSession: demoSelectedSessionStateCreate({
      rightPanelClose: shell.rightPanelClose,
      rightPanelShow: shell.rightPanelShow,
      selectedSessionId,
      variant,
    }),
    sessionList: demoSessionListStateCreate({ selectedSessionId, variant }),
    sessionResourceSelector: demoSessionResourceSelectorStateCreate(variant),
    sessionTargetSelector: demoSessionTargetSelectorStateCreate(variant, selectedSessionId),
  }
}
