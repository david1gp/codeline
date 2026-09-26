import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, or } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectTable } from "../../project/db/projectTable.js"
import { e2eCommandProjectTable } from "../db/e2eCommandProjectTable.js"
import { e2eFixtureRunTable } from "../db/e2eFixtureRunTable.js"
import { e2eCommandProjectPathsOperate } from "./e2eCommandProjectPathsOperate.js"
import { e2eFixtureRunMembersVerify } from "./e2eFixtureRunMembersVerify.js"

type Run = typeof e2eFixtureRunTable.$inferSelect
type Operation = "issue" | "status" | "purge-status" | "remove"

/** Caller must verify the fixture run identity in the same transaction before invoking this operation. */
export async function e2eCommandProjectOperate(
  database: DatabaseExecutor,
  run: Run,
  roots: readonly string[],
  operation: Operation,
  now = new Date(),
  createdPaths: string[] = [],
  createdProject?: { value?: { path: string; createdAt: Date; manifest: Record<string, string> } },
): Promise<Result<{ exists: boolean; path?: string; createdAt?: string }>> {
  const op = "e2eCommandProjectOperate"
  try {
    const [stored] = await database
      .select()
      .from(e2eCommandProjectTable)
      .where(eq(e2eCommandProjectTable.runId, run.runId))
    if (stored === undefined && operation !== "issue") return createResult({ exists: false })
    if (stored === undefined) {
      if (!Number.isFinite(now.getTime()) || now.getTime() < run.createdAt.getTime() - 1000)
        return createResultError(op, "The command project creation time is invalid.")
      const created = await e2eCommandProjectPathsOperate(
        run.runId,
        roots,
        "issue",
        { path: "", createdAt: now, manifest: {} },
        createdPaths,
      )
      if (!created.success) return created
      if (createdProject !== undefined)
        createdProject.value = { path: created.data.path, createdAt: now, manifest: created.data.manifest }
      await database.insert(e2eCommandProjectTable).values({
        runId: run.runId,
        createdAt: now,
        path: created.data.path,
        manifest: created.data.manifest,
      })
      return createResult({ exists: true, path: created.data.path, createdAt: now.toISOString() })
    }
    if (stored.createdAt.getTime() < run.createdAt.getTime() - 1000)
      return createResultError(op, "The command project ownership could not be verified.")
    const registrations = await database
      .select({ id: projectTable.id, userId: projectTable.userId })
      .from(projectTable)
      .where(eq(projectTable.path, stored.path))
    const verifiedUsers = new Set([run.firstUserId, run.secondUserId])
    for (const registration of registrations) {
      if (verifiedUsers.has(registration.userId)) continue
      const owners = await database
        .select()
        .from(e2eFixtureRunTable)
        .where(
          or(
            eq(e2eFixtureRunTable.firstUserId, registration.userId),
            eq(e2eFixtureRunTable.secondUserId, registration.userId),
          ),
        )
        .limit(2)
      if (
        owners.length !== 1 ||
        owners[0]!.runId === run.runId ||
        owners[0]!.issuer !== run.issuer ||
        owners[0]!.organizationId !== run.organizationId ||
        owners[0]!.organizationExternalId !== run.organizationExternalId ||
        !(await e2eFixtureRunMembersVerify(database, owners[0]!))
      )
        return createResultError(op, "The command project is registered to an unverified user.")
      verifiedUsers.add(owners[0]!.firstUserId)
      verifiedUsers.add(owners[0]!.secondUserId)
    }
    const checked = await e2eCommandProjectPathsOperate(
      run.runId,
      roots,
      operation === "issue" ? "status" : operation,
      stored,
    )
    if (!checked.success) return checked
    if (operation === "remove") {
      // Only exact rows checked above are removed. A later purge of the other
      // run still owns its users, sessions and any separate command project.
      for (const registration of registrations) {
        await database
          .delete(projectTable)
          .where(
            and(
              eq(projectTable.id, registration.id),
              eq(projectTable.userId, registration.userId),
              eq(projectTable.path, stored.path),
            ),
          )
      }
      const [remainingRegistration] = await database
        .select({ id: projectTable.id })
        .from(projectTable)
        .where(eq(projectTable.path, stored.path))
        .limit(1)
      if (remainingRegistration !== undefined)
        return createResultError(op, "The command project registrations were not removed.")
      await database.delete(e2eCommandProjectTable).where(eq(e2eCommandProjectTable.runId, run.runId))
      const [remaining] = await database
        .select()
        .from(e2eCommandProjectTable)
        .where(eq(e2eCommandProjectTable.runId, run.runId))
      if (remaining !== undefined) return createResultError(op, "The command project marker was not removed.")
      return createResult({ exists: false })
    }
    return createResult({ exists: true, path: stored.path, createdAt: stored.createdAt.toISOString() })
  } catch (_error) {
    return createResultError(op, "The command project operation failed.")
  }
}
