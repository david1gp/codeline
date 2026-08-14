import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { configurationStoreCreate } from "../src/configuration/configurationStoreCreate.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { exampleDataSeed } from "../src/database/exampleDataSeed.js"

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

const databaseClient = postgres(databaseUrl)
const database = drizzle(databaseClient, { schema: databaseSchema })
const reset = Bun.argv.includes("--reset")
const result = await exampleDataSeed(database, { configurationStore: configurationStoreResult.data, reset })

if (!result.success) {
  console.error(result.errorMessage)
  await databaseClient.end()
  process.exit(1)
}

console.log(
  `${reset ? "Reset and seeded" : "Seeded"} ${result.data.sessionCount} sessions and ${result.data.messageCount} messages.`,
)
await databaseClient.end()
