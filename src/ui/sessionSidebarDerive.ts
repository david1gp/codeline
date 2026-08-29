import type { ProjectRegistryApiProject } from "../project/api/projectRegistryApiProjectSchema.js"
import type { SessionShell } from "../session/api/sessionShellSchema.js"
import { sessionSearchResultAdapt } from "./sessionSearchResultAdapt.js"
import { sessionSidebarProjectLabelResolve } from "./sessionSidebarProjectLabelResolve.js"
import type { SessionSidebarSession } from "./sessionSidebarSession.js"
import { sessionUpdatedAtFormat } from "./sessionUpdatedAtFormat.js"

export type SessionSidebarRow = {
  projectLabel: string
  session: SessionSidebarSession
  updatedAtRelative: string
  updatedAtTitle: string
}

export type SessionSidebarProjectGroup = {
  available?: boolean
  projectId?: string
  projectLabel: string
  projectPath: string
  sessions: readonly SessionSidebarRow[]
}

export type SessionSidebarTabs = {
  projects: readonly SessionSidebarProjectGroup[]
  recent: readonly SessionSidebarRow[]
  search: readonly SessionSidebarRow[]
  pinned: readonly SessionSidebarRow[]
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
): SessionSidebarRow {
  const updatedAt = sessionUpdatedAtFormat(session.updatedAt, now)
  return {
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
): SessionSidebarTabs {
  const recent = [...activeSessions]
    .sort(sessionSidebarSessionCompare)
    .map((session) => sessionSidebarRowCreate(session, now, projectLabels))
  const pinned = recent.filter((row) => row.session.pinned)

  const matchedSessionIds = new Set<string>()
  const groups: SessionSidebarProjectGroup[] = []

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

  return {
    pinned,
    projects: groups,
    recent,
    search: searchResults.map((result) =>
      sessionSidebarRowCreate(sessionSearchResultAdapt(result), now, projectLabels),
    ),
  }
}
