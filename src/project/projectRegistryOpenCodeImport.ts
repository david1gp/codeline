import { Database } from "bun:sqlite"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../database/databaseClient.js"
import { projectRegistryRepositoryUpsert } from "./db/projectRegistryRepositoryUpsert.js"
import { projectRegistryPathCanonicalize } from "./projectRegistryPathCanonicalize.js"

type OpenCodeDirectoryRow = {
  directory?: unknown
}

type OpenCodeProjectRow = {
  worktree?: unknown
}

function openCodeDirectoryPathsRead(rows: readonly OpenCodeDirectoryRow[]): string[] {
  return rows.flatMap((row) => {
    const value = row.directory
    return typeof value === "string" ? [value] : []
  })
}

function openCodeProjectPathsRead(rows: readonly OpenCodeProjectRow[]): string[] {
  return rows.flatMap((row) => {
    const value = row.worktree
    return typeof value === "string" ? [value] : []
  })
}

function openCodeProjectDirectoryTableMissing(error: unknown): boolean {
  return error instanceof Error && error.message.includes("no such table: project_directory")
}

function projectRegistryOpenCodeSourcePathsRead(openCodeDatabasePath: string): Result<string[]> {
  const op = "projectRegistryOpenCodeSourcePathsRead"
  let database: Database | undefined

  try {
    database = new Database(path.resolve(openCodeDatabasePath), { readonly: true })
    let directoryRows: OpenCodeDirectoryRow[] = []
    try {
      directoryRows = database.query("SELECT directory FROM project_directory").all() as OpenCodeDirectoryRow[]
    } catch (error: unknown) {
      if (!openCodeProjectDirectoryTableMissing(error)) throw error
    }
    if (directoryRows.length > 0) return createResult(openCodeDirectoryPathsRead(directoryRows))

    const projectRows = database
      .query("SELECT worktree FROM project WHERE id <> 'global'")
      .all() as OpenCodeProjectRow[]
    return createResult(openCodeProjectPathsRead(projectRows))
  } catch (_error) {
    return createResultError(op, "The OpenCode project metadata could not be read.")
  } finally {
    try {
      database?.close()
    } catch (_error) {
      // The source database is read-only and its connection cleanup is best effort.
    }
  }
}

export async function projectRegistryOpenCodeImport(
  database: DatabaseClient,
  userId: string,
  openCodeDatabasePath: string,
  rootDirs: readonly string[],
): Promise<Result<{ importedCount: number }>> {
  const op = "projectRegistryOpenCodeImport"
  if (typeof openCodeDatabasePath !== "string" || openCodeDatabasePath.trim().length === 0) {
    return createResultError(op, "The OpenCode project database path is not configured.")
  }

  const sourcePaths = projectRegistryOpenCodeSourcePathsRead(openCodeDatabasePath)
  if (!sourcePaths.success) return createResultError(op, "The OpenCode project metadata could not be read.")

  const canonicalPaths = new Set<string>()
  for (const sourcePath of sourcePaths.data) {
    const canonical = await projectRegistryPathCanonicalize(sourcePath, rootDirs)
    if (canonical.success) canonicalPaths.add(canonical.data)
  }

  for (const projectPath of canonicalPaths) {
    const upserted = await projectRegistryRepositoryUpsert(database, userId, { path: projectPath }, undefined, rootDirs)
    if (!upserted.success) return createResultError(op, "The imported projects could not be saved.")
  }

  return createResult({ importedCount: canonicalPaths.size })
}
