import type { ProjectRegistryApiFolder } from "../project/api/projectRegistryApiFolderSchema.js"
import type { ProjectRegistryApiProject } from "../project/api/projectRegistryApiProjectSchema.js"
import type { SessionShell } from "../session/api/sessionShellSchema.js"
import { sessionSearchResultAdapt } from "./sessionSearchResultAdapt.js"
import { sessionSidebarProjectLabelResolve } from "./sessionSidebarProjectLabelResolve.js"
import type { SessionSidebarSession } from "./sessionSidebarSession.js"
import { sessionUpdatedAtFormat } from "./sessionUpdatedAtFormat.js"

export type SessionSidebarRow = {
  faviconUrl?: string | null
  projectLabel: string
  session: SessionSidebarSession
  updatedAtRelative: string
  updatedAtTitle: string
}

export type SessionSidebarProjectGroup = {
  available?: boolean
  faviconUrl?: string | null
  folderId?: string | null
  parentFolder?: { id: string; label: string } | null
  projectId?: string
  projectLabel: string
  projectPath: string
  sessions: readonly SessionSidebarRow[]
}

export type SessionSidebarFolderGroup = {
  active: boolean
  id: string
  label: string
  projects: readonly SessionSidebarProjectGroup[]
  unseenEnded: boolean
}

export type SessionSidebarTabs = {
  folders: readonly SessionSidebarFolderGroup[]
  pinned: readonly SessionSidebarRow[]
  projects: readonly SessionSidebarProjectGroup[]
  recent: readonly SessionSidebarRow[]
  search: readonly SessionSidebarRow[]
  uncategorizedProjects: readonly SessionSidebarProjectGroup[]
}

function sessionUpdatedAtMillisecondsResolve(value: SessionSidebarSession["updatedAt"]): number {
  const milliseconds = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value)
  return Number.isFinite(milliseconds) ? milliseconds : 0
}

function sessionSidebarSessionCompare(left: SessionSidebarSession, right: SessionSidebarSession): number {
  const updatedAtDifference =
    sessionUpdatedAtMillisecondsResolve(right.updatedAt) - sessionUpdatedAtMillisecondsResolve(left.updatedAt)
  if (updatedAtDifference !== 0) return updatedAtDifference
  return right.id.localeCompare(left.id)
}

function sessionSidebarRowCreate(
  session: SessionSidebarSession,
  now: number,
  projectLabels: Record<string, string> = {},
  projectFaviconUrls: ReadonlyMap<string, string | null> = new Map(),
): SessionSidebarRow {
  const updatedAt = sessionUpdatedAtFormat(session.updatedAt, now)
  return {
    faviconUrl: session.projectId === undefined ? undefined : projectFaviconUrls.get(session.projectId),
    projectLabel: projectLabels[session.projectPath] ?? sessionSidebarProjectLabelResolve(session.projectPath),
    session,
    updatedAtRelative: updatedAt.relative,
    updatedAtTitle: updatedAt.title,
  }
}

export function sessionSidebarDerive(
  activeSessions: readonly SessionSidebarSession[],
  searchResults: readonly SessionShell[],
  now: number = Date.now(),
  projectLabels: Record<string, string> = {},
  registeredProjects: readonly ProjectRegistryApiProject[] = [],
  registeredFolders: readonly ProjectRegistryApiFolder[] = [],
): SessionSidebarTabs {
  const projectFaviconUrls = new Map(registeredProjects.map((project) => [project.id, project.faviconUrl]))
  const recent = [...activeSessions]
    .sort(sessionSidebarSessionCompare)
    .map((session) => sessionSidebarRowCreate(session, now, projectLabels, projectFaviconUrls))
  const pinned = recent.filter((row) => row.session.pinned)

  const matchedSessionIds = new Set<string>()
  const groups: SessionSidebarProjectGroup[] = []
  const registeredFolderMap = new Map(registeredFolders.map((folder) => [folder.id, folder]))

  for (const reg of registeredProjects) {
    const matchingSessions: SessionSidebarRow[] = []

    for (const row of recent) {
      if (matchedSessionIds.has(row.session.id)) continue
      if (row.session.projectId !== reg.id) continue
      matchingSessions.push(row)
      matchedSessionIds.add(row.session.id)
    }

    groups.push({
      available: reg.available,
      faviconUrl: reg.faviconUrl,
      folderId: registeredFolderMap.has(reg.folderId ?? "")
        ? (reg.folderId ?? null)
        : registeredFolderMap.has(reg.parentFolder?.id ?? "")
          ? (reg.parentFolder?.id ?? null)
          : null,
      parentFolder: reg.parentFolder ?? null,
      projectId: reg.id,
      projectLabel: reg.label,
      projectPath: matchingSessions[0]?.session.projectPath ?? "",
      sessions: matchingSessions,
    })
  }

  const remainingByPath = new Map<string, SessionSidebarRow[]>()
  for (const row of recent) {
    if (matchedSessionIds.has(row.session.id)) continue
    const existing = remainingByPath.get(row.session.projectPath)
    if (existing === undefined) remainingByPath.set(row.session.projectPath, [row])
    else existing.push(row)
  }

  for (const [projectPath, sessions] of remainingByPath) {
    groups.push({
      available: true,
      folderId: null,
      parentFolder: null,
      projectLabel: projectLabels[projectPath] ?? sessionSidebarProjectLabelResolve(projectPath),
      projectPath,
      sessions,
    })
  }

  groups.sort((left, right) => {
    const leftIsHome = left.projectPath === "~" || left.projectLabel === "Home"
    const rightIsHome = right.projectPath === "~" || right.projectLabel === "Home"
    if (leftIsHome !== rightIsHome) return leftIsHome ? -1 : 1
    const leftLabel = left.projectLabel.toLocaleLowerCase()
    const rightLabel = right.projectLabel.toLocaleLowerCase()
    return (
      leftLabel.localeCompare(rightLabel) ||
      left.projectLabel.localeCompare(right.projectLabel) ||
      left.projectPath.localeCompare(right.projectPath)
    )
  })

  const folders: SessionSidebarFolderGroup[] = registeredFolders.map((folder) => ({
    active: folder.active,
    id: folder.id,
    label: folder.label,
    projects: groups.filter((group) => group.folderId === folder.id),
    unseenEnded: folder.unseenEnded,
  }))

  const uncategorizedProjects = groups.filter(
    (group) => group.folderId === null || group.folderId === undefined || !registeredFolderMap.has(group.folderId),
  )

  return {
    folders,
    pinned,
    projects: groups,
    recent,
    search: searchResults.map((result) =>
      sessionSidebarRowCreate(sessionSearchResultAdapt(result), now, projectLabels, projectFaviconUrls),
    ),
    uncategorizedProjects,
  }
}
