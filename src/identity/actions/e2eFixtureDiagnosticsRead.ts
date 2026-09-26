import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq, notInArray } from "drizzle-orm"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { e2eFixtureDiagnosticTable } from "../db/e2eFixtureDiagnosticTable.js"
import { e2eFixtureRunOperate } from "./e2eFixtureRunOperate.js"

export async function e2eFixtureDiagnosticsRead(
  database: DatabaseClient,
  config: { issuer: string; organizationExternalId: string },
  runId: string,
): Promise<Result<{ exists: boolean; entries: Record<string, unknown>[] }>> {
  const op = "e2eFixtureDiagnosticsRead"
  try {
    return await databaseTransactionRun<{ exists: boolean; entries: Record<string, unknown>[] }>(
      database,
      async (transaction) => {
        const verified = await e2eFixtureRunOperate(transaction, config, runId, "status")
        if (!verified.success) return createResultError(op, "The fixture run ownership could not be verified.")
        if (!verified.data.exists) return createResult({ exists: false, entries: [] })
        const [foreign] = await transaction
          .select({ id: e2eFixtureDiagnosticTable.id })
          .from(e2eFixtureDiagnosticTable)
          .where(
            and(
              eq(e2eFixtureDiagnosticTable.runId, runId),
              notInArray(e2eFixtureDiagnosticTable.userId, verified.data.userIds ?? []),
            ),
          )
          .limit(1)
        if (foreign !== undefined) return createResultError(op, "The fixture diagnostic owner could not be verified.")
        const rows = await transaction
          .select({ entry: e2eFixtureDiagnosticTable.entry, userId: e2eFixtureDiagnosticTable.userId })
          .from(e2eFixtureDiagnosticTable)
          .where(eq(e2eFixtureDiagnosticTable.runId, runId))
          .orderBy(asc(e2eFixtureDiagnosticTable.id))
          .limit(128)
        return createResult({ exists: true, entries: rows.map((row) => row.entry) })
      },
    )
  } catch (_error) {
    return createResultError(op, "The fixture diagnostics could not be read.")
  }
}
