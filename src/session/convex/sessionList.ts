import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { agentDocumentPublic } from "../../agents/convex/agentDocumentPublic.js"
import { serverDocumentPublic } from "../../servers/convex/serverDocumentPublic.js"
import { sessionDocumentPublic } from "./sessionDocumentPublic.js"
import type { SessionListResult } from "./sessionListResult.js"

type SessionQueryContext = Pick<GenericQueryCtx<any>, "db">

type SessionListOptions = {
  cursor?: string
  includeArchived: boolean
  limit: number
  search?: string
}

type SessionCursor = {
  id: string
  updatedAt: number
}

function sessionCursorDecode(cursor: string | undefined): Result<SessionCursor | undefined> {
  const op = "sessionCursorDecode"
  if (cursor === undefined) return createResult(undefined)

  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      id?: unknown
      updatedAt?: unknown
    }
    if (typeof decoded.id !== "string" || decoded.id.length === 0)
      return createResultError(op, "The session list cursor is invalid.")
    const updatedAt =
      typeof decoded.updatedAt === "number"
        ? decoded.updatedAt
        : typeof decoded.updatedAt === "string"
          ? Date.parse(decoded.updatedAt)
          : Number.NaN
    if (!Number.isFinite(updatedAt)) return createResultError(op, "The session list cursor is invalid.")
    return createResult({ id: decoded.id, updatedAt })
  } catch (_error) {
    return createResultError(op, "The session list cursor is invalid.")
  }
}

function sessionCursorEncode(cursor: SessionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

function searchableValue(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value) ?? ""
  } catch (_error) {
    return ""
  }
}

function sessionMatchesSearch(session: any, server: any, agent: any, search: string | undefined): boolean {
  if (search === undefined || search.length === 0) return true
  const normalizedSearch = search.toLocaleLowerCase()
  return [
    session.title,
    searchableValue(session.metadata),
    server.name,
    agent.name,
    searchableValue(server.metadata),
    searchableValue(agent.configuration),
  ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
}

function sessionSort(left: any, right: any): number {
  if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
  if (left.id === right.id) return 0
  return left.id > right.id ? -1 : 1
}

function sessionAfterCursor(session: any, cursor: SessionCursor | undefined): boolean {
  if (cursor === undefined) return true
  return session.updatedAt < cursor.updatedAt || (session.updatedAt === cursor.updatedAt && session.id < cursor.id)
}

async function sessionDocumentsRead(
  context: SessionQueryContext,
  userId: string,
  cursor: SessionCursor | undefined,
): Promise<any[]> {
  const sessions = context.db.query("sessions")
  if (cursor === undefined)
    return sessions
      .withIndex("userIdUpdatedAtId", (query: any) => query.eq("userId", userId))
      .order("desc")
      .collect()

  const [older, tied] = await Promise.all([
    sessions
      .withIndex("userIdUpdatedAtId", (query: any) => query.eq("userId", userId).lt("updatedAt", cursor.updatedAt))
      .order("desc")
      .collect(),
    sessions
      .withIndex("userIdUpdatedAtId", (query: any) =>
        query.eq("userId", userId).eq("updatedAt", cursor.updatedAt).lt("id", cursor.id),
      )
      .order("desc")
      .collect(),
  ])

  return [...older, ...tied]
}

export async function sessionList(
  context: SessionQueryContext,
  userId: string,
  organizationId: string,
  options: SessionListOptions,
): Promise<Result<SessionListResult>> {
  const op = "sessionList"
  const cursor = sessionCursorDecode(options.cursor)
  if (!cursor.success) return cursor
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit)))

  try {
    const sessionDocuments = await sessionDocumentsRead(context, userId, cursor.data)
    const serverDocuments = await context.db
      .query("servers")
      .withIndex("organizationId", (query: any) => query.eq("organizationId", organizationId))
      .collect()
    const serversById = new Map(serverDocuments.map((server: any) => [server.id, server]))
    const agentDocuments = await context.db.query("agents").collect()
    const agentsById = new Map(agentDocuments.map((agent: any) => [`${agent.serverId}:${agent.id}`, agent]))
    const search = options.search?.trim()
    const rows = sessionDocuments
      .filter(
        (session: any) => options.includeArchived || session.archivedAt === undefined || session.archivedAt === null,
      )
      .filter((session: any) => sessionAfterCursor(session, cursor.data))
      .map((session: any) => ({
        session,
        server: serversById.get(session.serverId),
        agent: agentsById.get(`${session.serverId}:${session.primaryAgentId}`),
      }))
      .filter(({ server, agent }: { server: any; agent: any }) => server !== undefined && agent !== undefined)
      .filter(({ session, server, agent }: { session: any; server: any; agent: any }) =>
        sessionMatchesSearch(session, server, agent, search),
      )
      .sort((left: any, right: any) => sessionSort(left.session, right.session))

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const last = page[page.length - 1]
    return createResult({
      nextCursor:
        hasMore && last !== undefined
          ? sessionCursorEncode({ id: last.session.id, updatedAt: last.session.updatedAt })
          : null,
      rows: page.map(({ agent, server, session }: any) => ({
        agent: agentDocumentPublic(agent),
        server: serverDocumentPublic(server),
        session: sessionDocumentPublic(session),
      })),
    })
  } catch (_error) {
    return createResultError(op, "The sessions could not be loaded.")
  }
}
