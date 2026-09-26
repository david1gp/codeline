import { createHash } from "node:crypto"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, inArray, notInArray } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { journalEventsPrune } from "../../journal/actions/journalEventsPrune.js"
import { journalEventTable } from "../../journal/db/journalEventTable.js"
import { projectFolderTable } from "../../project/db/projectFolderTable.js"
import { projectTable } from "../../project/db/projectTable.js"
import { applicationUserTable } from "../db/applicationUserTable.js"
import { e2eFixtureRunTable } from "../db/e2eFixtureRunTable.js"
import { e2eFixtureDiagnosticTable } from "../db/e2eFixtureDiagnosticTable.js"
import { e2eSampleSessionsTable } from "../db/e2eSampleSessionsTable.js"
import { externalIdentityTable } from "../db/externalIdentityTable.js"
import { identitySessionTable } from "../db/identitySessionTable.js"
import { organizationMemberTable } from "../db/organizationMemberTable.js"
import { organizationTable } from "../db/organizationTable.js"
import { identitySessionCreate } from "./identitySessionCreate.js"
import { identitySessionExpire } from "./identitySessionExpire.js"
import { oidcIdentityUpsert } from "./oidcIdentityUpsert.js"
import { e2eSampleSessionsOperate } from "./e2eSampleSessionsOperate.js"

type FixtureOperation = "issue" | "status" | "expire" | "prune-journal" | "purge"
type FixtureConfig = { issuer: string; organizationExternalId: string }
type FixtureMember = { displayName: string; expiresAt: string; token: string; userId: string }
type FixtureResult = {
  createdAt?: string
  exists: boolean
  members?: FixtureMember[]
  organizationId?: string
  subjectPrefix?: string
  userIds?: string[]
  expiredSessions?: { expiresAt: string; sessionId: string }[]
  pruned?: { prunedEventCount: number; prunedThroughSequence: number | null; userId: string }[]
}

const subjectPrefix = (runId: string) => `e2e-organization-member-${runId}-`

async function fixtureVerify(
  database: DatabaseExecutor,
  run: typeof e2eFixtureRunTable.$inferSelect,
): Promise<boolean> {
  const userIds = [run.firstUserId, run.secondUserId]
  if (userIds[0] === userIds[1]) return false
  const users = await database.select().from(applicationUserTable).where(inArray(applicationUserTable.id, userIds))
  const identities = await database
    .select()
    .from(externalIdentityTable)
    .where(inArray(externalIdentityTable.userId, userIds))
  const memberships = await database
    .select()
    .from(organizationMemberTable)
    .where(inArray(organizationMemberTable.userId, userIds))
  if (users.length !== 2 || identities.length !== 2 || memberships.length !== 2) return false
  return userIds.every((userId, index) => {
    const subject = `${subjectPrefix(run.runId)}${index + 1}`
    const user = users.find((row) => row.id === userId)
    const identity = identities.find((row) => row.userId === userId)
    const membership = memberships.find((row) => row.userId === userId)
    return (
      user?.displayName === `E2E Member ${index + 1} ${run.runId}` &&
      user.email === `${subject}@example.test` &&
      user.createdAt.getTime() >= run.createdAt.getTime() - 1000 &&
      identity?.issuer === run.issuer &&
      identity.subject === subject &&
      membership?.issuer === run.issuer &&
      membership.subject === subject &&
      membership.organizationId === run.organizationId
    )
  })
}

