import { onCleanup, useContext } from "solid-js"
import { projectRegistryStateCreate } from "../project/ui/projectRegistryStateCreate.js"
import { providerModelSelectorStateCreate } from "../providers/ui/providerModelSelectorStateCreate.js"
import { activeProjectStateCreate } from "./activeProjectStateCreate.js"
import { applicationAccountContext } from "./applicationAccountContext.js"
import { applicationShellContext } from "./applicationShellContext.js"
import { applicationShellStateCreate } from "./applicationShellStateCreate.js"
import { appShellContext } from "./appShellContext.js"
import { chatCommandCatalogStateCreate } from "./chatCommandCatalogStateCreate.js"
import { filesScreenViewCreate } from "./filesScreenViewCreate.js"
import { eventFeedCoordinatorContext } from "./eventFeedCoordinatorContext.js"
import { selectedSessionStateCreate } from "./selectedSessionStateCreate.js"
import { sessionDrawerContext } from "./sessionDrawerContext.js"
import { sessionListStateCreate } from "./sessionListStateCreate.js"
import { type SessionNavigationState, sessionNavigationStateCreate } from "./sessionNavigationStateCreate.js"
import type { SessionProjectIdOverride } from "./sessionProjectIdOverride.js"
import { sessionResourceSelectorStateCreate } from "./sessionResourceSelectorStateCreate.js"
import type { SessionProjectPathOverride } from "./sessionProjectPathOverride.js"
import type { SessionSidebarRouteState } from "./sessionSidebarRouteStateCreate.js"
import { sessionTargetSelectorStateCreate } from "./sessionTargetSelectorStateCreate.js"
import { signalObjectCreate } from "./signalObjectCreate.js"
import { workspacePageStateCreate } from "./workspacePageStateCreate.js"
import type { WorkspaceScreenView } from "./workspaceScreenView.js"

type WorkspaceScreenStateOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function workspaceScreenStateCreate(
  navigation: SessionNavigationState = sessionNavigationStateCreate(),
  sidebarRoute?: SessionSidebarRouteState,
  options: WorkspaceScreenStateOptions = {},
): WorkspaceScreenView {
  const shell = useContext(applicationShellContext) ?? applicationShellStateCreate()
  const appShell = useContext(appShellContext)
  const eventFeed = useContext(eventFeedCoordinatorContext)
  const activeProject = appShell?.activeProject ?? activeProjectStateCreate()
  const drawer = useContext(sessionDrawerContext) ?? workspacePageStateCreate()
  const account = useContext(applicationAccountContext)
  const pwa = appShell?.pwa
  const projectRegistry =
    appShell?.projectRegistry ??
    projectRegistryStateCreate({
      accountId: () => account?.userId() ?? null,
      fetch: options.fetcher,
    })
  const unregisterProjectRegistryEventFeed = eventFeed?.registerRunLifecycle(() => projectRegistry.refresh())
  if (unregisterProjectRegistryEventFeed !== undefined) onCleanup(unregisterProjectRegistryEventFeed)
  // `~` is a valid session reference, but it is not necessarily a project in the
  // configured discovery roots. Path-based project reads must wait for a confirmed path.
  const discoveredProjectPathResolve = (path: string | null) => (path === "~" ? null : path)
  const projectPathOverrideState = signalObjectCreate<string | null>(null)
  const projectPathOverride: SessionProjectPathOverride = {
    get: projectPathOverrideState.get,
    set: (value) => projectPathOverrideState.set(value),
  }
  const projectIdOverrideState = signalObjectCreate<string | null>(null)
  const projectIdOverride: SessionProjectIdOverride = {
    get: projectIdOverrideState.get,
    set: (value) => projectIdOverrideState.set(value),
  }
  // The dialog owns the pending project choice through this shared signal. Every
  // pre-session consumer must derive from it so inspection/context reads and the
  // create request cannot silently use different projects.
  const pendingSessionProjectId = () => projectIdOverride.get() ?? activeProject.project().id ?? null
  const pendingSessionProjectPath = () =>
    pendingSessionProjectId() === null ? (projectPathOverride.get() ?? activeProject.project().path) : null
  const pendingSessionInspectionProjectPath = () => discoveredProjectPathResolve(pendingSessionProjectPath())
  // The target selector consumes the pending resource selection, and the resource
  // selector consumes the selected target. Both sides read through accessors, so the
  // target selector is referenced lazily instead of creating a construction cycle.
  let sessionTargetSelector: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const sessionResourceSelector = sessionResourceSelectorStateCreate({
    isOnline: () => pwa?.status() !== "offline",
    projectId: pendingSessionProjectId,
    projectPath: () => (navigation.selectedSessionId() === null ? pendingSessionInspectionProjectPath() : null),
    selectedAgentId: () => sessionTargetSelector?.selectedAgentId() ?? null,
    selectedServerId: () => sessionTargetSelector?.selectedServerId() ?? null,
    selectedSessionId: navigation.selectedSessionId,
  })
  sessionTargetSelector = sessionTargetSelectorStateCreate({
    accountId: () => account?.userId() ?? null,
    activeProjectId: pendingSessionProjectId,
    activeProjectPath: pendingSessionProjectPath,
    isOnline: () => pwa?.status() !== "offline",
    isNewSessionRoute: navigation.isNewSessionRoute,
    pendingAgentPrompt: sessionResourceSelector.agentPrompt,
    pendingExecutionSelection: sessionResourceSelector.pendingExecutionSelection,
    pendingInstructionOverrides: sessionResourceSelector.instructionOverrides,
    pendingSkillSelection: sessionResourceSelector.pendingSkillSelection,
    selectedSessionId: navigation.selectedSessionId,
    sessionNew: navigation.startNewSession,
    sessionSelect: navigation.selectSession,
  })
  // The composer's slash-command catalog is project-scoped and shared by the
  // pre-session and existing-session composers, so one discovery read backs both.
  // An open session is scoped to the project it was created in, not to whichever
  // project the sidebar currently highlights, because that is the project whose
  // commands the server will expand for it. Only the pre-session composer follows
  // the active project, which is the project its session would be created in.
  // Interpolation availability follows the primary agent's effective bash tool.
  // The catalog and the selected-session state are mutually dependent, so the
  // session's project is read lazily instead of creating a construction cycle.
  let selectedSessionProjectPath: () => string | null = () => null
  const commandCatalog = chatCommandCatalogStateCreate({
    ...(options.fetcher === undefined ? {} : { fetch: options.fetcher }),
    isBashEnabled: () => sessionResourceSelector.agentTools().some((entry) => entry.isPrimary && entry.bash),
    isOnline: () => pwa?.status() !== "offline",
    projectId: () => (navigation.selectedSessionId() === null ? pendingSessionProjectId() : null),
    projectPath: () =>
      navigation.selectedSessionId() === null
        ? pendingSessionInspectionProjectPath()
        : discoveredProjectPathResolve(selectedSessionProjectPath()),
  })
  const providerModelSelector = providerModelSelectorStateCreate({
    accountId: () => account?.userId() ?? null,
    agentId: sessionTargetSelector.selectedAgentId,
    isOnline: () => pwa?.status() !== "offline",
    sessionId: navigation.selectedSessionId,
  })
  const selectedSessionState = selectedSessionStateCreate({
    codelineExecution: providerModelSelector.codelineExecution,
    commandCatalog,
    navigation: () => navigation,
    rightPanelClose: shell.rightPanelClose,
    rightPanelShow: shell.rightPanelShow,
    sessionCreateErrorMessage: sessionTargetSelector.sessionCreateErrorMessage,
    sessionCreateStart: sessionTargetSelector.sessionCreateStart,
    sessionTargetAvailable: sessionTargetSelector.canCreateSession,
  })
  selectedSessionProjectPath = () => selectedSessionState.session()?.projectPath ?? null
  shell.rightPanelEnable()
  onCleanup(shell.rightPanelDisable)
  onCleanup(drawer.sessionDrawerClose)

  return {
    activeProject,
    drawer,
    files: filesScreenViewCreate({ fetcher: options.fetcher, projectRegistry }),
    projectIdOverride,
    projectPathOverride,
    projectRegistry,
    providerModelSelector,
    selectedSession: selectedSessionState,
    sessionList: sessionListStateCreate(() => navigation, sidebarRoute, { fetcher: options.fetcher }),
    sessionResourceSelector,
    sessionTargetSelector,
    shell,
  }
}
