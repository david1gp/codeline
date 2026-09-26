import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, or, notInArray, desc } from "drizzle-orm"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { e2eFixtureDiagnosticTable } from "../db/e2eFixtureDiagnosticTable.js"
import { e2eFixtureRunTable } from "../db/e2eFixtureRunTable.js"
import { e2eFixtureRunOperate } from "./e2eFixtureRunOperate.js"

const maxEntriesPerRun = 128
const maxEntryBytes = 64 * 1024

/** A missing marker is an ordinary user; a present but unverifiable marker fails closed. */
export async function e2eFixtureDiagnosticCapture(
  database: DatabaseClient,
  config: { issuer: string; organizationExternalId: string },
  userId: string,
  entry: Record<string, unknown>,
  projectRootDirs: readonly string[] = [],
): Promise<Result<boolean>> {
  const op = "e2eFixtureDiagnosticCapture"
  try {
    const [candidate] = await database
      .select({ runId: e2eFixtureRunTable.runId })
      .from(e2eFixtureRunTable)
      .where(or(eq(e2eFixtureRunTable.firstUserId, userId), eq(e2eFixtureRunTable.secondUserId, userId)))
      .limit(1)
    if (candidate === undefined) return createResult(false)
    const serialized = JSON.stringify(entry)
    if (Buffer.byteLength(serialized, "utf8") > maxEntryBytes)
      return createResultError(op, "The fixture diagnostic exceeds its storage bound.")
    return await databaseTransactionRun(database, async (transaction) => {
      const verified = await e2eFixtureRunOperate(
        transaction,
        config,
        candidate.runId,
        "status",
        new Date(),
        undefined,
        projectRootDirs,
      )
      if (!verified.success || !verified.data.exists || !verified.data.userIds?.includes(userId))
        return createResultError(op, "The fixture diagnostic owner could not be verified.")
      // The sanitizer returns null-prototype objects; Drizzle's entity check requires plain JSON objects.
      const storedEntry = JSON.parse(serialized) as Record<string, unknown>
      await transaction.insert(e2eFixtureDiagnosticTable).values({ runId: candidate.runId, userId, entry: storedEntry })
      const kept = await transaction
        .select({ id: e2eFixtureDiagnosticTable.id })
        .from(e2eFixtureDiagnosticTable)
        .where(eq(e2eFixtureDiagnosticTable.runId, candidate.runId))
        .orderBy(desc(e2eFixtureDiagnosticTable.id))
        .limit(maxEntriesPerRun)
      await transaction.delete(e2eFixtureDiagnosticTable).where(
        and(
          eq(e2eFixtureDiagnosticTable.runId, candidate.runId),
          notInArray(
            e2eFixtureDiagnosticTable.id,
            kept.map((row) => row.id),
          ),
        ),
      )
      return createResult(true)
    })
  } catch (_error) {
    return createResultError(op, "The fixture diagnostic could not be stored.")
  }
}
