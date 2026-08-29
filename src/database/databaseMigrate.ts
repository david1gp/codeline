import { fileURLToPath } from "node:url"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"
import { projectRegistrySessionPathBackfill } from "../project/db/projectRegistrySessionPathBackfill.js"
import { projectRegistrySessionPathBackfillTable } from "../project/db/projectRegistrySessionPathBackfillTable.js"
import { projectFolderAssignmentBackfill } from "../project/db/projectFolderAssignmentBackfill.js"
import { projectFolderAssignmentBackfillTable } from "../project/db/projectFolderAssignmentBackfillTable.js"
import type { DatabaseClient } from "./databaseClient.js"
import { databasePath } from "./databasePath.js"
import { databaseSchema } from "./databaseSchema.js"
import { databaseTransactionRun } from "./databaseTransactionRun.js"
import { openLibsql } from "./openLibsql.js"

const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url))
const projectRegistrySessionPathBackfillMarkerId = "session-project-paths"
const projectFolderAssignmentBackfillMarkerId = "project-folder-assignments"

type DatabaseMigrateOptions = {
  projectRootDirs?: readonly string[]
}

export async function databaseMigrate(
  filePath = databasePath,
  options: DatabaseMigrateOptions = {},
): Promise<Result<void>> {
  const op = "databaseMigrate"
  let database: ReturnType<typeof openLibsql> | undefined
  let result: Result<void>

  try {
    database = openLibsql(filePath)
    await migrate(database, { migrationsFolder })
    const typedDatabase = drizzle(database.$client, { schema: databaseSchema }) as DatabaseClient
    const backfilled = await projectRegistrySessionPathBackfillRun(typedDatabase, options.projectRootDirs)
    if (!backfilled.success) {
      result = backfilled
    } else {
      result = await projectFolderAssignmentBackfillRun(typedDatabase, options.projectRootDirs ?? [])
    }
  } catch (_error) {
    result = createResultError(op, "The database migrations could not be applied.")
  }

  if (database !== undefined) {
    try {
      database.$client.close()
    } catch (_error) {
      return createResultError(op, "The database client could not be closed.")
    }
  }

  return result
}

async function projectFolderAssignmentBackfillRun(
  database: DatabaseClient,
  rootDirs: readonly string[],
): Promise<Result<void>> {
  return await databaseTransactionRun(database, async (transaction) => {
    const [marker] = await transaction
      .select({ id: projectFolderAssignmentBackfillTable.id })
      .from(projectFolderAssignmentBackfillTable)
      .where(eq(projectFolderAssignmentBackfillTable.id, projectFolderAssignmentBackfillMarkerId))
      .limit(1)
    if (marker !== undefined) return createResult(undefined)

    const backfilled = await projectFolderAssignmentBackfill(transaction, rootDirs)
    if (!backfilled.success) return backfilled

    await transaction
      .insert(projectFolderAssignmentBackfillTable)
      .values({ id: projectFolderAssignmentBackfillMarkerId })
    return createResult(undefined)
  })
}

async function projectRegistrySessionPathBackfillRun(
  database: DatabaseClient,
  rootDirs: readonly string[] | undefined,
): Promise<Result<void>> {
  if (rootDirs === undefined || rootDirs.length === 0) return createResult(undefined)

  return await databaseTransactionRun(database, async (transaction) => {
    const [marker] = await transaction
      .select({ id: projectRegistrySessionPathBackfillTable.id })
      .from(projectRegistrySessionPathBackfillTable)
      .where(eq(projectRegistrySessionPathBackfillTable.id, projectRegistrySessionPathBackfillMarkerId))
      .limit(1)
    if (marker !== undefined) return createResult(undefined)

    const backfilled = await projectRegistrySessionPathBackfill(transaction, rootDirs)
    if (!backfilled.success) return backfilled

    await transaction.insert(projectRegistrySessionPathBackfillTable).values({
      id: projectRegistrySessionPathBackfillMarkerId,
    })
    return createResult(undefined)
  })
}
