import type { SessionShell } from "../session/api/sessionShellSchema.js"
import { sessionSearchResultAdapt } from "./sessionSearchResultAdapt.js"
import { sessionSidebarProjectLabelResolve } from "./sessionSidebarProjectLabelResolve.js"
import type { SessionSidebarSession } from "./sessionSidebarSession.js"
import { sessionUpdatedAtFormat } from "./sessionUpdatedAtFormat.js"

type SessionSidebarRow = {
  projectLabel: string
  session: SessionSidebarSession
  updatedAtRelative: string
  updatedAtTitle: string
}

type SessionSidebarProjectGroup = {
  projectLabel: string
  projectPath: string
  sessions: readonly SessionSidebarRow[]
}

type SessionSidebarTabs = {
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
): SessionSidebarTabs {
  const recent = [...activeSessions]
    .sort(sessionSidebarSessionCompare)
    .map((session) => sessionSidebarRowCreate(session, now, projectLabels))
  const pinned = recent.filter((row) => row.session.pinned)
  const projects = new Map<string, SessionSidebarRow[]>()

  for (const row of recent) {
    const group = projects.get(row.session.projectPath)
    if (group === undefined) projects.set(row.session.projectPath, [row])
    else group.push(row)
  }

  return {
    projects: [...projects]
      .map(([projectPath, sessions]) => ({
        projectLabel: projectLabels[projectPath] ?? sessionSidebarProjectLabelResolve(projectPath),
        projectPath,
        sessions,
      }))
      .sort((left, right) => {
        const leftIsHome = left.projectPath === "~"
        const rightIsHome = right.projectPath === "~"
        if (leftIsHome !== rightIsHome) return leftIsHome ? -1 : 1
        const leftLabel = left.projectLabel.toLocaleLowerCase()
        const rightLabel = right.projectLabel.toLocaleLowerCase()
        return (
          leftLabel.localeCompare(rightLabel) ||
          left.projectLabel.localeCompare(right.projectLabel) ||
          left.projectPath.localeCompare(right.projectPath)
        )
      }),
    recent,
    search: searchResults.map((result) =>
      sessionSidebarRowCreate(sessionSearchResultAdapt(result), now, projectLabels),
    ),
    pinned,
  }
}
