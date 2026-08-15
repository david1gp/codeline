import type { SessionSearchResponse } from "../session/schema/sessionSearchResponseSchema.js"
import { sessionSearchResultAdapt } from "./sessionSearchResultAdapt.js"
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
  watched: readonly SessionSidebarRow[]
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

function sessionSidebarProjectLabelResolve(projectPath: string): string {
  if (projectPath === "~") return "Home"
  const segments = projectPath.split("/").filter((segment) => segment.length > 0)
  return segments.at(-1) ?? projectPath
}

function sessionSidebarRowCreate(session: SessionSidebarSession, now: number): SessionSidebarRow {
  const updatedAt = sessionUpdatedAtFormat(session.updatedAt, now)
  return {
    projectLabel: sessionSidebarProjectLabelResolve(session.projectPath),
    session,
    updatedAtRelative: updatedAt.relative,
    updatedAtTitle: updatedAt.title,
  }
}

export function sessionSidebarDerive(
  activeSessions: readonly SessionSidebarSession[],
  searchResults: readonly SessionSearchResponse["sessions"][number][],
  now: number = Date.now(),
): SessionSidebarTabs {
  const recent = [...activeSessions]
    .sort(sessionSidebarSessionCompare)
    .map((session) => sessionSidebarRowCreate(session, now))
  const watched = recent.filter((row) => row.session.watched)
  const projects = new Map<string, SessionSidebarRow[]>()

  for (const row of recent) {
    const group = projects.get(row.session.projectPath)
    if (group === undefined) projects.set(row.session.projectPath, [row])
    else group.push(row)
  }

  return {
    projects: [...projects]
      .map(([projectPath, sessions]) => ({
        projectLabel: sessionSidebarProjectLabelResolve(projectPath),
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
    search: searchResults.map((result) => sessionSidebarRowCreate(sessionSearchResultAdapt(result), now)),
    watched,
  }
}
