import { rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { databasePath } from "../src/database/databasePath.js"
import { managedDatabaseConsumersStop } from "./managedDatabaseConsumersStop.js"
import { managedDatabaseResetLockRun } from "./managedDatabaseResetLockRun.js"

const argumentsList = Bun.argv.slice(2)
if (argumentsList.length > 0) {
  console.error("Usage: bun scripts/dbReset.ts")
  process.exit(1)
}

if (Bun.env.CODELINE_MANAGED_DATABASE_RESET_LOCK_HELD !== "1") {
  const lock = await managedDatabaseResetLockRun([process.execPath, fileURLToPath(import.meta.url), ...argumentsList])
  if (!lock.success) {
    console.error(lock.errorMessage)
    process.exit(1)
  }
  process.exit(lock.data)
}

const consumers = managedDatabaseConsumersStop()
if (!consumers.success) {
  console.error(consumers.errorMessage)
  process.exit(1)
}

const databaseFilePath = path.resolve(databasePath)
try {
  for (const filePath of [databaseFilePath, `${databaseFilePath}-wal`, `${databaseFilePath}-shm`]) {
    await rm(filePath, { force: true })
  }
  console.log("Reset SQLite development database.")
} catch (error) {
  console.error(error instanceof Error ? error.message : "SQLite reset failed.")
  process.exitCode = 1
}
