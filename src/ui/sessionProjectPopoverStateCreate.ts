import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"
import { sessionProjectSelectorGroupsDerive } from "./sessionProjectSelectorGroupsDerive.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionProjectPopoverStateOptions = {
  idPrefix: () => string
  onNewProject: () => void
  resources: () => SessionResourceSelectorView
}

const optionNavigationKeys = ["ArrowDown", "ArrowUp", "Home", "End"]

function sessionProjectPopoverOptionFocusMove(listbox: HTMLElement, current: HTMLElement | null, key: string): void {
  const options = Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]'))
  if (options.length === 0) return

  const currentIndex = current === null ? -1 : options.indexOf(current)
  let nextIndex = 0
  if (key === "ArrowDown") nextIndex = (currentIndex + 1) % options.length
  if (key === "ArrowUp") nextIndex = (currentIndex - 1 + options.length) % options.length
  if (key === "End") nextIndex = options.length - 1

  options[nextIndex]?.focus()
}

function sessionProjectPopoverListboxResolve(element: EventTarget | null): HTMLElement | null {
  if (!(element instanceof HTMLElement)) return null
  const listbox = element.closest('[role="listbox"]')
  return listbox instanceof HTMLElement ? listbox : null
}

/** Search, selection, keyboard, and focus behavior owned by the dismissing project popover. */
export function sessionProjectPopoverStateCreate(options: SessionProjectPopoverStateOptions) {
  const open = signalObjectCreate(false)
  let newProjectHandoff = false
  let triggerElement: HTMLElement | undefined

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

  return {
    emptyText: (): string => {
      if (resources().projectRegistryStatus() === "loading") return "Loading registered projects…"
      if (resources().projectSearch().trim().length > 0) return "No projects match your search."
      return "No registered projects available."
    },
    isSelected: (projectId: string) => resources().selectedProjectId() === projectId,
    listboxId: () => `${options.idPrefix()}-listbox`,
    newProjectStart: () => {
      newProjectHandoff = true
      openChange(false)
      triggerElement?.focus()
      options.onNewProject()
    },
    open: open.get,
    openChange,
    optionKeyDown: (event: KeyboardEvent) => {
      const listbox = sessionProjectPopoverListboxResolve(event.currentTarget)
      if (listbox === null) return
      if (event.key === " " || event.key === "Enter") return
      if (!optionNavigationKeys.includes(event.key)) return
      event.preventDefault()
      sessionProjectPopoverOptionFocusMove(
        listbox,
        event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
        event.key,
      )
    },
    popoverFinalFocus: (event: Event) => {
      if (!newProjectHandoff) return
      newProjectHandoff = false
      event.preventDefault()
    },
    projectGroups: () => sessionProjectSelectorGroupsDerive(resources().projectOptions(), resources().projects()),
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
      sessionProjectPopoverOptionFocusMove(listbox, null, "ArrowDown")
    },
    searchRef: (element: HTMLInputElement) => {
      queueMicrotask(() => element.focus())
    },
    triggerElement: () => triggerElement,
    triggerRef: (element: HTMLElement) => {
      triggerElement = element
    },
    triggerLabel: (): string => {
      const projectId = resources().selectedProjectId()
      if (projectId === null || projectId === "") return "Select a project…"
      return projectLabel(projectId)
    },
  }
}
