import { useLocation, useNavigate } from "@solidjs/router"
import { onCleanup, onMount, useContext } from "solid-js"
import { urlNotes } from "../note/note_url/urlNote.js"
import { sessionDrawerContext } from "../session/ui/sessionDrawerContext.js"
import { sessionSidebarDestinationResolve } from "../session/ui/sessionSidebarDestinationResolve.js"
import { applicationIcon } from "./applicationIcon.js"
import type { CommandIntent } from "./commandIntent.js"
import { commandIntentConsume } from "./commandIntentConsume.js"
import { commandShortcutMatch } from "./commandShortcutMatch.js"
import { pageRouteFiles } from "./files_url/pageRouteFiles.js"
import { urlFiles } from "./files_url/urlFiles.js"
import { primaryNavigationPathIsActive } from "./primaryNavigationPathIsActive.js"
import { primaryNavigationProjectCreateStateCreate } from "./primaryNavigationProjectCreateStateCreate.js"
import { pageRouteSettings } from "./settings_url/pageRouteSettings.js"
import { signalObjectCreate } from "./signalObjectCreate.js"
import { urlSessions } from "./workspace_url/urlWorkspace.js"
import { workspacePageStateCreate } from "./workspacePageStateCreate.js"

type PrimaryNavigationActivationEvent = MouseEvent & { currentTarget: HTMLAnchorElement }

export function primaryNavigationStateCreate() {
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = () => location.pathname
  const href = () => `${location.pathname}${location.search}${location.hash}`
  const sessionDrawer = useContext(sessionDrawerContext) ?? workspacePageStateCreate()
  const workspaceActions = signalObjectCreate<WorkspaceNavigationActions | undefined>(undefined)
  const pendingCommandIntent = signalObjectCreate<CommandIntent | null>(null)
  const projectCreate = primaryNavigationProjectCreateStateCreate()
  const commandDispatch = (intent: CommandIntent) => {
    if (intent.kind === "new-project") {
      projectCreate.open()
      return
    }
    const actions = workspaceActions.get()
    if (actions !== undefined) {
      commandIntentConsume(intent, actions)
      return
    }
    pendingCommandIntent.set(intent)
    navigate(urlSessions(), { scroll: false })
  }
  onMount(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!commandShortcutMatch(event)) return
      event.preventDefault()
      commandDispatch({ kind: "new-session" })
    }
    window.addEventListener("keydown", keydown)
    onCleanup(() => window.removeEventListener("keydown", keydown))
  })
  const sessionsIsActive = () => primaryNavigationPathIsActive(pathname(), sessionSidebarDestinationResolve(href()))
  const sessionsActivate = (event: PrimaryNavigationActivationEvent) => {
    const handled = sessionDrawer.sessionDrawerOpen(event.currentTarget)
    if (!handled || !sessionsIsActive()) return
    event.preventDefault()
  }

  return {
    settingsIsActive: () => primaryNavigationPathIsActive(pathname(), pageRouteSettings.settings),
    commandDispatch,
    projectCreateDialogOpen: projectCreate.dialogOpen,
    projectCreateDialogOpenChange: projectCreate.dialogOpenChange,
    workspaceActions: {
      folderCreateOpen: () => workspaceActions.get()?.folderCreateOpen(),
      isAvailable: () => workspaceActions.get() !== undefined,
      projectCreateOpen: projectCreate.open,
      sessionInProject: (projectId: string) => commandDispatch({ kind: "new-session-project", projectId }),
      register: (actions: WorkspaceNavigationActions) => {
        workspaceActions.set(actions)
        const intent = pendingCommandIntent.get()
        pendingCommandIntent.set(commandIntentConsume(intent, actions))
        return () => {
          if (workspaceActions.get() === actions) workspaceActions.set(undefined)
        }
      },
      sessionNew: () => commandDispatch({ kind: "new-session" }),
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
  sessionNew: (projectId?: string) => void
}
