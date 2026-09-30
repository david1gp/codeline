import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import { signalObjectCreate } from "../../ui/signalObjectCreate.js"
import { newSessionDialogStateCreate } from "./newSessionDialogStateCreate.js"

test("new session dialog keeps a requested project selected when it opens", () => {
  const root = createRoot((dispose) => {
    const [open, setOpen] = createSignal(false)
    const projectIdOverride = signalObjectCreate<string | null>("project-requested")
    const projectPathOverride = signalObjectCreate<string | null>(null)
    const state = newSessionDialogStateCreate({
      activeProject: {
        project: () => ({ id: "project-active", label: "Active", path: "/active" }),
      } as never,
      open,
      projectIdOverride,
      projectPathOverride,
      projectRegistry: {
        projects: () => [
          { id: "project-active", label: "Active", path: "/active", available: true },
          { id: "project-requested", label: "Requested", path: "/requested", available: true },
        ],
      } as never,
      sessionTarget: {} as never,
    })
    return { dispose, setOpen, state }
  })

  root.setOpen(true)
  expect(root.state.selectedProjectId()).toBe("project-requested")
  root.dispose()
})
