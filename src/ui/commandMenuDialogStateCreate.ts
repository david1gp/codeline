import { useNavigate } from "@solidjs/router"
import { onCleanup, onMount } from "solid-js"
import type { ProjectRegistryState } from "../project/ui/projectRegistryState.js"
import { commandMenuActionDispatch } from "./commandMenuActionDispatch.js"
import type { CommandMenuItem } from "./commandMenuItem.js"
import { commandMenuStateCreate } from "./commandMenuStateCreate.js"
import type { primaryNavigationStateCreate } from "./primaryNavigationStateCreate.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

export function commandMenuDialogStateCreate(
  navigation: ReturnType<typeof primaryNavigationStateCreate>,
  projectRegistry: ProjectRegistryState,
) {
  const navigate = useNavigate()
  const open = signalObjectCreate(false)
  const restoreFocus = signalObjectCreate(true)
  const searchInput = signalObjectCreate<HTMLInputElement | null>(null)
  const menu = commandMenuStateCreate({ projectRegistry })

  const openChange = (next: boolean) => {
    if (next) restoreFocus.set(true)
    open.set(next)
    if (!next) menu.querySet("")
  }

  const itemSelect = (item: CommandMenuItem) => {
    // Corvu restores the palette's previous focus after paint. That would focus
    // outside the dialog opened by this selection and dismiss it immediately.
    if (item.kind === "action" || item.kind === "project") restoreFocus.set(false)
    openChange(false)
    if (item.kind === "action") {
      commandMenuActionDispatch(item.intent, navigation.commandDispatch)
      return
    }
    if (item.kind === "project") {
      navigation.workspaceActions.sessionInProject(item.projectId)
      return
    }
    navigate(item.href)
  }

  onMount(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") return
      if (event.isComposing || event.keyCode === 229) return
      event.preventDefault()
      if (!event.repeat) openChange(true)
    }
    window.addEventListener("keydown", keydown)
    onCleanup(() => window.removeEventListener("keydown", keydown))
  })

  return {
    ...menu,
    open: open.get,
    openChange,
    restoreFocus: restoreFocus.get,
    itemSelect,
    searchInput: searchInput.get,
    searchInputSet: searchInput.set,
  }
}
