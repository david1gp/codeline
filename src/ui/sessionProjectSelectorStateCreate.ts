import { createEffect, useContext } from "solid-js"
import type { SelectSingleEntry } from "#ui/input/select/SelectSingleEntry.js"
import type { ProjectRegistryApiProject } from "../project/api/projectRegistryApiProjectSchema.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { activeProjectStateCreate } from "./activeProjectStateCreate.js"
import { appShellContext } from "./appShellContext.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionProjectSelectorStateOptions = {
  activeProject?: () => ActiveProjectState | undefined
  idPrefix: () => string
  resources: () => SessionResourceSelectorView
}

const optionNavigationKeys = ["ArrowDown", "ArrowUp", "Home", "End"]

/** Moves focus between the rendered options, so the popover list stays keyboard operable. */
function sessionProjectSelectorOptionFocusMove(listbox: HTMLElement, current: HTMLElement | null, key: string): void {
  const options = Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]'))
  if (options.length === 0) return

  const currentIndex = current === null ? -1 : options.indexOf(current)
  let nextIndex = 0
  if (key === "ArrowDown") nextIndex = (currentIndex + 1) % options.length
  if (key === "ArrowUp") nextIndex = (currentIndex - 1 + options.length) % options.length
  if (key === "End") nextIndex = options.length - 1

  options[nextIndex]?.focus()
}

function sessionProjectSelectorListboxResolve(element: EventTarget | null): HTMLElement | null {
  if (!(element instanceof HTMLElement)) return null
  const listbox = element.closest('[role="listbox"]')
  return listbox instanceof HTMLElement ? listbox : null
}

/**
 * Component-local glue of the searchable project selector, so the view only renders
 * options while search, popover state, and the new-project hand-off stay testable.
 */
export function sessionProjectSelectorStateCreate(options: SessionProjectSelectorStateOptions) {
  const appShell = useContext(appShellContext)
  const fallbackActiveProject = activeProjectStateCreate()
  const open = signalObjectCreate(false)
  const newProjectOpen = signalObjectCreate(false)
  // A confirmed project only becomes selectable once the shared registry lists it.
  const pendingProjectId = signalObjectCreate<string | null>(null)

  const resources = () => options.resources()

  const projectLabel = (projectId: string): string =>
    resources()
      .projects()
      .find((project) => project.id === projectId)?.label ?? projectId

  const searchChange = (value: string) => {
    resources().projectSearchChange(value)
  }

  const openChange = (nextOpen: boolean) => {
    open.set(nextOpen)
    if (nextOpen) return
    searchChange("")
  }

  const projectSelect = (projectId: string) => {
    resources().projectSelect(projectId)
    openChange(false)
  }

  createEffect(() => {
    const projectId = pendingProjectId.get()
    if (projectId === null) return
    if (
      !resources()
        .projects()
        .some((project) => project.id === projectId)
    )
      return
    pendingProjectId.set(null)
    resources().projectSelect(projectId)
  })

  return {
    emptyText: (): string => {
      if (resources().projectRegistryStatus() === "loading") return "Loading registered projects…"
      if (resources().projectSearch().trim().length > 0) return "No projects match your search."
      return "No registered projects available."
    },
    isSelected: (projectId: string) => resources().selectedProjectId() === projectId,
    listboxId: () => `${options.idPrefix()}-listbox`,
    newProjectConfirmed: (_projectPath: string, project?: ProjectRegistryApiProject) => {
      newProjectOpen.set(false)
      if (project === undefined) return
      pendingProjectId.set(project.id)
    },
    newProjectOpen: newProjectOpen.get,
    newProjectOpenChange: (nextOpen: boolean) => newProjectOpen.set(nextOpen),
    /** Closes the popover first, so the dialog owns focus while it is open. */
    newProjectStart: () => {
      openChange(false)
      setTimeout(() => newProjectOpen.set(true), 0)
    },
    open: open.get,
    openChange,
    optionKeyDown: (event: KeyboardEvent) => {
      const listbox = sessionProjectSelectorListboxResolve(event.currentTarget)
      if (listbox === null) return
      if (event.key === " " || event.key === "Enter") return
      if (!optionNavigationKeys.includes(event.key)) return
      event.preventDefault()
      sessionProjectSelectorOptionFocusMove(
        listbox,
        event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
        event.key,
      )
    },
    activeProject: (): ActiveProjectState =>
      options.activeProject?.() ?? appShell?.activeProject ?? fallbackActiveProject,
    projectLabel,
    projectOptions: (): SelectSingleEntry[] => resources().projectOptions(),
    projectSelect,
    search: () => resources().projectSearch(),
    searchId: () => `${options.idPrefix()}-search`,
    searchInput: (event: InputEvent & { currentTarget: HTMLInputElement }) => searchChange(event.currentTarget.value),
    searchKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown") return
      const root = event.currentTarget instanceof HTMLElement ? event.currentTarget.parentElement : null
      const listbox = root?.querySelector('[role="listbox"]') ?? null
      if (!(listbox instanceof HTMLElement)) return
      event.preventDefault()
      sessionProjectSelectorOptionFocusMove(listbox, null, "ArrowDown")
    },
    searchRef: (element: HTMLInputElement) => {
      queueMicrotask(() => element.focus())
    },
    triggerLabel: (): string => {
      const projectId = resources().selectedProjectId()
      if (projectId === null || projectId === "") return "Select a project…"
      return projectLabel(projectId)
    },
  }
}

export type SessionProjectSelectorState = ReturnType<typeof sessionProjectSelectorStateCreate>
