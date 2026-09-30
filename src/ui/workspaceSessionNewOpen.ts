import { batch } from "solid-js"
import type { SessionProjectTarget } from "../session/ui/sessionProjectTarget.js"

type WorkspaceSessionNewOpenState = {
  newSessionDialogOpen: { set: (open: boolean) => void }
  pendingProjectTarget: { set: (target: SessionProjectTarget | null) => void }
  projectIdOverride: { set: (projectId: string | null) => void }
  projectPathOverride: { set: (projectPath: string | null) => void }
}

export function workspaceSessionNewOpen(projectId: string | undefined, state: WorkspaceSessionNewOpenState): void {
  batch(() => {
    state.pendingProjectTarget.set(null)
    state.projectIdOverride.set(projectId ?? null)
    state.projectPathOverride.set(null)
    state.newSessionDialogOpen.set(true)
  })
}
