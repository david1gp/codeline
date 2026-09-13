import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"
import { sessionProjectPickerItemsDerive } from "./sessionProjectPickerItemsDerive.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionProjectPopoverStateOptions = {
  onNewProject: () => void
  resources: () => SessionResourceSelectorView
}

/** Owns the trigger, dismissing popover, and new-project focus handoff around the shared picker. */
export function sessionProjectPopoverStateCreate(options: SessionProjectPopoverStateOptions) {
  const open = signalObjectCreate(false)
  let newProjectHandoff = false
  let triggerElement: HTMLElement | undefined

  const resources = () => options.resources()
  const projectLabel = (projectId: string): string =>
    resources()
      .projects()
      .find((project) => project.id === projectId)?.label ?? projectId

  const openChange = (nextOpen: boolean) => {
    open.set(nextOpen)
    if (nextOpen) return
    resources().projectSearchChange("")
  }

  const projectSelect = (projectId: string) => {
    resources().projectSelect(projectId)
    openChange(false)
  }

  return {
    emptyText: (): string => {
      if (resources().projectRegistryStatus() === "loading") return "Loading registered projects…"
      if (resources().projects().length > 0) return "No projects match your search."
      return "No registered projects available."
    },
    newProjectStart: () => {
      newProjectHandoff = true
      openChange(false)
      triggerElement?.focus()
      options.onNewProject()
    },
    open: open.get,
    openChange,
    popoverFinalFocus: (event: Event) => {
      if (!newProjectHandoff) return
      newProjectHandoff = false
      event.preventDefault()
    },
    projectItems: () => sessionProjectPickerItemsDerive(resources().projects()),
    projectSelect,
    selectedProjectId: resources().selectedProjectId,
    triggerElement: () => triggerElement,
    triggerLabel: (): string => {
      const projectId = resources().selectedProjectId()
      if (projectId === null || projectId === "") return "Select a project…"
      return projectLabel(projectId)
    },
    triggerRef: (element: HTMLElement) => {
      triggerElement = element
    },
  }
}
