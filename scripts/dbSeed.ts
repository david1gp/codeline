import { drizzle } from "drizzle-orm/postgres-js"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import postgres from "postgres"
import { configurationStoreCreate } from "../src/configuration/configurationStoreCreate.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { exampleDataSeed } from "../src/database/exampleDataSeed.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"

const databaseUrl = Bun.env.DATABASE_URL
if (databaseUrl === undefined) {
  console.error("DATABASE_URL is required.")
  process.exit(1)
}

const configurationStoreDir = Bun.env.CONFIG_STORE_DIR
if (configurationStoreDir === undefined) {
  console.error("CONFIG_STORE_DIR is required.")
  process.exit(1)
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
const reset = Bun.argv.includes("--reset")
const userId = Bun.env.EXAMPLE_DATA_USER_ID
const result = await exampleDataSeed(database, {
  catalog: catalogResult.data,
  configurationStore: configurationStoreResult.data,
  reset,
  ...(userId === undefined ? {} : { userId }),
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
