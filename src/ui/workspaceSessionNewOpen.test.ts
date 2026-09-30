import { expect, test } from "bun:test"
import { signalObjectCreate } from "./signalObjectCreate.js"
import { workspaceSessionNewOpen } from "./workspaceSessionNewOpen.js"

function stateCreate() {
  return {
    newSessionDialogOpen: signalObjectCreate(false),
    pendingProjectTarget: signalObjectCreate<{ kind: "registered"; projectId: string } | null>({
      kind: "registered",
      projectId: "project-previous",
    }),
    projectIdOverride: signalObjectCreate<string | null>("project-previous"),
    projectPathOverride: signalObjectCreate<string | null>("/previous"),
  }
}

test("ordinary new session clears the prior project target before opening the dialog", () => {
  const state = stateCreate()

  workspaceSessionNewOpen(undefined, state)

  expect(state.pendingProjectTarget.get()).toBeNull()
  expect(state.projectIdOverride.get()).toBeNull()
  expect(state.projectPathOverride.get()).toBeNull()
  expect(state.newSessionDialogOpen.get()).toBe(true)
})

test("project-targeted new session retains its explicit project through dialog opening", () => {
  const state = stateCreate()

  workspaceSessionNewOpen("project-requested", state)

  expect(state.pendingProjectTarget.get()).toBeNull()
  expect(state.projectIdOverride.get()).toBe("project-requested")
  expect(state.projectPathOverride.get()).toBeNull()
  expect(state.newSessionDialogOpen.get()).toBe(true)
})
