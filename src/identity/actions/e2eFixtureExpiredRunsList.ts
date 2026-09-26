import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { asc, lte } from "drizzle-orm"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { e2eFixtureRunTable } from "../db/e2eFixtureRunTable.js"
import { e2eFixtureRunOperate } from "./e2eFixtureRunOperate.js"

/** Only server-aged, fully verified fixture markers are exposed. Page size bounds verification work. */
export async function e2eFixtureExpiredRunsList(
  database: DatabaseClient,
  config: { issuer: string; organizationExternalId: string },
  now = new Date(),
  projectRootDirs: readonly string[] = [],
): Promise<Result<{ runIds: string[] }>> {
  const op = "e2eFixtureExpiredRunsList"
  if (!Number.isFinite(now.getTime())) return createResultError(op, "The fixture clock is invalid.")
  try {
    const rows = await database
      .select({ runId: e2eFixtureRunTable.runId, createdAt: e2eFixtureRunTable.createdAt })
      .from(e2eFixtureRunTable)
      .where(lte(e2eFixtureRunTable.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)))
      .orderBy(asc(e2eFixtureRunTable.createdAt), asc(e2eFixtureRunTable.runId))
      .limit(100)
    for (const row of rows) {
      const verified = await e2eFixtureRunOperate(
        database,
        config,
        row.runId,
        "status",
        now,
        undefined,
        projectRootDirs,
      )
      if (!verified.success || !verified.data.exists || verified.data.createdAt !== row.createdAt.toISOString())
        return createResultError(op, "An expired fixture run ownership could not be verified.")
    }
    return createResult({ runIds: rows.map((row) => row.runId) })
  } catch (_error) {
    return createResultError(op, "Expired fixture run discovery failed.")
  }
}
