import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, notInArray } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectTable } from "../../project/db/projectTable.js"
import { e2eCommandProjectTable } from "../db/e2eCommandProjectTable.js"
import { e2eFixtureRunTable } from "../db/e2eFixtureRunTable.js"
import { e2eCommandProjectPathsOperate } from "./e2eCommandProjectPathsOperate.js"

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
    const [foreignProject] = await database
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(
        and(eq(projectTable.path, stored.path), notInArray(projectTable.userId, [run.firstUserId, run.secondUserId])),
      )
      .limit(1)
    if (foreignProject !== undefined) return createResultError(op, "The command project is registered to another user.")
    const checked = await e2eCommandProjectPathsOperate(
      run.runId,
      roots,
      operation === "issue" ? "status" : operation,
      stored,
    )
    if (!checked.success) return checked
    if (operation === "remove") {
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
