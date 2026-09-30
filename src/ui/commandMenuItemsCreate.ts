import type { ProjectRegistryApiProject } from "../project/api/projectRegistryApiProjectSchema.js"
import type { SessionShell } from "../session/api/sessionShellSchema.js"
import { urlSessionDetail, urlSessions } from "../ui/workspace_url/urlWorkspace.js"
import { pageRouteDashboard } from "./dashboard_url/pageRouteDashboard.js"
import { pageRouteFiles } from "./files_url/pageRouteFiles.js"
import { urlNotes } from "../note/note_url/urlNote.js"
import { pageRouteSettings } from "./settings_url/pageRouteSettings.js"
import type { CommandMenuItem } from "./commandMenuItem.js"

export function commandMenuItemsCreate(input: {
  projects: readonly ProjectRegistryApiProject[]
  query: string
  sessions: readonly SessionShell[]
}): CommandMenuItem[] {
  const actions: CommandMenuItem[] = [
    {
      description: "Start a new coding session.",
      id: "action:new-session",
      intent: { kind: "new-session" },
      kind: "action",
      label: "New session",
      keywords: ["chat", "conversation"],
    },
    {
      description: "Register a project folder.",
      id: "action:new-project",
      intent: { kind: "new-project" },
      kind: "action",
      label: "New project",
      keywords: ["add", "register", "folder"],
    },
  ]
  const destinations: CommandMenuItem[] = [
    {
      description: "Browse coding sessions.",
      href: urlSessions(),
      id: "destination:sessions",
      kind: "destination",
      label: "Sessions",
      keywords: ["history"],
    },
    {
      description: "Browse repository files.",
      href: pageRouteFiles.files,
      id: "destination:explorer",
      kind: "destination",
      label: "Explorer",
      keywords: ["files", "repositories"],
    },
    {
      description: "Open your notes.",
      href: urlNotes(),
      id: "destination:notes",
      kind: "destination",
      label: "Notes",
      keywords: ["scratchpad"],
    },
    {
      description: "Open the dashboard.",
      href: pageRouteDashboard.dashboard,
      id: "destination:dashboard",
      kind: "destination",
      label: "Dashboard",
      keywords: ["home"],
    },
    {
      description: "Manage your preferences.",
      href: pageRouteSettings.settings,
      id: "destination:settings",
      kind: "destination",
      label: "Settings",
      keywords: ["preferences"],
    },
  ]
  const projectsItems: CommandMenuItem[] = input.projects.map((project) => ({
    description: project.parentFolder?.label ?? "Start a session in this project.",
    id: `project:${project.id}`,
    kind: "project",
    label: project.label,
    projectId: project.id,
    keywords: [project.parentFolder?.label ?? "", project.parentFolder?.id ?? "", project.id],
  }))
  const sessionsItems: CommandMenuItem[] = input.sessions.map((session) => ({
    description: session.projectPath,
    href: urlSessionDetail(session.id),
    id: `session:${session.id}`,
    kind: "session",
    label: session.title || "Untitled session",
    keywords: [session.projectPath, session.id],
  }))
  const queryTokens = input.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const localItems = [...actions, ...destinations, ...projectsItems]
  if (queryTokens.length === 0) return [...localItems, ...sessionsItems]
  return [
    ...localItems.filter((item) => {
      const searchableFields = [item.label, item.description, ...item.keywords].map((value) =>
        value.toLocaleLowerCase(),
      )
      return queryTokens.every((token) => searchableFields.some((value) => value.includes(token)))
    }),
    ...sessionsItems,
  ]
}
