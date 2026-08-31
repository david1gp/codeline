import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq, inArray } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { runToolDetailIdCreate } from "../../run/actions/runToolDetailIdCreate.js"
import { runDelegationTable } from "../../run/db/runDelegationTable.js"
import { runTable } from "../../run/db/runTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import type { SessionChildReference } from "../api/sessionChildReferenceSchema.js"
import { sessionBoundedDelegationToolKeyCreate } from "./sessionBoundedDelegationToolKeyCreate.js"
import { sessionTable } from "./sessionTable.js"

type SessionDelegationReferenceRow = {
  childReference: SessionChildReference | null
  childSessionId: string | null
  childSnapshot: typeof runTable.$inferSelect.snapshot | null
  delegation: typeof runDelegationTable.$inferSelect
  parentSessionId: string
}

type SessionDelegationReferencesLoadResult = {
  byToolKey: ReadonlyMap<string, SessionChildReference | null>
  delegations: Array<SessionDelegationReferenceRow>
  parentRevision: number
}

export async function sessionDelegationReferencesLoad(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<Result<SessionDelegationReferencesLoadResult>> {
  const op = "sessionDelegationReferencesLoad"

  try {
    const [parentSession] = await database
      .select({ id: sessionTable.id, revision: sessionTable.revision })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (parentSession === undefined) return createResultError(op, "The session could not be found.")

    const rows = await database
      .select({ childSnapshot: runTable.snapshot, delegation: runDelegationTable })
      .from(runDelegationTable)
      .leftJoin(runTable, eq(runTable.id, runDelegationTable.childRunId))
      .where(and(eq(runDelegationTable.sessionId, sessionId), eq(runDelegationTable.userId, userId)))
      .orderBy(asc(runDelegationTable.createdAt), asc(runDelegationTable.id))

    const runIds = [...new Set(rows.flatMap(({ delegation }) => [delegation.parentRunId, delegation.childRunId]))]
    const runs =
      runIds.length === 0
        ? []
        : await database
            .select({ id: runTable.id, sessionId: runTable.sessionId, userId: runTable.userId })
            .from(runTable)
            .where(and(eq(runTable.userId, userId), inArray(runTable.id, runIds)))
    const runsById = new Map(runs.map((run) => [run.id, run]))
    const childSessionIds = [
      ...new Set(
        rows
          .map(({ delegation }) => runsById.get(delegation.childRunId)?.sessionId)
          .filter((childSessionId): childSessionId is string => childSessionId !== undefined),
      ),
    ]
    const childSessions =
      childSessionIds.length === 0
        ? []
        : await database
            .select({ id: sessionTable.id, parentSessionId: sessionTable.parentSessionId })
            .from(sessionTable)
            .innerJoin(
              serverTable,
              and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
            )
            .where(and(eq(sessionTable.userId, userId), inArray(sessionTable.id, childSessionIds)))
    const childSessionsById = new Map(childSessions.map((session) => [session.id, session]))
    const byToolKey = new Map<string, SessionChildReference | null>()
    const delegations = rows.map(({ childSnapshot, delegation }) => {
      const parentRun = runsById.get(delegation.parentRunId)
      const childRun = runsById.get(delegation.childRunId)
      const childSession = childRun === undefined ? undefined : childSessionsById.get(childRun.sessionId)
      const childSessionId =
        parentRun?.sessionId !== parentSession.id ||
        childSession === undefined ||
        childSession.id === parentSession.id ||
        childSession.parentSessionId !== parentSession.id
          ? null
          : childSession.id
      const childReference = childSessionId === null ? null : { childSessionId, parentSessionId: parentSession.id }
      const authorizedChildSnapshot = childRun === undefined || childSession === undefined ? null : childSnapshot
      const toolKey = sessionBoundedDelegationToolKeyCreate(
        delegation.parentRunId,
        runToolDetailIdCreate(delegation.parentRunId, delegation.delegationKey),
      )
      byToolKey.set(toolKey, childReference)
      return {
        childReference,
        childSessionId,
        childSnapshot: authorizedChildSnapshot,
        delegation,
        parentSessionId: parentSession.id,
      }
    })

    return createResult({ byToolKey, delegations, parentRevision: parentSession.revision })
  } catch (_error) {
    return createResultError(op, "The session delegation references could not be loaded.")
  }
}
