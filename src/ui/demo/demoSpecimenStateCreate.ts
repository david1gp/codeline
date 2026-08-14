import { demoAppShellStateCreate } from "./demoAppShellStateCreate.js"
import { demoFilesScreenStateCreate } from "./demoFilesScreenStateCreate.js"
import { demoFinalizedMessageStateCreate } from "./demoFinalizedMessageStateCreate.js"
import { demoNewNoteScreenStateCreate } from "./demoNewNoteScreenStateCreate.js"
import { demoNoteScreenStateCreate } from "./demoNoteScreenStateCreate.js"
import { demoNotesScreenStateCreate } from "./demoNotesScreenStateCreate.js"
import { demoNoteWorkspaceScreenStateCreate } from "./demoNoteWorkspaceScreenStateCreate.js"
import { demoProjectBrowserStateCreate } from "./demoProjectBrowserStateCreate.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"
import { demoWorkspaceScreenStateCreate } from "./demoWorkspaceScreenStateCreate.js"

export function demoSpecimenStateCreate(variant: () => DemoSessionScreenVariant) {
  const workspace = demoWorkspaceScreenStateCreate(variant)
  const newNote = demoNewNoteScreenStateCreate(variant)
  const files = demoFilesScreenStateCreate(variant)
  const projectBrowser = demoProjectBrowserStateCreate(variant)

  return {
    files,
    newNote,
    projectBrowser,
    appShell: demoAppShellStateCreate(variant),
    finalizedMessages: demoFinalizedMessageStateCreate(variant),
    note: demoNoteScreenStateCreate(variant),
    notes: demoNotesScreenStateCreate(variant),
    noteWorkspace: demoNoteWorkspaceScreenStateCreate(variant),
    providerModelSelector: workspace.providerModelSelector,
    selectedSession: workspace.selectedSession,
    sessionChat: workspace.selectedSession.chatCreate("demo-session-branch"),
    sessionList: workspace.sessionList,
    sessionTargetSelector: workspace.sessionTargetSelector,
    workspace,
  }
}
