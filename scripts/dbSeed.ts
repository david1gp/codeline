import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/libsql"
import { configurationStoreCreate } from "../src/configuration/configurationStoreCreate.js"
import { databasePath } from "../src/database/databasePath.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { exampleDataSeed } from "../src/database/exampleDataSeed.js"
import { openLibsql } from "../src/database/openLibsql.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"
import { managedDatabaseConsumersStop } from "./managedDatabaseConsumersStop.js"
import { managedDatabaseResetLockRun } from "./managedDatabaseResetLockRun.js"
import { oidcEnvironmentConfigurationResolve } from "./oidcEnvironmentConfigurationResolve.js"

const configurationStoreDir = Bun.env.CONFIG_STORE_DIR
if (configurationStoreDir === undefined) {
  console.error("CONFIG_STORE_DIR is required.")
  process.exit(1)
}

const environment = oidcEnvironmentConfigurationResolve()
if (!environment.success) {
  console.error(environment.errorMessage)
  process.exit(1)
}
const { issuer, organizationExternalId } = environment.data
const userId = Bun.env.EXAMPLE_DATA_USER_ID
const organizationMembershipSubject = Bun.env.EXAMPLE_DATA_SUBJECT

if (
  (userId === undefined) !== (organizationMembershipSubject === undefined) ||
  (userId !== undefined && (issuer === undefined || organizationMembershipSubject === undefined))
) {
  console.error(
    "EXAMPLE_DATA_USER_ID and EXAMPLE_DATA_SUBJECT must be set together; the pair requires a configured OIDC issuer.",
  )
  process.exit(1)
}

const reset = Bun.argv.includes("--reset")

if (reset && Bun.env.CODELINE_MANAGED_DATABASE_RESET_LOCK_HELD !== "1") {
  const lock = await managedDatabaseResetLockRun([
    process.execPath,
    fileURLToPath(import.meta.url),
    ...Bun.argv.slice(2),
  ])
  if (!lock.success) {
    console.error(lock.errorMessage)
    process.exit(1)
  }
  process.exit(lock.data)
}

if (reset) {
  const consumers = managedDatabaseConsumersStop()
  if (!consumers.success) {
    console.error(consumers.errorMessage)
    process.exit(1)
  }
}

const configurationStoreResult = await configurationStoreCreate({
  authorEmail: Bun.env.CONFIG_STORE_AUTHOR_EMAIL ?? Bun.env.DEVELOPMENT_IDENTITY_EMAIL ?? "codeline@example.test",
  authorName: Bun.env.CONFIG_STORE_AUTHOR_NAME ?? Bun.env.DEVELOPMENT_IDENTITY_DISPLAY_NAME ?? "Codeline",
  branch: Bun.env.CONFIG_STORE_BRANCH ?? "main",
  dir: configurationStoreDir,
})
if (!configurationStoreResult.success) {
  console.error(configurationStoreResult.errorMessage)
  process.exit(1)
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const catalogResult = await providerAgentCatalogLoad(repositoryRoot)
if (!catalogResult.success) {
  console.error(catalogResult.errorMessage)
  process.exit(1)
}

const openedDatabase = openLibsql(databasePath)
const database = drizzle(openedDatabase.$client, { schema: databaseSchema })
const result = await exampleDataSeed(database, {
  catalog: catalogResult.data,
  configurationStore: configurationStoreResult.data,
  organizationExternalId,
  reset,
  ...(userId === undefined ? {} : { userId }),
  ...(userId === undefined || issuer === undefined ? {} : { organizationMembershipIssuer: issuer }),
  ...(userId === undefined || organizationMembershipSubject === undefined ? {} : { organizationMembershipSubject }),
})

if (!result.success) {
  console.error(result.errorMessage)
  database.$client.close()
  process.exit(1)
}

console.log(
  `${reset ? "Reset and seeded" : "Seeded"} ${result.data.sessionCount} sessions and ${result.data.messageCount} messages.`,
)
database.$client.close()
