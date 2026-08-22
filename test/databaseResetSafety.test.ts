import { expect, test } from "bun:test"
import { managedDatabaseConsumerUnitsRead } from "../scripts/managedDatabaseConsumerUnits.js"

const packageJson = JSON.parse(await Bun.file(new URL("../package.json", import.meta.url)).text()) as {
  scripts: Record<string, string>
}
const resetScript = await Bun.file(new URL("../scripts/dbReset.ts", import.meta.url)).text()
const seedScript = await Bun.file(new URL("../scripts/dbSeed.ts", import.meta.url)).text()
const consumersScript = await Bun.file(new URL("../scripts/managedDatabaseConsumersStop.ts", import.meta.url)).text()
const serviceScript = await Bun.file(new URL("../scripts/managedPostgresServiceEnsure.ts", import.meta.url)).text()
const developmentScript = await Bun.file(new URL("../ops/dev/codeline-dev.sh", import.meta.url)).text()
const apiService = await Bun.file(new URL("../ops/dev/systemd/codeline-dev-api.service", import.meta.url)).text()
const developmentTarget = await Bun.file(new URL("../ops/dev/systemd/codeline-dev.target", import.meta.url)).text()
const installer = await Bun.file(new URL("../ops/dev/systemd/install.sh", import.meta.url)).text()

test("the known managed PostgreSQL consumer inventory remains explicit", () => {
  expect(managedDatabaseConsumerUnitsRead()).toEqual(["codeline-dev-api.service"])
  expect(consumersScript).toContain("managedDatabaseConsumerUnitsRead()")
  expect(consumersScript).toContain('"codeline-dev.target"')
  expect(consumersScript).toContain('"codeline-dev-postgres.service"')
})

test("direct reset and reset-seed use the validated target after consumer stop and service readiness", () => {
  expect(resetScript.indexOf("managedPostgresTargetAssert()")).toBeLessThan(
    resetScript.indexOf("managedDatabaseConsumersStop()"),
  )
  expect(resetScript.indexOf("managedDatabaseConsumersStop()")).toBeLessThan(
    resetScript.indexOf("managedPostgresServiceEnsure()"),
  )
  expect(resetScript.indexOf("managedPostgresServiceEnsure()")).toBeLessThan(
    resetScript.indexOf("postgres(target.data.databaseUrl,"),
  )

  expect(seedScript.indexOf("managedPostgresTargetAssert()")).toBeLessThan(
    seedScript.indexOf("managedDatabaseConsumersStop()"),
  )
  expect(seedScript.indexOf("managedDatabaseConsumersStop()")).toBeLessThan(
    seedScript.indexOf("managedPostgresServiceEnsure()"),
  )
  expect(seedScript.indexOf("managedPostgresServiceEnsure()")).toBeLessThan(
    seedScript.indexOf("databaseUrl = target.data.databaseUrl"),
  )
  expect(seedScript).toContain("postgres(databaseUrl)")

  expect(packageJson.scripts["db:reset"]).toBe("bun scripts/dbReset.ts")
  expect(packageJson.scripts["db:reset-seed"]).toBe(
    "bun run db:reset && bun run db:migrate && bun scripts/dbSeed.ts --reset",
  )
  expect(packageJson.scripts["db:migrate"]).toBe("drizzle-kit migrate --config drizzle.config.ts")
})

test("managed reset workflow starts and verifies PostgreSQL without enabling the full target", () => {
  expect(serviceScript.indexOf('"start", managedPostgresService')).toBeLessThan(
    serviceScript.indexOf('"show", managedPostgresService'),
  )
  expect(serviceScript).toContain('!== "active"')
  expect(apiService).toContain("Requires=codeline-dev-postgres.service")
  expect(developmentTarget).toContain("Requires=codeline-dev-postgres.service")
  expect(installer).toContain("codeline-dev-postgres.container")
  expect(installer).toContain("codeline-dev-postgres.volume")
  expect(installer).not.toMatch(/systemctl --user\s+(?:enable|start|restart)/)
  const resetCommands = developmentScript.slice(
    developmentScript.indexOf("  db-reset)"),
    developmentScript.indexOf("  down|stop)"),
  )
  expect(resetCommands).not.toContain("systemctl_user start codeline-dev-postgres.service")
})
