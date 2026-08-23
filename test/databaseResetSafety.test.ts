import { expect, test } from "bun:test"
import { managedDatabaseConsumerUnitsRead } from "../scripts/managedDatabaseConsumerUnits.js"

const packageJson = JSON.parse(await Bun.file(new URL("../package.json", import.meta.url)).text()) as {
  scripts: Record<string, string>
}
const resetScript = await Bun.file(new URL("../scripts/dbReset.ts", import.meta.url)).text()
const seedScript = await Bun.file(new URL("../scripts/dbSeed.ts", import.meta.url)).text()
const resetLockScript = await Bun.file(new URL("../scripts/managedDatabaseResetLockRun.ts", import.meta.url)).text()
const consumersScript = await Bun.file(new URL("../scripts/managedDatabaseConsumersStop.ts", import.meta.url)).text()

test("the known managed consumer inventory remains explicit", () => {
  expect(managedDatabaseConsumerUnitsRead()).toEqual(["codeline-dev-api.service"])
  expect(consumersScript).toContain("managedDatabaseConsumerUnitsRead()")
  expect(consumersScript).toContain('"codeline-dev.target"')
  expect(consumersScript).not.toContain("codeline-dev-postgres.service")
})

test("direct reset stops consumers before deleting the SQLite database and sidecars", () => {
  expect(resetScript).not.toContain("managedPostgresTargetAssert")
  expect(resetScript).not.toContain("managedPostgresServiceEnsure")
  expect(resetScript).not.toContain("postgres(")
  expect(resetScript.indexOf("managedDatabaseConsumersStop()")).toBeLessThan(resetScript.indexOf("await rm("))
  expect(resetScript).toContain("databasePath")
  expect(resetScript).toMatch(/`\$\{databaseFilePath\}-wal`/)
  expect(resetScript).toMatch(/`\$\{databaseFilePath\}-shm`/)

  expect(packageJson.scripts["db:reset"]).toBe("bun scripts/dbReset.ts")
  expect(packageJson.scripts["db:seed"]).toContain("bun scripts/managedDatabaseResetLockRun.ts --")
  expect(packageJson.scripts["db:seed"]).toContain("bun run db:migrate")
  expect(packageJson.scripts["db:seed"]).toContain('bun scripts/dbSeed.ts "$@"')
  expect(packageJson.scripts["db:reset-seed"]).toContain("bun scripts/managedDatabaseResetLockRun.ts --")
  expect(packageJson.scripts["db:reset-seed"]).toContain("bun run db:migrate")
  expect(packageJson.scripts["db:reset-seed"]).toContain("bun scripts/dbSeed.ts --reset")
  expect(packageJson.scripts["db:migrate"]).toBe("bun scripts/dbMigrate.ts")
})

test("reset workflows use a nonblocking managed-database lock", () => {
  expect(resetLockScript).not.toContain("managedPostgresTargetAssert")
  expect(resetLockScript).toContain('"managed-sqlite"')
  expect(resetLockScript).toContain("path.resolve(databaseFilePath)")
  expect(resetLockScript).toContain('"--nonblock"')
  expect(resetLockScript).toContain('"--conflict-exit-code"')
  expect(resetLockScript).toContain("Another managed database reset/bootstrap command")
  expect(resetLockScript).toContain("CODELINE_MANAGED_DATABASE_RESET_LOCK_HELD")
  expect(resetScript).toContain("managedDatabaseResetLockRun(")
  expect(seedScript).toContain("managedDatabaseResetLockRun(")
})
