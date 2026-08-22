import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { configurationStoreCreate } from "../src/configuration/configurationStoreCreate.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { exampleDataSeed } from "../src/database/exampleDataSeed.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"
import { managedDatabaseConsumersStop } from "./managedDatabaseConsumersStop.js"
import { managedDatabaseResetLockRun } from "./managedDatabaseResetLockRun.js"
import { managedPostgresServiceEnsure } from "./managedPostgresServiceEnsure.js"
import { managedPostgresTargetAssert } from "./managedPostgresTargetAssert.js"

const configuredDatabaseUrl = Bun.env.DATABASE_URL
if (configuredDatabaseUrl === undefined) {
  console.error("DATABASE_URL is required.")
  process.exit(1)
}

const configurationStoreDir = Bun.env.CONFIG_STORE_DIR
if (configurationStoreDir === undefined) {
  console.error("CONFIG_STORE_DIR is required.")
  process.exit(1)
}

const organizationExternalId = Bun.env.ZITADEL_ORGANIZATION_ID
if (organizationExternalId === undefined || organizationExternalId.trim().length === 0) {
  console.error("ZITADEL_ORGANIZATION_ID is required to seed the Contentoren organization.")
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

let databaseUrl = configuredDatabaseUrl
if (reset) {
  const target = managedPostgresTargetAssert()
  if (!target.success) {
    console.error(target.errorMessage)
    process.exit(1)
  }
  const consumers = managedDatabaseConsumersStop()
  if (!consumers.success) {
    console.error(consumers.errorMessage)
    process.exit(1)
  }
  const service = managedPostgresServiceEnsure()
  if (!service.success) {
    console.error(service.errorMessage)
    process.exit(1)
  }
  databaseUrl = target.data.databaseUrl
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

const databaseClient = postgres(databaseUrl)
const database = drizzle(databaseClient, { schema: databaseSchema })
const result = await exampleDataSeed(database, {
  catalog: catalogResult.data,
  configurationStore: configurationStoreResult.data,
  organizationExternalId,
  reset,
})

if (!result.success) {
  console.error(result.errorMessage)
  await databaseClient.end()
  process.exit(1)
}

console.log(
  `${reset ? "Reset and seeded" : "Seeded"} ${result.data.sessionCount} sessions and ${result.data.messageCount} messages.`,
)
await databaseClient.end()