/** The only API-owned identity lifecycle; never use the legacy prefix-based local purge here. */
export async function e2eFixtureRunOperate(
  database: DatabaseExecutor,
  config: FixtureConfig,
  runId: string,
  operation: FixtureOperation,
  now = new Date(),
  selectedUserId?: string,
): Promise<Result<FixtureResult>> {
  const op = "e2eFixtureRunOperate"
  if (!/^[0-9a-z]{6,40}$/.test(runId) || !Number.isFinite(now.getTime()))
    return createResultError(op, "The fixture run identifier or clock is invalid.")

  try {
    const result = await databaseTransactionRun<FixtureResult>(database, async (transaction) => {
      const [stored] = await transaction.select().from(e2eFixtureRunTable).where(eq(e2eFixtureRunTable.runId, runId))
      if (operation === "issue") {
        if (stored !== undefined) return createResultError(op, "The fixture run already exists.")
        const [organization] = await transaction
          .select()
          .from(organizationTable)
          .where(eq(organizationTable.externalId, config.organizationExternalId))
        if (organization === undefined) return createResultError(op, "The configured organization is unavailable.")
        const members: FixtureMember[] = []
        for (const index of [1, 2]) {
          const subject = `${subjectPrefix(runId)}${index}`
          // Refuse adoption of a previously issued (or manually created) identity.
          const [existing] = await transaction
            .select()
            .from(externalIdentityTable)
            .where(eq(externalIdentityTable.subject, subject))
          if (existing !== undefined) return createResultError(op, "The fixture identity is already in use.")
          const proposedId = `oidc:${createHash("sha256").update(`${config.issuer}\0${subject}`).digest("hex")}`
          const [existingUser] = await transaction
            .select({ id: applicationUserTable.id })
            .from(applicationUserTable)
            .where(eq(applicationUserTable.id, proposedId))
          if (existingUser !== undefined) return createResultError(op, "The fixture user is already in use.")
          const user = await oidcIdentityUpsert(transaction, {
            displayName: `E2E Member ${index} ${runId}`,
            issuer: config.issuer,
            organizationExternalId: config.organizationExternalId,
            subject,
            verifiedEmail: `${subject}@example.test`,
          })
          if (!user.success) return user
          const session = await identitySessionCreate(transaction, user.data.id, {
            now,
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          })
          if (!session.success) return session
          members.push({
            displayName: user.data.displayName,
            expiresAt: session.data.session.expiresAt.toISOString(),
            token: session.data.token,
            userId: user.data.id,
          })
        }
        await transaction.insert(e2eFixtureRunTable).values({
          runId,
          createdAt: now,
          issuer: config.issuer,
          organizationExternalId: config.organizationExternalId,
          organizationId: organization.id,
          firstUserId: members[0]!.userId,
          secondUserId: members[1]!.userId,
        })
        return createResult({
          createdAt: now.toISOString(),
          exists: true,
          members,
          organizationId: organization.id,
          subjectPrefix: subjectPrefix(runId),
          userIds: members.map((member) => member.userId),
        })
      }

      if (stored === undefined) return createResult({ exists: false })
      const [organization] = await transaction
        .select()
        .from(organizationTable)
        .where(eq(organizationTable.externalId, config.organizationExternalId))
      if (
        stored.issuer !== config.issuer ||
        stored.organizationExternalId !== config.organizationExternalId ||
        organization?.id !== stored.organizationId ||
        !(await fixtureVerify(transaction, stored))
      )
        return createResultError(op, "The fixture run ownership could not be verified.")

      const [sample] = await transaction
        .select()
        .from(e2eSampleSessionsTable)
        .where(eq(e2eSampleSessionsTable.runId, runId))
      if (sample !== undefined) {
        const verified = await e2eSampleSessionsOperate(transaction, stored, "status")
        if (!verified.success || !verified.data.exists)
          return createResultError(op, "The sample fixture ownership could not be verified.")
      }
      const userIds = [stored.firstUserId, stored.secondUserId]
      if (operation === "expire" || operation === "prune-journal") {
        if (selectedUserId !== undefined && !userIds.includes(selectedUserId))
          return createResultError(op, "The member does not belong to this fixture run.")
      }
      const targetUserIds = selectedUserId === undefined ? userIds : [selectedUserId]
      if (operation === "expire") {
        const sessions = await transaction
          .select({ id: identitySessionTable.id })
          .from(identitySessionTable)
          .where(inArray(identitySessionTable.userId, targetUserIds))
        const expiresAt = new Date(now.getTime() - 1000)
        for (const session of sessions) {
          const expired = await identitySessionExpire(transaction, session.id, {
            expiresAt,
          })
          if (!expired.success) return expired
        }
        return createResult({
          createdAt: stored.createdAt.toISOString(),
          exists: true,
          organizationId: stored.organizationId,
          subjectPrefix: subjectPrefix(runId),
          userIds: targetUserIds,
          expiredSessions: sessions.map((session) => ({ expiresAt: expiresAt.toISOString(), sessionId: session.id })),
        })
      }
      if (operation === "prune-journal")
        return createResult({ createdAt: stored.createdAt.toISOString(), exists: true, userIds: targetUserIds })
      if (operation === "purge") {
        const [foreignDiagnostic] = await transaction
          .select({ id: e2eFixtureDiagnosticTable.id })
          .from(e2eFixtureDiagnosticTable)
          .where(and(eq(e2eFixtureDiagnosticTable.runId, runId), notInArray(e2eFixtureDiagnosticTable.userId, userIds)))
          .limit(1)
        if (foreignDiagnostic !== undefined)
          return createResultError(op, "The fixture diagnostic ownership could not be verified.")
        await transaction.delete(e2eFixtureDiagnosticTable).where(eq(e2eFixtureDiagnosticTable.runId, runId))
        await transaction.delete(applicationUserTable).where(inArray(applicationUserTable.id, userIds))
        if (sample !== undefined) {
          const removed = await e2eSampleSessionsOperate(transaction, stored, "remove")
          if (!removed.success) return removed
        }
        await transaction.delete(e2eFixtureRunTable).where(eq(e2eFixtureRunTable.runId, runId))
        const [remainingDiagnostic] = await transaction
          .select({ id: e2eFixtureDiagnosticTable.id })
          .from(e2eFixtureDiagnosticTable)
          .where(eq(e2eFixtureDiagnosticTable.runId, runId))
          .limit(1)
        const [remainingRun] = await transaction
          .select({ runId: e2eFixtureRunTable.runId })
          .from(e2eFixtureRunTable)
          .where(eq(e2eFixtureRunTable.runId, runId))
        const [remainingSample] = await transaction
          .select({ runId: e2eSampleSessionsTable.runId })
          .from(e2eSampleSessionsTable)
          .where(eq(e2eSampleSessionsTable.runId, runId))
        const remaining = await transaction
          .select({ id: applicationUserTable.id })
          .from(applicationUserTable)
          .where(inArray(applicationUserTable.id, userIds))
        const linkedRows = await Promise.all([
          transaction.select().from(externalIdentityTable).where(inArray(externalIdentityTable.userId, userIds)),
          transaction.select().from(organizationMemberTable).where(inArray(organizationMemberTable.userId, userIds)),
          transaction.select().from(identitySessionTable).where(inArray(identitySessionTable.userId, userIds)),
          transaction.select().from(journalEventTable).where(inArray(journalEventTable.userId, userIds)),
          transaction.select().from(projectFolderTable).where(inArray(projectFolderTable.userId, userIds)),
          transaction.select().from(projectTable).where(inArray(projectTable.userId, userIds)),
        ])
        if (
          remainingDiagnostic !== undefined ||
          remainingRun !== undefined ||
          remainingSample !== undefined ||
          remaining.length !== 0 ||
          linkedRows.some((rows) => rows.length !== 0)
        )
          return createResultError(op, "The fixture identities or their linked rows were not removed.")
        return createResult({ exists: false, userIds })
      }
      return createResult({
        createdAt: stored.createdAt.toISOString(),
        exists: true,
        organizationId: stored.organizationId,
        subjectPrefix: subjectPrefix(runId),
        userIds,
      })
    })
    if (!result.success || !["expire", "prune-journal"].includes(operation) || !result.data.exists) return result
    if (!("batch" in database)) return createResultError(op, "Journal pruning requires a root database connection.")
    const prunedResults: NonNullable<FixtureResult["pruned"]> = []
    for (const userId of result.data.userIds ?? []) {
      const pruned = await journalEventsPrune(
        { database, clock: () => now, limits: { maxAgeMs: 0, maxCount: 0, maxSerializedBytes: 0 } },
        { userId },
      )
      if (!pruned.success) return createResultError(op, "The fixture journal could not be pruned.")
      prunedResults.push({
        prunedEventCount: pruned.data.prunedEventCount,
        prunedThroughSequence: pruned.data.prunedThroughSequence,
        userId: pruned.data.userId,
      })
    }
    return operation === "prune-journal" ? createResult({ ...result.data, pruned: prunedResults }) : result
  } catch (_error) {
    return createResultError(op, "The fixture operation failed.")
  }
}
