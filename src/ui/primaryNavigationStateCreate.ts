import { mdiFolderOutline } from "@adaptive-ds/mdi/mdiFolderOutline.js"
import { mdiHistory } from "@adaptive-ds/mdi/mdiHistory.js"
import { mdiNoteTextOutline } from "@adaptive-ds/mdi/mdiNoteTextOutline.js"
import { useLocation } from "@solidjs/router"
import { useContext } from "solid-js"
import { primaryNavigationPathIsActive } from "./primaryNavigationPathIsActive.js"
import { sessionDrawerContext } from "./sessionDrawerContext.js"
import { sessionSidebarDestinationResolve } from "./sessionSidebarDestinationResolve.js"
import { workspacePageStateCreate } from "./workspacePageStateCreate.js"

type PrimaryNavigationActivationEvent = MouseEvent & { currentTarget: HTMLAnchorElement }

export function primaryNavigationStateCreate() {
  const location = useLocation()
  const pathname = () => location.pathname
  const href = () => `${location.pathname}${location.search}${location.hash}`
  const sessionDrawer = useContext(sessionDrawerContext) ?? workspacePageStateCreate()
  const sessionsIsActive = () => primaryNavigationPathIsActive(pathname(), sessionSidebarDestinationResolve(href()))
  const sessionsActivate = (event: PrimaryNavigationActivationEvent) => {
    const handled = sessionDrawer.sessionDrawerOpen(event.currentTarget)
    if (!handled || !sessionsIsActive()) return
    event.preventDefault()
  }

  return {
    settingsIsActive: () => primaryNavigationPathIsActive(pathname(), "/settings"),
    items: [
      {
        activate: sessionsActivate,
        controls: "mobile-session-drawer",
        description: "Resume recent, pinned, project, and searched coding sessions.",
        expanded: sessionDrawer.isSessionDrawerOpen,
        href: () => sessionSidebarDestinationResolve(href()),
        icon: mdiHistory,
        isActive: sessionsIsActive,
        label: "Sessions",
      },
      {
        activate: undefined,
        controls: undefined,
        description: "Browse and inspect files in your connected repositories.",
        expanded: undefined,
        href: () => "/explorer",
        icon: mdiFolderOutline,
        isActive: () => primaryNavigationPathIsActive(pathname(), "/explorer"),
        label: "Explorer",
      },
      {
        activate: undefined,
        controls: undefined,
        description: "Capture and revisit notes alongside your coding work.",
        expanded: undefined,
        href: () => "/notes",
        icon: mdiNoteTextOutline,
        isActive: () => primaryNavigationPathIsActive(pathname(), "/notes"),
        label: "Notes",
      },
    ],
    sessionDrawer,
  }
}
