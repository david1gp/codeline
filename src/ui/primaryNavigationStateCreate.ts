import { useLocation } from "@solidjs/router"
import { useContext } from "solid-js"
import { urlNotes } from "../note/note_url/urlNote.js"
import { applicationIcon } from "./applicationIcon.js"
import { pageRouteFiles } from "./files_url/pageRouteFiles.js"
import { urlFiles } from "./files_url/urlFiles.js"
import { primaryNavigationPathIsActive } from "./primaryNavigationPathIsActive.js"
import { sessionDrawerContext } from "./sessionDrawerContext.js"
import { sessionSidebarDestinationResolve } from "./sessionSidebarDestinationResolve.js"
import { pageRouteSettings } from "./settings_url/pageRouteSettings.js"
import { signalObjectCreate } from "./signalObjectCreate.js"
import { workspacePageStateCreate } from "./workspacePageStateCreate.js"

type PrimaryNavigationActivationEvent = MouseEvent & { currentTarget: HTMLAnchorElement }

export function primaryNavigationStateCreate() {
  const location = useLocation()
  const pathname = () => location.pathname
  const href = () => `${location.pathname}${location.search}${location.hash}`
  const sessionDrawer = useContext(sessionDrawerContext) ?? workspacePageStateCreate()
  const workspaceActions = signalObjectCreate<WorkspaceNavigationActions | undefined>(undefined)
  const sessionsIsActive = () => primaryNavigationPathIsActive(pathname(), sessionSidebarDestinationResolve(href()))
  const sessionsActivate = (event: PrimaryNavigationActivationEvent) => {
    const handled = sessionDrawer.sessionDrawerOpen(event.currentTarget)
    if (!handled || !sessionsIsActive()) return
    event.preventDefault()
  }

  return {
    settingsIsActive: () => primaryNavigationPathIsActive(pathname(), pageRouteSettings.settings),
    workspaceActions: {
      folderCreateOpen: () => workspaceActions.get()?.folderCreateOpen(),
      isAvailable: () => workspaceActions.get() !== undefined,
      projectCreateOpen: () => workspaceActions.get()?.projectCreateOpen(),
      register: (actions: WorkspaceNavigationActions) => {
        workspaceActions.set(actions)
        return () => {
          if (workspaceActions.get() === actions) workspaceActions.set(undefined)
        }
      },
      sessionNew: () => workspaceActions.get()?.sessionNew(),
    },
    items: [
      {
        activate: sessionsActivate,
        controls: "mobile-session-drawer",
        description: "Resume recent, pinned, project, and searched coding sessions.",
        expanded: sessionDrawer.isSessionDrawerOpen,
        href: () => sessionSidebarDestinationResolve(href()),
        icon: applicationIcon.history,
        isActive: sessionsIsActive,
        label: "Sessions",
      },
      {
        activate: undefined,
        controls: undefined,
        description: "Browse and inspect files in your connected repositories.",
        expanded: undefined,
        href: urlFiles,
        icon: applicationIcon.folder,
        isActive: () => primaryNavigationPathIsActive(pathname(), pageRouteFiles.files),
        label: "Explorer",
      },
      {
        activate: undefined,
        controls: undefined,
        description: "Capture and revisit notes alongside your coding work.",
        expanded: undefined,
        href: urlNotes,
        icon: applicationIcon.note,
        isActive: () => primaryNavigationPathIsActive(pathname(), urlNotes()),
        label: "Notes",
      },
    ],
    sessionDrawer,
  }
}

type WorkspaceNavigationActions = {
  folderCreateOpen: () => void
  projectCreateOpen: () => void
  sessionNew: () => void
}
